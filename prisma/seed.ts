
import dotenv from 'dotenv';
dotenv.config({ path: require('path').resolve(__dirname, '../.env') }); // Ensure .env at project root is loaded

import prisma from '../src/lib/prisma';
import {
  mockPermissions as seedPermissionsData,
  mockRoles as seedRolesData, // This will be updated with new permissions
  mockVLANs as seedVLANsData,
  mockSubnets as seedSubnetsData,
  mockIPAddresses as seedIPsData, // This will be updated with new fields
  mockAuditLogs as seedAuditLogsData,
  ADMIN_ROLE_ID as SEED_ADMIN_ROLE_ID,
  OPERATOR_ROLE_ID as SEED_OPERATOR_ROLE_ID,
  VIEWER_ROLE_ID as SEED_VIEWER_ROLE_ID,
  mockOperatorDictionaries, // New import
  mockLocalDeviceDictionaries, // New import
  mockPaymentSourceDictionaries, // New import
} from '../src/lib/data'; // data.ts will also need updates
import type { PermissionId as AppPermissionId, User as AppUser, IPAddressStatus as AppIPAddressStatusType } from '../src/types';
// Removed Device related types
import { Prisma } from '@prisma/client';

async function main() {
  console.log('Start seeding ...');
  console.log(`[Seed Script] Attempting to use ENCRYPTION_KEY starting with: ${process.env.ENCRYPTION_KEY ? process.env.ENCRYPTION_KEY.substring(0, 5) + '...' : 'NOT SET'}`);


  console.log('Seeding Permissions...');
  // Permissions are defined in data.ts, which will be updated by changing types/index.ts PERMISSIONS object
  // Ensure mockPermissions in data.ts reflects the new permission set from types/index.ts
  for (const p of seedPermissionsData) {
    await prisma.permission.upsert({
      where: { id: p.id as string },
      update: { name: p.name, group: p.group, description: p.description },
      create: {
        id: p.id as string,
        name: p.name,
        group: p.group,
        description: p.description,
      },
    });
  }
  console.log('Permissions seeded.');

  console.log('Seeding Roles (Pass 1: Create roles without permissions)...');
  for (const roleData of seedRolesData) {
    const prismaRoleName = roleData.name as string;
    const conflictingRoleByName = await prisma.role.findFirst({
      where: { name: roleData.name, NOT: { id: roleData.id } },
    });
    if (conflictingRoleByName) {
      console.warn(`Conflict: Role name "${roleData.name}" (intended for ID ${roleData.id}) is already used by role ID ${conflictingRoleByName.id}.`);
      const usersWithConflictingRole = await prisma.user.count({ where: { roleId: conflictingRoleByName.id } });
      if (usersWithConflictingRole > 0) {
        throw new Error(`Cannot automatically resolve role seed conflict for name "${roleData.name}". This name is used by role ID ${conflictingRoleByName.id}, which is assigned to ${usersWithConflictingRole} user(s). Please manually reassign these users or reset the database.`);
      } else {
        console.warn(`Conflicting role (ID: ${conflictingRoleByName.id}, Name: ${roleData.name}) is not used. Deleting it.`);
        try { await prisma.role.update({ where: { id: conflictingRoleByName.id }, data: { permissions: { set: [] } } }); } catch (e) { /* ignore if no perms */ }
        await prisma.role.delete({ where: { id: conflictingRoleByName.id } });
      }
    }
    await prisma.role.upsert({
      where: { id: roleData.id },
      update: { name: prismaRoleName, description: roleData.description },
      create: { id: roleData.id, name: prismaRoleName, description: roleData.description },
    });
  }
  console.log('Roles seeded (Pass 1 complete).');

  console.log('Updating Roles (Pass 2: Connect permissions)...');
  const allDbPermissions = await prisma.permission.findMany({ select: { id: true } });

  for (const roleData of seedRolesData) {
    let permissionsToSet: { id: string }[];
    if (roleData.id === SEED_ADMIN_ROLE_ID) {
      console.log(`Assigning all ${allDbPermissions.length} DB permissions to Administrator role.`);
      permissionsToSet = allDbPermissions.map(p => ({ id: p.id }));
    } else {
      // For Operator and Viewer, use permissions defined in src/lib/data.ts's mockRoles
      // Ensure mockRoles in data.ts is updated to reflect the new permission structure
      permissionsToSet = roleData.permissions.map(appPermId => ({ id: appPermId as string }));
    }
    await prisma.role.update({
      where: { id: roleData.id },
      data: { permissions: { set: permissionsToSet } },
    });
  }
  console.log('Roles updated with permissions (Pass 2 complete).');

  const initialUsersToSeed: Array<Omit<AppUser, 'roleName' | 'lastLogin' | 'avatar' | 'permissions'> & { password: string; avatarPath: string }> = [
    { id: 'seed_user_admin', username: 'admin', email: 'admin@example.com', roleId: SEED_ADMIN_ROLE_ID, password: 'admin', avatarPath: '/images/avatars/admin_avatar.png' },
    { id: 'seed_user_operator', username: 'operator', email: 'operator@example.com', roleId: SEED_OPERATOR_ROLE_ID, password: 'operator', avatarPath: '/images/avatars/operator_avatar.png' },
    { id: 'seed_user_viewer', username: 'viewer', email: 'viewer@example.com', roleId: SEED_VIEWER_ROLE_ID, password: 'viewer', avatarPath: '/images/avatars/viewer_avatar.png' },
  ];
  console.log('Seeding Users...');
  for (const userData of initialUsersToSeed) {
    await prisma.user.upsert({
      where: { email: userData.email },
      update: { id: userData.id, username: userData.username, password: userData.password, roleId: userData.roleId, avatar: userData.avatarPath, lastLogin: new Date() },
      create: { id: userData.id, username: userData.username, email: userData.email, password: userData.password, roleId: userData.roleId, avatar: userData.avatarPath, lastLogin: new Date() },
    });
  }
  console.log('Users seeded.');

  console.log('Seeding VLANs...');
  for (const vlanData of seedVLANsData) {
    // ... (VLAN seeding logic remains similar, check for conflicts)
     const conflictingVlan = await prisma.vLAN.findFirst({ where: { vlanNumber: vlanData.vlanNumber, NOT: { id: vlanData.id } } });
    if (conflictingVlan) {
      console.warn(`Conflict: VLAN number ${vlanData.vlanNumber} (intended for ID ${vlanData.id}) is already used by VLAN ID ${conflictingVlan.id}.`);
      const subnetsUsing = await prisma.subnet.count({ where: { vlanId: conflictingVlan.id } });
      const ipsUsing = await prisma.iPAddress.count({ where: { directVlanId: conflictingVlan.id } });
      if (subnetsUsing > 0 || ipsUsing > 0) {
        throw new Error(`Cannot resolve VLAN seed conflict for VLAN number ${vlanData.vlanNumber}. It's used by ${subnetsUsing} subnets and ${ipsUsing} IPs. Please manually clean up or reset DB.`);
      } else {
        console.warn(`Conflicting VLAN ID ${conflictingVlan.id} (Number: ${vlanData.vlanNumber}) is unused. Deleting it.`);
        await prisma.vLAN.delete({ where: { id: conflictingVlan.id } });
      }
    }
    await prisma.vLAN.upsert({
      where: { id: vlanData.id },
      update: { vlanNumber: vlanData.vlanNumber, name: vlanData.name, description: vlanData.description },
      create: { id: vlanData.id, vlanNumber: vlanData.vlanNumber, name: vlanData.name, description: vlanData.description },
    });
  }
  console.log('VLANs seeded.');

  console.log('Seeding Subnets...');
  for (const subnetData of seedSubnetsData) {
    // ... (Subnet seeding logic remains similar, check for conflicts)
    const conflictingSubnet = await prisma.subnet.findFirst({ where: { cidr: subnetData.cidr, NOT: { id: subnetData.id } } });
    if (conflictingSubnet) {
      console.warn(`Conflict: Subnet CIDR ${subnetData.cidr} (intended for ID ${subnetData.id}) is already used by Subnet ID ${conflictingSubnet.id}.`);
      const ipsInConflicting = await prisma.iPAddress.count({ where: { subnetId: conflictingSubnet.id } });
      if (ipsInConflicting > 0) {
        throw new Error(`Cannot resolve Subnet seed conflict for CIDR ${subnetData.cidr}. It has ${ipsInConflicting} associated IPs. Please manually clean up or reset DB.`);
      } else {
        console.warn(`Conflicting Subnet ID ${conflictingSubnet.id} (CIDR: ${subnetData.cidr}) has no IPs. Deleting it.`);
        await prisma.subnet.delete({ where: { id: conflictingSubnet.id } });
      }
    }
    await prisma.subnet.upsert({
      where: { id: subnetData.id },
      update: {
        cidr: subnetData.cidr,
        networkAddress: subnetData.networkAddress,
        subnetMask: subnetData.subnetMask,
        ipRange: subnetData.ipRange,
        name: subnetData.name,
        dhcpEnabled: subnetData.dhcpEnabled,
        description: subnetData.description,
        vlanId: subnetData.vlanId,
      },
      create: {
        id: subnetData.id,
        cidr: subnetData.cidr,
        networkAddress: subnetData.networkAddress,
        subnetMask: subnetData.subnetMask,
        ipRange: subnetData.ipRange,
        name: subnetData.name,
        dhcpEnabled: subnetData.dhcpEnabled,
        description: subnetData.description,
        vlanId: subnetData.vlanId,
      },
    });
  }
  console.log('Subnets seeded.');

  console.log('Seeding IP Addresses (with new optional fields)...');
  for (const ipData of seedIPsData) { // seedIPsData will need to be updated in data.ts
    await prisma.iPAddress.upsert({
      where: { id: ipData.id },
      update: {
        ipAddress: ipData.ipAddress,
        status: ipData.status as string,
        isGateway: ipData.isGateway,
        allocatedTo: ipData.allocatedTo,
        usageUnit: ipData.usageUnit,
        contactPerson: ipData.contactPerson,
        phone: ipData.phone,
        description: ipData.description,
        subnetId: ipData.subnetId,
        directVlanId: ipData.directVlanId,
        // New fields
        selectedOperatorName: ipData.selectedOperatorName || null,
        selectedOperatorDevice: ipData.selectedOperatorDevice || null,
        selectedAccessType: ipData.selectedAccessType || null,
        selectedLocalDeviceName: ipData.selectedLocalDeviceName || null,
        selectedDevicePort: ipData.selectedDevicePort || null,
        selectedPaymentSource: ipData.selectedPaymentSource || null,
      },
      create: {
        id: ipData.id,
        ipAddress: ipData.ipAddress,
        status: ipData.status as string,
        isGateway: ipData.isGateway,
        allocatedTo: ipData.allocatedTo,
        usageUnit: ipData.usageUnit,
        contactPerson: ipData.contactPerson,
        phone: ipData.phone,
        description: ipData.description,
        subnetId: ipData.subnetId,
        directVlanId: ipData.directVlanId,
        // New fields
        selectedOperatorName: ipData.selectedOperatorName || null,
        selectedOperatorDevice: ipData.selectedOperatorDevice || null,
        selectedAccessType: ipData.selectedAccessType || null,
        selectedLocalDeviceName: ipData.selectedLocalDeviceName || null,
        selectedDevicePort: ipData.selectedDevicePort || null,
        selectedPaymentSource: ipData.selectedPaymentSource || null,
      },
    });
  }
  console.log('IP Addresses seeded.');

  // Seeding for New Dictionaries
  console.log('Seeding Operator Dictionaries...');
  for (const opData of mockOperatorDictionaries) { // Use new mock data
    await prisma.operatorDictionary.upsert({
      where: { operatorName: opData.operatorName }, // Assuming operatorName is unique
      update: opData,
      create: opData,
    });
  }
  console.log('Operator Dictionaries seeded.');

  console.log('Seeding Local Device Dictionaries...');
  for (const ldData of mockLocalDeviceDictionaries) { // Use new mock data
    await prisma.localDeviceDictionary.upsert({
      where: { deviceName: ldData.deviceName }, // Assuming deviceName is unique
      update: ldData,
      create: ldData,
    });
  }
  console.log('Local Device Dictionaries seeded.');

  console.log('Seeding Payment Source Dictionaries...');
  for (const psData of mockPaymentSourceDictionaries) { // Use new mock data
    await prisma.paymentSourceDictionary.upsert({
      where: { sourceName: psData.sourceName }, // Assuming sourceName is unique
      update: psData,
      create: psData,
    });
  }
  console.log('Payment Source Dictionaries seeded.');

  // Removed ISP, Device, DeviceConnection seeding

  console.log('Seeding Audit Logs...');
  for (const logData of seedAuditLogsData) {
    const userToLink = initialUsersToSeed.find(u => u.username === logData.username);
    const validUserId = userToLink ? userToLink.id : undefined;
    const validUsername = userToLink ? userToLink.username : logData.username;
    const existingLog = await prisma.auditLog.findUnique({ where: { id: logData.id } });
    if (!existingLog) {
      await prisma.auditLog.create({
        data: {
          id: logData.id, // AuditLog ID is now auto-generated by @default(cuid())
          userId: validUserId,
          username: validUsername,
          action: logData.action,
          details: logData.details,
          timestamp: logData.timestamp ? new Date(logData.timestamp) : new Date(),
        },
      });
    } else { // If log exists, update it - useful if seed script is re-run
        await prisma.auditLog.update({
            where: {id: logData.id},
            data: {
                userId: validUserId,
                username: validUsername,
                action: logData.action,
                details: logData.details,
                timestamp: logData.timestamp ? new Date(logData.timestamp) : new Date(),
            }
        });
    }
  }
  console.log('Audit Logs seeded.');

  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

    
