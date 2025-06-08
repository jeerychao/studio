
import prisma from '../src/lib/prisma';
import {
  mockPermissions as seedPermissionsData,
  mockRoles as seedRolesData,
  mockVLANs as seedVLANsData,
  mockSubnets as seedSubnetsData,
  mockIPAddresses as seedIPsData,
  mockAuditLogs as seedAuditLogsData,
  ADMIN_ROLE_ID as SEED_ADMIN_ROLE_ID, // Constant name remains the same for clarity in seed script
  OPERATOR_ROLE_ID as SEED_OPERATOR_ROLE_ID,
  VIEWER_ROLE_ID as SEED_VIEWER_ROLE_ID,
} from '../src/lib/data';
import type { PermissionId as AppPermissionId, User as AppUser } from '../src/types';


async function main() {
  console.log('Start seeding ...');

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
    await prisma.role.upsert({
      where: { id: roleData.id }, // Uses the new ID format from mockRoles
      update: {
        name: prismaRoleName,
        description: roleData.description,
      },
      create: {
        id: roleData.id, // Uses the new ID format from mockRoles
        name: prismaRoleName,
        description: roleData.description,
      },
    });
  }
  console.log('Roles seeded (Pass 1 complete).');

  console.log('Updating Roles (Pass 2: Connect permissions)...');
  for (const roleData of seedRolesData) {
    const mappedPermissions = roleData.permissions.map(appPermId => ({
      id: appPermId as string
    }));

    await prisma.role.update({
        where: { id: roleData.id }, // Uses the new ID format from mockRoles
        data: {
        permissions: {
            set: mappedPermissions,
        },
        },
    });
  }
  console.log('Roles updated with permissions (Pass 2 complete).');

  const initialUsersToSeed: Array<Omit<AppUser, 'roleName' | 'lastLogin' | 'avatar' | 'permissions'> & { password: string; avatarPath: string }> = [
    {
      id: 'seed_user_admin', // Updated ID
      username: 'admin',
      email: 'admin@example.com',
      roleId: SEED_ADMIN_ROLE_ID, // Constant still points to the new ID format for Admin role
      password: 'admin',
      avatarPath: '/images/avatars/admin_avatar.png',
    },
    {
      id: 'seed_user_operator', // Updated ID
      username: 'operator',
      email: 'operator@example.com',
      roleId: SEED_OPERATOR_ROLE_ID, // Constant still points to the new ID format for Operator role
      password: 'operator',
      avatarPath: '/images/avatars/operator_avatar.png',
    },
    {
      id: 'seed_user_viewer', // Updated ID
      username: 'viewer',
      email: 'viewer@example.com',
      roleId: SEED_VIEWER_ROLE_ID, // Constant still points to the new ID format for Viewer role
      password: 'viewer',
      avatarPath: '/images/avatars/viewer_avatar.png',
    },
  ];

  console.log('Seeding Users with new credentials and local avatars...');
  for (const userData of initialUsersToSeed) {
    await prisma.user.upsert({
      where: { email: userData.email }, // Email is unique
      update: {
        id: userData.id, // Ensure ID is updated if record exists by email but with old ID
        username: userData.username,
        password: userData.password,
        roleId: userData.roleId,
        avatar: userData.avatarPath,
        lastLogin: new Date(),
      },
      create: {
        id: userData.id, // Use new ID format
        username: userData.username,
        email: userData.email,
        password: userData.password,
        roleId: userData.roleId,
        avatar: userData.avatarPath,
        lastLogin: new Date(),
      },
    });
  }
  console.log('Users seeded.');

  console.log('Seeding VLANs...');
  for (const vlanData of seedVLANsData) {
    const conflictingVlan = await prisma.vLAN.findFirst({
      where: {
        vlanNumber: vlanData.vlanNumber,
        NOT: {
          id: vlanData.id, // Use new ID format
        },
      },
    });

    if (conflictingVlan) {
      console.warn(
        `Conflict detected: VLAN number ${vlanData.vlanNumber} is already used by VLAN ID ${conflictingVlan.id}. ` +
        `The seed data expects VLAN number ${vlanData.vlanNumber} to be associated with ID ${vlanData.id}.`
      );

      const subnetsUsingConflictingVlan = await prisma.subnet.count({
        where: { vlanId: conflictingVlan.id },
      });
      const ipsUsingConflictingVlan = await prisma.iPAddress.count({
        where: { vlanId: conflictingVlan.id },
      });

      if (subnetsUsingConflictingVlan > 0 || ipsUsingConflictingVlan > 0) {
        throw new Error(
          `Cannot automatically resolve VLAN seed conflict for VLAN number ${vlanData.vlanNumber}. ` +
          `This VLAN number is currently used by an existing VLAN (ID: ${conflictingVlan.id}) which is associated with ${subnetsUsingConflictingVlan} subnet(s) and ${ipsUsingConflictingVlan} IP address(es). ` +
          `To resolve, please manually clean up the conflicting VLAN data or reset the database using 'npm run prisma:migrate:reset'.`
        );
      } else {
        console.warn(
          `The conflicting VLAN (ID: ${conflictingVlan.id}, Number: ${vlanData.vlanNumber}) is not used by any subnets or IPs. Deleting it.`
        );
        await prisma.vLAN.delete({ where: { id: conflictingVlan.id } });
      }
    }

    await prisma.vLAN.upsert({
      where: { id: vlanData.id }, // Use new ID format
      update: { vlanNumber: vlanData.vlanNumber, name: vlanData.name, description: vlanData.description },
      create: {
        id: vlanData.id, // Use new ID format
        vlanNumber: vlanData.vlanNumber,
        name: vlanData.name,
        description: vlanData.description,
      },
    });
  }
  console.log('VLANs seeded.');

  console.log('Seeding Subnets...');
  for (const subnetData of seedSubnetsData) {
    const conflictingSubnet = await prisma.subnet.findFirst({
        where: {
            cidr: subnetData.cidr,
            NOT: {
                id: subnetData.id, // Use new ID format
            },
        },
    });

    if (conflictingSubnet) {
        console.warn(
            `Conflict detected: Subnet CIDR ${subnetData.cidr} is already used by Subnet ID ${conflictingSubnet.id}. ` +
            `The seed data expects CIDR ${subnetData.cidr} to be associated with ID ${subnetData.id}.`
        );

        const ipsInConflictingSubnet = await prisma.iPAddress.count({
            where: { subnetId: conflictingSubnet.id },
        });

        if (ipsInConflictingSubnet > 0) {
            throw new Error(
                `Cannot automatically resolve Subnet seed conflict for CIDR ${subnetData.cidr}. ` +
                `This CIDR is currently used by an existing Subnet (ID: ${conflictingSubnet.id}) which has ${ipsInConflictingSubnet} associated IP address(es). ` +
                `To resolve, please manually clean up the conflicting Subnet data (and its IPs) or reset the database using 'npm run prisma:migrate:reset'.`
            );
        } else {
            console.warn(
                `The conflicting Subnet (ID: ${conflictingSubnet.id}, CIDR: ${subnetData.cidr}) has no associated IP addresses. Deleting it.`
            );
            await prisma.subnet.delete({ where: { id: conflictingSubnet.id } });
        }
    }

    await prisma.subnet.upsert({
      where: { id: subnetData.id }, // Use new ID format
      update: {
        cidr: subnetData.cidr,
        networkAddress: subnetData.networkAddress,
        subnetMask: subnetData.subnetMask,
        ipRange: subnetData.ipRange,
        description: subnetData.description,
        vlanId: subnetData.vlanId, // This ID must match a new VLAN ID format if linked
      },
      create: {
        id: subnetData.id, // Use new ID format
        cidr: subnetData.cidr,
        networkAddress: subnetData.networkAddress,
        subnetMask: subnetData.subnetMask,
        ipRange: subnetData.ipRange,
        description: subnetData.description,
        vlanId: subnetData.vlanId, // This ID must match a new VLAN ID format if linked
      },
    });
  }
  console.log('Subnets seeded.');

  console.log('Seeding IP Addresses...');
  for (const ipData of seedIPsData) {
    await prisma.iPAddress.upsert({
      where: { id: ipData.id }, // Use new ID format
      update: {
        ipAddress: ipData.ipAddress,
        status: ipData.status as string,
        allocatedTo: ipData.allocatedTo,
        description: ipData.description,
        subnetId: ipData.subnetId, // This ID must match a new Subnet ID format if linked
        vlanId: ipData.vlanId,     // This ID must match a new VLAN ID format if linked
      },
      create: {
        id: ipData.id, // Use new ID format
        ipAddress: ipData.ipAddress,
        status: ipData.status as string,
        allocatedTo: ipData.allocatedTo,
        description: ipData.description,
        subnetId: ipData.subnetId, // This ID must match a new Subnet ID format if linked
        vlanId: ipData.vlanId,     // This ID must match a new VLAN ID format if linked
      },
    });
  }
  console.log('IP Addresses seeded.');

  console.log('Seeding Audit Logs...');
  for (const logData of seedAuditLogsData) {
    // Find user by new ID format for linking in audit log
    const userToLink = initialUsersToSeed.find(u => u.username === logData.username); // username is still the same
    const validUserId = userToLink ? userToLink.id : undefined; // will use new 'seed_user_xxx' format
    const validUsername = userToLink ? userToLink.username : logData.username;


    const existingLog = await prisma.auditLog.findUnique({ where: { id: logData.id }}); // Use new log ID format
    if (!existingLog) {
        await prisma.auditLog.create({
        data: {
            id: logData.id, // Use new log ID format
            userId: validUserId,
            username: validUsername,
            action: logData.action,
            details: logData.details,
            timestamp: logData.timestamp ? new Date(logData.timestamp) : new Date(),
        },
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

    