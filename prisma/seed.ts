
import prisma from '../src/lib/prisma'; // Changed import
import {
  mockPermissions as seedPermissionsData,
  mockRoles as seedRolesData,
  // mockUsers will now be defined inside main() based on roles for simplicity
  mockVLANs as seedVLANsData,
  mockSubnets as seedSubnetsData,
  mockIPAddresses as seedIPsData,
  mockAuditLogs as seedAuditLogsData,
  ADMIN_ROLE_ID as SEED_ADMIN_ROLE_ID,
  OPERATOR_ROLE_ID as SEED_OPERATOR_ROLE_ID,
  VIEWER_ROLE_ID as SEED_VIEWER_ROLE_ID,
} from '../src/lib/data';
import type { PermissionId as AppPermissionId, RoleName as AppRoleName, IPAddressStatus as AppIPAddressStatus, User as AppUser } from '../src/types';


async function main() {
  console.log('Start seeding ...');

  // Seed Permissions
  console.log('Seeding Permissions...');
  for (const p of seedPermissionsData) {
    await prisma.permission.upsert({
      where: { id: p.id as string }, // p.id is AppPermissionId (string union)
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

  // Seed Roles
  console.log('Seeding Roles...');
  for (const roleData of seedRolesData) {
    const prismaRoleName = roleData.name as string; // AppRoleName is 'Administrator', 'Operator', 'Viewer'
    const mappedPermissions = roleData.permissions.map(appPermId => ({
      id: appPermId as string // appPermId is AppPermissionId
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

  // Define initial users based on your new logic
  // Corrected type: password is now 'string', not 'string | undefined'
  const initialUsersToSeed: Array<Omit<AppUser, 'roleName' | 'lastLogin' | 'avatar'> & { password: string }> = [
    {
      id: 'user-admin-seed',
      username: 'admin',
      email: 'admin@example.com',
      roleId: SEED_ADMIN_ROLE_ID,
      password: 'admin',
    },
    {
      id: 'user-operator-seed',
      username: 'operator',
      email: 'operator@example.com',
      roleId: SEED_OPERATOR_ROLE_ID,
      password: 'operator',
    },
    {
      id: 'user-viewer-seed',
      username: 'viewer',
      email: 'viewer@example.com',
      roleId: SEED_VIEWER_ROLE_ID,
      password: 'viewer',
    },
  ];

  // Seed Users
  console.log('Seeding Users with new credentials...');
  for (const userData of initialUsersToSeed) {
    await prisma.user.upsert({
      where: { email: userData.email },
      update: {
        username: userData.username,
        password: userData.password, // Store the plain password
        roleId: userData.roleId,
        avatar: `https://placehold.co/100x100.png?text=${userData.username.substring(0,1).toUpperCase()}`,
        lastLogin: new Date(), // Set a recent login time
      },
      create: {
        id: userData.id,
        username: userData.username,
        email: userData.email,
        password: userData.password, // Store the plain password
        roleId: userData.roleId,
        avatar: `https://placehold.co/100x100.png?text=${userData.username.substring(0,1).toUpperCase()}`,
        lastLogin: new Date(),
      },
    });
  }
  console.log('Users seeded.');

  // Seed VLANs
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

  // Seed Subnets
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

  // Seed IPAddresses
  console.log('Seeding IP Addresses...');
  for (const ipData of seedIPsData) {
    await prisma.iPAddress.upsert({
      where: { id: ipData.id },
      update: {
        ipAddress: ipData.ipAddress,
        status: ipData.status as string, // AppIPAddressStatus to string
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
  
  // Seed Audit Logs
  console.log('Seeding Audit Logs...');
  for (const logData of seedAuditLogsData) {
    // Ensure userId from seed data corresponds to one of the newly defined users
    const userToLink = initialUsersToSeed.find(u => u.username === logData.username);
    const validUserId = userToLink ? userToLink.id : undefined;
    const validUsername = userToLink ? userToLink.username : logData.username;


    // Check if log already exists to prevent duplicates if seed is run multiple times
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

