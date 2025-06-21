
// --- PRISMA SEED SCRIPT (FULL RESTORED LOGIC V2) ---
console.log("--- PRISMA SEED SCRIPT (FULL RESTORED LOGIC V2): Execution Started ---");
import 'dotenv/config'; // Ensures .env variables are loaded for this script
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
  seedIPsData,
  mockDeviceDictionaries,
  mockPaymentSourceDictionaries,
  mockAccessTypeDictionaries,
  mockInterfaceTypeDictionaries,
} from '../src/lib/data';
import { logger } from '../src/lib/logger';
import type { RoleName } from '../src/types'; // Added for explicit type casting

const keyVisible = process.env.ENCRYPTION_KEY;
if (keyVisible) {
  console.log(`ENCRYPTION_KEY starts with: ${keyVisible.substring(0, 4)}... and ends with: ...${keyVisible.substring(keyVisible.length - 4)} (Length: ${keyVisible.length})`);
} else {
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
      logger.error(`CRITICAL: Error seeding permission ${perm.id} (${perm.name}). Exiting.`, e, { name: e.name, message: e.message, stack: e.stack });
      process.exit(1);
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
      logger.error(`CRITICAL: Error seeding role ${roleData.name}. Exiting.`, e, { name: e.name, message: e.message, stack: e.stack });
      process.exit(1);
    }
  }
  logger.info(`${mockRoles.length} Roles seeded.`);

  // 3. Seed Users
  logger.info('Start seeding Users...');
  for (const userData of mockUsers) {
    try {
      const { password, ...restOfUserData } = userData;
      if (!password) {
        logger.error(`CRITICAL: Password not provided for seed user ${userData.email} (ID: ${userData.id}). All seed users must have a password defined in mockUsers. Exiting.`);
        process.exit(1);
      }
      const dataToUpsert: Prisma.UserUpsertArgs['create'] & Prisma.UserUpsertArgs['update'] = {
        ...restOfUserData,
        password: encrypt(password),
      };

      await prisma.user.upsert({
        where: { id: userData.id },
        update: dataToUpsert,
        create: {
            ...dataToUpsert,
            id: userData.id,
        }
      });
    } catch (e: any) {
      logger.error(`Error seeding user ${userData.email}:`, e, { name: e.name, message: e.message, stack: e.stack });
      if (userData.id === 'user_admin_001') {
          logger.error(`CRITICAL: Failed to seed admin user ${userData.email}. Exiting.`);
          process.exit(1);
      }
    }
  }
  logger.info(`${mockUsers.length} Users seeded.`);

  // 4. Seed VLANs
  logger.info('Start seeding VLANs...');
  for (const vlanData of mockVLANs) {
    try {
      await prisma.vLAN.upsert({
        where: { id: vlanData.id },
        update: { vlanNumber: vlanData.vlanNumber, name: vlanData.name, description: vlanData.description },
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
      const baseData = { ...restOfSubnetData, id: subnetData.id };
      const updatePayload: Prisma.SubnetUpdateInput = { ...baseData };
      if (vlanId) { updatePayload.vlan = { connect: { id: vlanId } }; } else { updatePayload.vlan = { disconnect: true }; }
      const createPayload: Prisma.SubnetCreateInput = { ...baseData };
      if (vlanId) { createPayload.vlan = { connect: { id: vlanId } }; }
      await prisma.subnet.upsert({ where: { id: subnetData.id }, update: updatePayload, create: createPayload });
    } catch (e: any) {
      logger.error(`Error seeding subnet ${subnetData.cidr} (ID: ${subnetData.id}):`, e, { name: e.name, message: e.message, stack: e.stack, cidr: subnetData.cidr, id: subnetData.id });
    }
  }
  logger.info(`${mockSubnets.length} Subnets seeded.`);

  // 6. Seed IP Addresses
  logger.info('Start seeding IP Addresses...');
  for (const ipData of seedIPsData) {
    try {
      const {
        subnetId: ipSubnetId, directVlanId, peerUnitName, peerDeviceName, peerPortName,
        selectedAccessType, selectedLocalDeviceName, selectedDevicePort, selectedPaymentSource,
        ...restOfIpData
      } = ipData;
      const baseIpDataPayload = {
        ...restOfIpData, id: ipData.id, status: ipData.status as string,
        peerUnitName: peerUnitName || null, peerDeviceName: peerDeviceName || null, peerPortName: peerPortName || null,
        selectedAccessType: selectedAccessType || null, selectedLocalDeviceName: selectedLocalDeviceName || null,
        selectedDevicePort: selectedDevicePort || null, selectedPaymentSource: selectedPaymentSource || null,
      };
      const updatePayload: Prisma.IPAddressUpdateInput = { ...baseIpDataPayload };
      if (ipSubnetId) { updatePayload.subnet = { connect: { id: ipSubnetId } }; } else { updatePayload.subnet = { disconnect: true }; }
      if (directVlanId) { updatePayload.directVlan = { connect: { id: directVlanId } }; } else { updatePayload.directVlan = { disconnect: true }; }
      const createPayload: Prisma.IPAddressCreateInput = { ...baseIpDataPayload };
      if (ipSubnetId) { createPayload.subnet = { connect: { id: ipSubnetId } }; }
      if (directVlanId) { createPayload.directVlan = { connect: { id: directVlanId } }; }
      await prisma.iPAddress.upsert({ where: { id: ipData.id }, update: updatePayload, create: createPayload });
    } catch (e: any) {
      logger.error(`Error seeding IP Address ${ipData.ipAddress} (ID: ${ipData.id}):`, e, { name: e.name, message: e.message, stack: e.stack, ipDataAttempted: ipData });
    }
  }
  logger.info(`${seedIPsData.length} IP Addresses seeded.`);

  // 7. Seed Device Dictionaries
  logger.info('Start seeding Device Dictionaries...');
  for (const deviceData of mockDeviceDictionaries) {
    try {
      await prisma.deviceDictionary.upsert({ where: { deviceName: deviceData.deviceName }, update: {}, create: deviceData });
    } catch (e: any) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2021') {
        logger.error(`CRITICAL: Table for DeviceDictionary does not exist. Schema out of sync? Message: ${e.message}. Exiting.`, e, { name: e.name, code: e.code });
        process.exit(1);
      }
      logger.error(`Error seeding device dictionary ${deviceData.deviceName}:`, e, { name: e.name, message: e.message, stack: e.stack });
    }
  }
  logger.info(`${mockDeviceDictionaries.length} Device Dictionaries seeded.`);

  // 8. Seed Payment Source Dictionaries
  logger.info('Start seeding Payment Source Dictionaries...');
  for (const paymentData of mockPaymentSourceDictionaries) {
    try {
      await prisma.paymentSourceDictionary.upsert({ where: { sourceName: paymentData.sourceName }, update: {}, create: paymentData });
    } catch (e: any) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2021') {
        logger.error(`CRITICAL: Table for PaymentSourceDictionary does not exist. Schema out of sync? Message: ${e.message}. Exiting.`, e, { name: e.name, code: e.code });
        process.exit(1);
      }
      logger.error(`Error seeding payment source dictionary ${paymentData.sourceName}:`, e, { name: e.name, message: e.message, stack: e.stack });
    }
  }
  logger.info(`${mockPaymentSourceDictionaries.length} Payment Source Dictionaries seeded.`);

  // 9. Seed Access Type Dictionaries
  logger.info('Start seeding Access Type Dictionaries...');
  for (const accessTypeData of mockAccessTypeDictionaries) {
    try {
      await prisma.accessTypeDictionary.upsert({ where: { name: accessTypeData.name }, update: {}, create: accessTypeData });
    } catch (e: any) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2021') {
        logger.error(`CRITICAL: Table for AccessTypeDictionary does not exist. Schema out of sync? Message: ${e.message}. Exiting.`, e, { name: e.name, code: e.code });
        process.exit(1);
      }
      logger.error(`Error seeding access type dictionary ${accessTypeData.name}:`, e, { name: e.name, message: e.message, stack: e.stack });
    }
  }
  logger.info(`${mockAccessTypeDictionaries.length} Access Type Dictionaries seeded.`);

  // 10. Seed Interface Type Dictionaries
  logger.info('Start seeding Interface Type Dictionaries...');
  for (const interfaceTypeData of mockInterfaceTypeDictionaries) {
    try {
      await prisma.interfaceTypeDictionary.upsert({ where: { name: interfaceTypeData.name }, update: { description: interfaceTypeData.description }, create: interfaceTypeData });
    } catch (e: any) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2021') {
        logger.error(`CRITICAL: Table for InterfaceTypeDictionary does not exist. Schema out of sync? Message: ${e.message}. Exiting.`, e, { name: e.name, code: e.code });
        process.exit(1);
      }
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
    logger.error('FATAL ERROR during seeding process:', e, { name: e.name, message: e.message, stack: e.stack });
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    logger.info('Prisma client disconnected.');
    console.log("--- PRISMA SEED SCRIPT: main() finished, client disconnected. ---");
  });

console.log("--- PRISMA SEED SCRIPT (FULL RESTORED LOGIC V2): Script Execution Reached End (before main might have finished) ---");
