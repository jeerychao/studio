
// --- PRISMA SEED SCRIPT (FULL RESTORED LOGIC) ---
import { PrismaClient, Prisma } from '@prisma/client';
import { encrypt } from '../src/lib/crypto-utils';
import {
  ADMIN_ROLE_ID,
  OPERATOR_ROLE_ID,
  VIEWER_ROLE_ID,
  mockPermissions,
  mockRoles,
  mockUsers,
  mockVLANs,
  mockSubnets,
  seedIPsData, // Ensure this matches the export from data.ts
  mockDeviceDictionaries,
  mockPaymentSourceDictionaries,
  mockAccessTypeDictionaries,
  mockInterfaceTypeDictionaries,
} from '../src/lib/data';
import { logger } from '../src/lib/logger'; // Using the logger utility

const prisma = new PrismaClient();

async function main() {
  logger.info('--- PRISMA SEED SCRIPT STARTED (FULL LOGIC) ---');

  // 1. Seed Permissions (if they don't exist, as they are defined by PERMISSIONS enum)
  logger.info('Start seeding Permissions...');
  for (const perm of mockPermissions) {
    try {
      await prisma.permission.upsert({
        where: { id: perm.id },
        update: { name: perm.name, group: perm.group, description: perm.description },
        create: perm,
      });
    } catch (e) {
      logger.error(`Error seeding permission ${perm.id}:`, e);
    }
  }
  logger.info(`${mockPermissions.length} Permissions processed.`);

  // 2. Seed Roles
  logger.info('Start seeding Roles...');
  for (const roleData of mockRoles) {
    try {
      const permissionsToConnect = roleData.permissions.map(pid => ({ id: pid }));
      await prisma.role.upsert({
        where: { id: roleData.id },
        update: {
          name: roleData.name,
          description: roleData.description,
          permissions: {
            set: permissionsToConnect, // Use set to replace all existing permissions
          },
        },
        create: {
          id: roleData.id,
          name: roleData.name,
          description: roleData.description,
          permissions: {
            connect: permissionsToConnect,
          },
        },
      });
    } catch (e) {
      logger.error(`Error seeding role ${roleData.name}:`, e);
    }
  }
  logger.info(`${mockRoles.length} Roles seeded.`);

  // 3. Seed Users
  logger.info('Start seeding Users...');
  for (const userData of mockUsers) {
    try {
      const { password, ...restOfUserData } = userData;
      const dataToUpsert: Prisma.UserUpsertArgs['create'] & Prisma.UserUpsertArgs['update'] = {
        ...restOfUserData,
        // Password is only set on create or if explicitly provided for update
        // For seeding, we always provide it.
        password: password || encrypt("DefaultPassword1!"), // Should always have a password from mockUsers
      };
      await prisma.user.upsert({
        where: { email: userData.email },
        update: dataToUpsert,
        create: dataToUpsert,
      });
    } catch (e) {
      logger.error(`Error seeding user ${userData.email}:`, e);
    }
  }
  logger.info(`${mockUsers.length} Users seeded.`);

  // 4. Seed VLANs
  logger.info('Start seeding VLANs...');
  for (const vlanData of mockVLANs) {
    try {
      await prisma.vLAN.upsert({
        where: { vlanNumber: vlanData.vlanNumber },
        update: { name: vlanData.name, description: vlanData.description },
        create: vlanData,
      });
    } catch (e) {
      logger.error(`Error seeding VLAN ${vlanData.vlanNumber}:`, e);
    }
  }
  logger.info(`${mockVLANs.length} VLANs seeded.`);

  // 5. Seed Subnets
  logger.info('Start seeding Subnets...');
  for (const subnetData of mockSubnets) {
    try {
      const { vlanId, ...restOfSubnetData } = subnetData;
      const createPayload: Prisma.SubnetCreateInput = { ...restOfSubnetData };
      if (vlanId) {
        createPayload.vlan = { connect: { id: vlanId } };
      }
      await prisma.subnet.upsert({
        where: { cidr: subnetData.cidr },
        update: createPayload, // For simplicity, update also uses create payload structure
        create: createPayload,
      });
    } catch (e) {
      logger.error(`Error seeding subnet ${subnetData.cidr}:`, e);
    }
  }
  logger.info(`${mockSubnets.length} Subnets seeded.`);

  // 6. Seed IP Addresses
  logger.info('Start seeding IP Addresses...');
  for (const ipData of seedIPsData) { // Using seedIPsData
    try {
      const { subnetId, directVlanId, ...restOfIpData } = ipData;
      const createPayload: Prisma.IPAddressCreateInput = {
        ...restOfIpData,
        status: ipData.status, // Already correct type
      };
      if (subnetId) {
        createPayload.subnet = { connect: { id: subnetId } };
      }
      if (directVlanId) {
        createPayload.directVlan = { connect: { id: directVlanId } };
      }
      await prisma.iPAddress.upsert({
        where: { ipAddress_subnetId: { ipAddress: ipData.ipAddress, subnetId: subnetId || null } }, // Assuming unique constraint
        update: createPayload,
        create: createPayload,
      });
    } catch (e) {
      // If unique constraint is just on ipAddress, use that.
      // This also handles cases where an IP might move between subnets (though upsert might create a new one if subnetId changes and is part of key)
      // For simplicity, current seed assumes ipAddress+subnetId is unique or ipAddress globally if subnetId is null.
      // If a simple ipAddress unique key is needed, adjust the where clause.
      logger.error(`Error seeding IP Address ${ipData.ipAddress}:`, e);
    }
  }
  logger.info(`${seedIPsData.length} IP Addresses seeded.`);

  // 7. Seed Device Dictionaries (formerly LocalDeviceDictionary)
  logger.info('Start seeding Device Dictionaries...');
  for (const deviceData of mockDeviceDictionaries) {
    try {
      await prisma.deviceDictionary.upsert({
        where: { deviceName: deviceData.deviceName },
        update: { port: deviceData.port },
        create: deviceData,
      });
    } catch (e) {
      logger.error(`Error seeding device dictionary ${deviceData.deviceName}:`, e);
    }
  }
  logger.info(`${mockDeviceDictionaries.length} Device Dictionaries seeded.`);

  // 8. Seed Payment Source Dictionaries
  logger.info('Start seeding Payment Source Dictionaries...');
  for (const paymentData of mockPaymentSourceDictionaries) {
    try {
      await prisma.paymentSourceDictionary.upsert({
        where: { sourceName: paymentData.sourceName },
        update: {},
        create: paymentData,
      });
    } catch (e) {
      logger.error(`Error seeding payment source dictionary ${paymentData.sourceName}:`, e);
    }
  }
  logger.info(`${mockPaymentSourceDictionaries.length} Payment Source Dictionaries seeded.`);

  // 9. Seed Access Type Dictionaries
  logger.info('Start seeding Access Type Dictionaries...');
  for (const accessTypeData of mockAccessTypeDictionaries) {
    try {
      await prisma.accessTypeDictionary.upsert({
        where: { name: accessTypeData.name },
        update: {},
        create: accessTypeData,
      });
    } catch (e) {
      logger.error(`Error seeding access type dictionary ${accessTypeData.name}:`, e);
    }
  }
  logger.info(`${mockAccessTypeDictionaries.length} Access Type Dictionaries seeded.`);

  // 10. Seed Interface Type Dictionaries (formerly NetworkInterfaceTypeDictionary)
  logger.info('Start seeding Interface Type Dictionaries...');
  for (const interfaceTypeData of mockInterfaceTypeDictionaries) {
    try {
      await prisma.interfaceTypeDictionary.upsert({
        where: { name: interfaceTypeData.name },
        update: { description: interfaceTypeData.description },
        create: interfaceTypeData,
      });
    } catch (e) {
      logger.error(`Error seeding interface type dictionary ${interfaceTypeData.name}:`, e);
    }
  }
  logger.info(`${mockInterfaceTypeDictionaries.length} Interface Type Dictionaries seeded.`);

  logger.info('--- PRISMA SEED SCRIPT FINISHED ---');
}

main()
  .catch((e) => {
    logger.error('An error occurred during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    logger.info('Prisma client disconnected.');
  });
