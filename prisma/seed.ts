
// --- PRISMA SEED SCRIPT (FULL RESTORED LOGIC V2) ---
// Top-level log to confirm script execution start
console.log("--- PRISMA SEED SCRIPT (FULL RESTORED LOGIC V2): Execution Started ---");

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
  seedIPsData, // Use the direct export name
  mockDeviceDictionaries,
  mockPaymentSourceDictionaries,
  mockAccessTypeDictionaries,
  mockInterfaceTypeDictionaries, // Renamed
} from '../src/lib/data';
import { logger } from '../src/lib/logger'; // Using the logger utility

// Attempt to load .env variables explicitly if not already loaded by Prisma CLI for ts-node
// This is often a point of failure if ts-node doesn't inherit the env properly
try {
    const dotenv = require('dotenv'); // Using require for early use
    const path = require('path');
    const envPath = path.resolve(__dirname, '../../.env'); // Points to project root .env
    const result = dotenv.config({ path: envPath });
    if (result.error) {
        console.warn("dotenv.config error in seed.ts (this might be okay if Prisma CLI handles .env):", result.error.message);
    } else {
        console.log("dotenv.config loaded successfully in seed.ts. Parsed ENCRYPTION_KEY:", process.env.ENCRYPTION_KEY ? "Exists" : "MISSING");
    }
} catch (e) {
    console.warn("dotenv module not found or error during its initial require in seed.ts (continuing, Prisma CLI might handle .env):", (e as Error).message);
}

const prisma = new PrismaClient();

