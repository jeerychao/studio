
// --- PRISMA SEED SCRIPT (FULL RESTORED LOGIC V2) ---
console.log("--- PRISMA SEED SCRIPT (FULL RESTORED LOGIC V2): Execution Started ---");

// Explicit dotenv.config() call is removed.
// Prisma CLI should load the .env from the project root and make it available to this script.

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
  seedIPsData, // Corrected import name
  mockDeviceDictionaries,
  mockPaymentSourceDictionaries,
  mockAccessTypeDictionaries,
  mockInterfaceTypeDictionaries,
} from '../src/lib/data'; // Ensure path is correct if lib/data is moved
import { logger } from '../src/lib/logger';

// Log the ENCRYPTION_KEY visible to this script for debugging
// This log helps confirm if the Prisma CLI successfully passed the .env variable.
const keyVisible = process.env.ENCRYPTION_KEY;
if (keyVisible) {
  console.log(`ENCRYPTION_KEY starts with: ${keyVisible.substring(0, 4)}... and ends with: ...${keyVisible.substring(keyVisible.length - 4)} (Length: ${keyVisible.length})`);
} else {
  // This path should ideally not be taken if Prisma CLI loads .env correctly.
  // crypto-utils.ts has its own fallback for development if NODE_ENV is not production.
  console.warn("ENCRYPTION_KEY is NOT SET in the environment for seed.ts. Passwords will be encrypted with the default dev key if crypto-utils falls back.");
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
    } catch (e: any) {
      logger.error(`Error seeding role ${roleData.name}:`, e, { name: e.name, message: e.message, stack: e.stack });
    }
  }
  logger.info(`${mockRoles.length} Roles seeded.`);

  // 3. Seed Users
  logger.info('Start seeding Users...');
  for (const userData of mockUsers) {
    try {
      // The mockUsers data directly provides encrypted passwords.
      // The encrypt function here is mainly for reference or if a default is needed.
      const { password, ...restOfUserData } = userData;
      const dataToUpsert: Prisma.UserUpsertArgs['create'] & Prisma.UserUpsertArgs['update'] = {
        ...restOfUserData,
        password: password || encrypt("FallbackDefaultPassword1!"), // Fallback if password somehow missing
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
      const { vlanId, ...restOfSubnetData } = subnetData; // Destructure vlanId
      const createPayload: Prisma.SubnetCreateInput = { ...restOfSubnetData };
      if (vlanId) {
        createPayload.vlan = { connect: { id: vlanId } };
      }
      await prisma.subnet.upsert({
        where: { cidr: subnetData.cidr },
        update: createPayload, // Use same payload for update and create logic
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
      // Destructure all relevant fields from ipData
      const { 
        subnetId: ipSubnetId, 
        directVlanId, 
        peerUnitName, 
        peerDeviceName, 
        peerPortName,
        selectedAccessType, 
        selectedLocalDeviceName, 
        selectedDevicePort, 
        selectedPaymentSource,
        ...restOfIpData 
      } = ipData;

      const createPayload: Prisma.IPAddressCreateInput = {
        ...restOfIpData, // Includes id, ipAddress, status, isGateway, allocatedTo, usageUnit, contactPerson, phone, description
        status: ipData.status as string, // Ensure status is correctly typed if needed by Prisma
        peerUnitName: peerUnitName || null,
        peerDeviceName: peerDeviceName || null,
        peerPortName: peerPortName || null,
        selectedAccessType: selectedAccessType || null,
        selectedLocalDeviceName: selectedLocalDeviceName || null,
        selectedDevicePort: selectedDevicePort || null,
        selectedPaymentSource: selectedPaymentSource || null,
      };

      if (ipSubnetId) {
        createPayload.subnet = { connect: { id: ipSubnetId } };
      }
      if (directVlanId) {
        createPayload.directVlan = { connect: { id: directVlanId } };
      }
      
      // The unique constraint is @@unique([ipAddress, subnetId])
      // If subnetId is null, it's a global IP, otherwise it's subnet-specific.
      // The where clause needs to reflect this for the upsert to work correctly.
      // For Prisma's composite unique key, `null` is a valid value.
      // The `as any` cast here was to bypass a previous TypeScript error; it should be okay now.
      // The `subnetId` in `ipAddress_subnetId` must match the type in the unique constraint (String?)
      // so `null` is a valid value.
      const currentSubnetIdForWhere: string | null = ipData.subnetId ? ipData.subnetId : null;

      await prisma.iPAddress.upsert({
        where: { 
          ipAddress_subnetId: { 
            ipAddress: ipData.ipAddress, 
            subnetId: currentSubnetIdForWhere as any // Prisma expects string | null here
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
        update: { port: deviceData.port }, // Only 'port' is updatable besides deviceName for where
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
        update: {}, // No other fields to update besides sourceName for where
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
        update: {}, // No other fields to update
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
    console.error("--- PRISMA SEED SCRIPT: FATAL ERROR in main() ---");
    console.error("Error Name:", e.name);
    console.error("Error Message:", e.message);
    console.error("Error Stack:", e.stack);
    if(e.code) console.error("Prisma Error Code:", e.code);
    if(e.meta) console.error("Prisma Error Meta:", e.meta);
    // Use the logger for structured logging as well
    logger.error('FATAL ERROR during seeding process:', e, { name: e.name, message: e.message, stack: e.stack });
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    logger.info('Prisma client disconnected.');
    // Final console log to indicate script completion path.
    console.log("--- PRISMA SEED SCRIPT: main() finished, client disconnected. ---");
  });

// This log indicates the script file itself has finished executing its top-level code,
// not necessarily that the async main() function has completed.
console.log("--- PRISMA SEED SCRIPT (FULL RESTORED LOGIC V2): Script Execution Reached End (before main might have finished) ---");

    