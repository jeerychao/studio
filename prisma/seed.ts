
import dotenv from 'dotenv';
dotenv.config({ path: require('path').resolve(__dirname, '../.env') }); // Ensure .env at project root is loaded

import prisma from '../src/lib/prisma';
import {
  mockPermissions as seedPermissionsData,
  mockRoles as seedRolesData,
  mockVLANs as seedVLANsData,
  mockSubnets as seedSubnetsData,
  mockIPAddresses as seedIPsData,
  mockAuditLogs as seedAuditLogsData,
  ADMIN_ROLE_ID as SEED_ADMIN_ROLE_ID,
  OPERATOR_ROLE_ID as SEED_OPERATOR_ROLE_ID,
  VIEWER_ROLE_ID as SEED_VIEWER_ROLE_ID,
  mockOperatorDictionaries,
  mockLocalDeviceDictionaries,
  mockPaymentSourceDictionaries,
  mockAccessTypeDictionaries, // Import new mock data
} from '../src/lib/data';
import type { PermissionId as AppPermissionId, User as AppUser, IPAddressStatus as AppIPAddressStatusType } from '../src/types';
import { Prisma } from '@prisma/client';
import { encrypt } from '../src/app/api/auth/[...nextauth]/route';

async function main() {
  console.log('Start seeding ...');
  console.log(`[Seed Script] Attempting to use ENCRYPTION_KEY starting with: ${process.env.ENCRYPTION_KEY ? process.env.ENCRYPTION_KEY.substring(0, 5) + '...' : 'NOT SET'}`);

  console.log('Seeding Permissions...');
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
      permissionsToSet = roleData.permissions.map(appPermId => ({ id: appPermId as string }));
    }
    await prisma.role.update({
      where: { id: roleData.id },
      data: { permissions: { set: permissionsToSet } },
    });
  }
  console.log('Roles updated with permissions (Pass 2 complete).');

  const initialUsersToSeedPlain: Array<Omit<AppUser, 'roleName' | 'lastLogin' | 'avatar' | 'permissions'> & { password_plain: string; phone_plain?: string; avatarPath: string }> = [
    { id: 'seed_user_admin', username: 'admin', email: 'admin@example.com', roleId: SEED_ADMIN_ROLE_ID, password_plain: 'admin', phone_plain: '11111111111', avatarPath: '/images/avatars/admin_avatar.png' },
    { id: 'seed_user_operator', username: 'operator', email: 'operator@example.com', roleId: SEED_OPERATOR_ROLE_ID, password_plain: 'operator', phone_plain: '22222222222', avatarPath: '/images/avatars/operator_avatar.png' },
    { id: 'seed_user_viewer', username: 'viewer', email: 'viewer@example.com', roleId: SEED_VIEWER_ROLE_ID, password_plain: 'viewer', phone_plain: '33333333333', avatarPath: '/images/avatars/viewer_avatar.png' },
  ];

  console.log('Seeding Users...');
  for (const userData of initialUsersToSeedPlain) {
    const encryptedPassword = encrypt(userData.password_plain);
    // Store phone number in plaintext
    const plainPhone = userData.phone_plain || null;

    await prisma.user.upsert({
      where: { email: userData.email },
      update: { 
        id: userData.id, 
        username: userData.username, 
        password: encryptedPassword, 
        phone: plainPhone, // Store plaintext phone
        roleId: userData.roleId, 
        avatar: userData.avatarPath, 
        lastLogin: new Date() 
      },
      create: { 
        id: userData.id, 
        username: userData.username, 
        email: userData.email, 
        password: encryptedPassword, 
        phone: plainPhone, // Store plaintext phone
        roleId: userData.roleId, 
        avatar: userData.avatarPath, 
        lastLogin: new Date() 
      },
    });
  }
  console.log('Users seeded.');

  console.log('Seeding VLANs...');
  for (const vlanData of seedVLANsData) {
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
  for (const ipData of seedIPsData) { 
    const phone = ipData.phone || null;

    await prisma.iPAddress.upsert({
      where: { id: ipData.id },
      update: {
        ipAddress: ipData.ipAddress,
        status: ipData.status as string,
        isGateway: ipData.isGateway,
        allocatedTo: ipData.allocatedTo,
        usageUnit: ipData.usageUnit,
        contactPerson: ipData.contactPerson,
        phone: phone, 
        description: ipData.description,
        subnetId: ipData.subnetId,
        directVlanId: ipData.directVlanId,
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
        phone: phone, 
        description: ipData.description,
        subnetId: ipData.subnetId,
        directVlanId: ipData.directVlanId,
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

  console.log('Seeding Operator Dictionaries...');
  for (const opData of mockOperatorDictionaries) {
    const { ...restOfOpData } = opData; // No accessType to remove
    await prisma.operatorDictionary.upsert({
      where: { operatorName: restOfOpData.operatorName },
      update: restOfOpData,
      create: restOfOpData,
    });
  }
  console.log('Operator Dictionaries seeded.');

  console.log('Seeding Local Device Dictionaries...');
  for (const ldData of mockLocalDeviceDictionaries) {
    await prisma.localDeviceDictionary.upsert({
      where: { deviceName: ldData.deviceName },
      update: ldData,
      create: ldData,
    });
  }
  console.log('Local Device Dictionaries seeded.');

  console.log('Seeding Payment Source Dictionaries...');
  for (const psData of mockPaymentSourceDictionaries) {
    await prisma.paymentSourceDictionary.upsert({
      where: { sourceName: psData.sourceName },
      update: psData,
      create: psData,
    });
  }
  console.log('Payment Source Dictionaries seeded.');

  console.log('Seeding Access Type Dictionaries...'); // New seed block
  for (const atData of mockAccessTypeDictionaries) {
    await prisma.accessTypeDictionary.upsert({
      where: { name: atData.name },
      update: atData,
      create: atData,
    });
  }
  console.log('Access Type Dictionaries seeded.');

  console.log('Seeding Audit Logs...');
  const usersForLogLinking = await prisma.user.findMany({select: {id: true, username: true}});
  for (const logData of seedAuditLogsData) {
    const userToLink = usersForLogLinking.find(u => u.username === logData.username);
    const validUserId = userToLink ? userToLink.id : undefined;
    const validUsername = userToLink ? userToLink.username : logData.username;
    const existingLog = await prisma.auditLog.findUnique({ where: { id: logData.id } });
    if (!existingLog) {
      await prisma.auditLog.create({
        data: {
          id: logData.id,
          userId: validUserId,
          username: validUsername,
          action: logData.action,
          details: logData.details,
          timestamp: logData.timestamp ? new Date(logData.timestamp) : new Date(),
        },
      });
    } else {
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