async function main() {
  logger.info('--- PRISMA SEED SCRIPT STARTED (FULL LOGIC V2) ---');

  // 1. Seed Permissions
  logger.info('Start seeding Permissions...');
  for (const perm of mockPermissions) {
    try {
      await prisma.permission.upsert({
        where: { id: perm.id },
        update: { name: perm.name, group: perm.group, description: perm.description },
        create: perm,
      });
    } catch (e: any) {
      logger.error(`Error seeding permission ${perm.id}:`, e, { name: e.name, message: e.message, stack: e.stack });
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
            set: permissionsToConnect,
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
    } catch (e: any) {
      logger.error(`Error seeding role ${roleData.name}:`, e, { name: e.name, message: e.message, stack: e.stack });
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
        password: password || encrypt("DefaultPassword1!"),
      };
      await prisma.user.upsert({
        where: { email: userData.email },
        update: dataToUpsert,
        create: dataToUpsert,
      });
    } catch (e: any) {
      logger.error(`Error seeding user ${userData.email}:`, e, { name: e.name, message: e.message, stack: e.stack });
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
    } catch (e: any) {
      logger.error(`Error seeding VLAN ${vlanData.vlanNumber}:`, e, { name: e.name, message: e.message, stack: e.stack });
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
        update: createPayload,
        create: createPayload,
      });
    } catch (e: any) {
      logger.error(`Error seeding subnet ${subnetData.cidr}:`, e, { name: e.name, message: e.message, stack: e.stack });
    }
  }
  logger.info(`${mockSubnets.length} Subnets seeded.`);

  // 6. Seed IP Addresses
  logger.info('Start seeding IP Addresses...');
  for (const ipData of seedIPsData) {
    try {
      const { subnetId, directVlanId, ...restOfIpData } = ipData;
      const createPayload: Prisma.IPAddressCreateInput = {
        ...restOfIpData,
        status: ipData.status,
      };
      if (subnetId) {
        createPayload.subnet = { connect: { id: subnetId } };
      }
      if (directVlanId) {
        createPayload.directVlan = { connect: { id: directVlanId } };
      }
      
      // The subnetId for the where clause can be string or null.
      // If ipData.subnetId is undefined (meaning not in seedIPsData for this entry),
      // then currentSubnetIdForWhere will be null.
      const currentSubnetIdForWhere: string | null = ipData.subnetId ? ipData.subnetId : null;

      await prisma.iPAddress.upsert({
        where: { 
          ipAddress_subnetId: { 
            ipAddress: ipData.ipAddress, 
            subnetId: currentSubnetIdForWhere as any // Casting to any to bypass strict TS check if it's too restrictive
                                                    // Prisma runtime should handle null correctly for optional parts of composite keys.
          } 
        },
        update: createPayload,
        create: createPayload,
      });
    } catch (e: any) {
      logger.error(`Error seeding IP Address ${ipData.ipAddress}:`, e, { name: e.name, message: e.message, stack: e.stack, ipDataAttempted: ipData });
    }
  }
  logger.info(`${seedIPsData.length} IP Addresses seeded.`);

  // 7. Seed Device Dictionaries
  logger.info('Start seeding Device Dictionaries...');
  for (const deviceData of mockDeviceDictionaries) {
    try {
      await prisma.deviceDictionary.upsert({
        where: { deviceName: deviceData.deviceName },
        update: { port: deviceData.port },
        create: deviceData,
      });
    } catch (e: any) {
      logger.error(`Error seeding device dictionary ${deviceData.deviceName}:`, e, { name: e.name, message: e.message, stack: e.stack });
    }
  }
  logger.info(`${mockDeviceDictionaries.length} Device Dictionaries seeded.`);

  // 8. Seed Payment Source Dictionaries
  logger.info('Start seeding Payment Source Dictionaries...');
  for (const paymentData of mockPaymentSourceDictionaries) {
    try {
      await prisma.paymentSourceDictionary.upsert({
        where: { sourceName: paymentData.sourceName },
        update: {}, // No other fields to update besides the key
        create: paymentData,
      });
    } catch (e: any) {
      logger.error(`Error seeding payment source dictionary ${paymentData.sourceName}:`, e, { name: e.name, message: e.message, stack: e.stack });
    }
  }
  logger.info(`${mockPaymentSourceDictionaries.length} Payment Source Dictionaries seeded.`);

  // 9. Seed Access Type Dictionaries
  logger.info('Start seeding Access Type Dictionaries...');
  for (const accessTypeData of mockAccessTypeDictionaries) {
    try {
      await prisma.accessTypeDictionary.upsert({
        where: { name: accessTypeData.name },
        update: {}, // No other fields to update besides the key
        create: accessTypeData,
      });
    } catch (e: any) {
      logger.error(`Error seeding access type dictionary ${accessTypeData.name}:`, e, { name: e.name, message: e.message, stack: e.stack });
    }
  }
  logger.info(`${mockAccessTypeDictionaries.length} Access Type Dictionaries seeded.`);

  // 10. Seed Interface Type Dictionaries
  logger.info('Start seeding Interface Type Dictionaries...');
  for (const interfaceTypeData of mockInterfaceTypeDictionaries) {
    try {
      await prisma.interfaceTypeDictionary.upsert({
        where: { name: interfaceTypeData.name },
        update: { description: interfaceTypeData.description },
        create: interfaceTypeData,
      });
    } catch (e: any) {
      logger.error(`Error seeding interface type dictionary ${interfaceTypeData.name}:`, e, { name: e.name, message: e.message, stack: e.stack });
    }
  }
  logger.info(`${mockInterfaceTypeDictionaries.length} Interface Type Dictionaries seeded.`);

  logger.info('--- PRISMA SEED SCRIPT FINISHED ---');
}

main()
  .catch((e: any) => {
    // This top-level catch should ideally not be hit if individual operations are caught,
    // but it's a good safety net.
    console.error("--- PRISMA SEED SCRIPT: FATAL ERROR in main() ---");
    console.error("Error Name:", e.name);
    console.error("Error Message:", e.message);
    console.error("Error Stack:", e.stack);
    if(e.code) console.error("Prisma Error Code:", e.code);
    if(e.meta) console.error("Prisma Error Meta:", e.meta);
    logger.error('FATAL ERROR during seeding process:', e, { name: e.name, message: e.message, stack: e.stack });
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    logger.info('Prisma client disconnected.');
    console.log("--- PRISMA SEED SCRIPT: main() finished, client disconnected. ---");
  });

console.log("--- PRISMA SEED SCRIPT (FULL RESTORED LOGIC V2): Script Execution Reached End (before main might have finished) ---");
