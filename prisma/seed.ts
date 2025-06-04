
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

  console.log('Seeding Roles...');
  for (const roleData of seedRolesData) {
    const prismaRoleName = roleData.name as string;
    const mappedPermissions = roleData.permissions.map(appPermId => ({
      id: appPermId as string
    }));

    await prisma.role.upsert({
      where: { id: roleData.id },
      update: {
        name: prismaRoleName,
        description: roleData.description,
        permissions: {
          set: mappedPermissions,
        },
      },
      create: {
        id: roleData.id,
        name: prismaRoleName,
        description: roleData.description,
        permissions: {
          connect: mappedPermissions,
        },
      },
    });
  }
  console.log('Roles seeded.');

  const initialUsersToSeed: Array<Omit<AppUser, 'roleName' | 'lastLogin' | 'avatar' | 'permissions'> & { password: string; avatarPath: string }> = [
    {
      id: 'user-admin-seed',
      username: 'admin',
      email: 'admin@example.com',
      roleId: SEED_ADMIN_ROLE_ID,
      password: 'admin',
      avatarPath: '/images/avatars/admin_avatar.png', // Updated path
    },
    {
      id: 'user-operator-seed',
      username: 'operator',
      email: 'operator@example.com',
      roleId: SEED_OPERATOR_ROLE_ID,
      password: 'operator',
      avatarPath: '/images/avatars/operator_avatar.png', // Updated path
    },
    {
      id: 'user-viewer-seed',
      username: 'viewer',
      email: 'viewer@example.com',
      roleId: SEED_VIEWER_ROLE_ID,
      password: 'viewer',
      avatarPath: '/images/avatars/viewer_avatar.png', // Updated path
    },
  ];

  console.log('Seeding Users with new credentials and local avatars...');
  for (const userData of initialUsersToSeed) {
    await prisma.user.upsert({
      where: { email: userData.email },
      update: {
        username: userData.username,
        password: userData.password,
        roleId: userData.roleId,
        avatar: userData.avatarPath,
        lastLogin: new Date(),
      },
      create: {
        id: userData.id,
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
    await prisma.vLAN.upsert({
      where: { id: vlanData.id },
      update: { vlanNumber: vlanData.vlanNumber, description: vlanData.description },
      create: {
        id: vlanData.id,
        vlanNumber: vlanData.vlanNumber,
        description: vlanData.description,
      },
    });
  }
  console.log('VLANs seeded.');

  console.log('Seeding Subnets...');
  for (const subnetData of seedSubnetsData) {
    await prisma.subnet.upsert({
      where: { id: subnetData.id },
      update: {
        cidr: subnetData.cidr,
        networkAddress: subnetData.networkAddress,
        subnetMask: subnetData.subnetMask,
        ipRange: subnetData.ipRange,
        description: subnetData.description,
        vlanId: subnetData.vlanId,
      },
      create: {
        id: subnetData.id,
        cidr: subnetData.cidr,
        networkAddress: subnetData.networkAddress,
        subnetMask: subnetData.subnetMask,
        ipRange: subnetData.ipRange,
        description: subnetData.description,
        vlanId: subnetData.vlanId,
      },
    });
  }
  console.log('Subnets seeded.');

  console.log('Seeding IP Addresses...');
  for (const ipData of seedIPsData) {
    await prisma.iPAddress.upsert({
      where: { id: ipData.id },
      update: {
        ipAddress: ipData.ipAddress,
        status: ipData.status as string,
        allocatedTo: ipData.allocatedTo,
        description: ipData.description,
        subnetId: ipData.subnetId,
        vlanId: ipData.vlanId,
      },
      create: {
        id: ipData.id,
        ipAddress: ipData.ipAddress,
        status: ipData.status as string,
        allocatedTo: ipData.allocatedTo,
        description: ipData.description,
        subnetId: ipData.subnetId,
        vlanId: ipData.vlanId,
      },
    });
  }
  console.log('IP Addresses seeded.');

  console.log('Seeding Audit Logs...');
  for (const logData of seedAuditLogsData) {
    const userToLink = initialUsersToSeed.find(u => u.username === logData.username);
    const validUserId = userToLink ? userToLink.id : undefined;
    const validUsername = userToLink ? userToLink.username : logData.username;


    const existingLog = await prisma.auditLog.findUnique({ where: { id: logData.id }});
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
