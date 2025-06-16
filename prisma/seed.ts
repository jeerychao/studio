
// --- PRISMA SEED SCRIPT (FULL RESTORED LOGIC V2) ---
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
  seedIPsData,
  mockDeviceDictionaries,
  mockPaymentSourceDictionaries,
  mockAccessTypeDictionaries,
  mockInterfaceTypeDictionaries,
} from '../src/lib/data';
import { logger } from '../src/lib/logger';

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
        password: password || encrypt("FallbackDefaultPassword1!"),
      };
      // Users are typically upserted based on a unique business key like email.
      // If 'id' is also predefined in mockUsers and is the primary key,
      // you might want to use 'where: { id: userData.id }' if email can change.
      // For now, assuming email is the stable unique key for upsert lookup.
      await prisma.user.upsert({
        where: { email: userData.email },
        update: dataToUpsert,
        create: dataToUpsert, // This includes the 'id' from mockUsers if it exists
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
        // Assuming vlanNumber is unique for VLANs
        where: { vlanNumber: vlanData.vlanNumber },
        update: { name: vlanData.name, description: vlanData.description },
        create: vlanData, // This includes the 'id' from mockVLANs
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
      const createOrUpdatePayload: Prisma.SubnetCreateInput & Prisma.SubnetUpdateInput = { ...restOfSubnetData };
      if (vlanId) {
        createOrUpdatePayload.vlan = { connect: { id: vlanId } };
      } else {
        // Explicitly set vlan to disconnect if vlanId is not provided,
        // useful for updates where a vlan might be removed.
        createOrUpdatePayload.vlan = { disconnect: true };
      }
      
      await prisma.subnet.upsert({
        where: { id: subnetData.id }, // Use the predefined ID for lookup
        update: createOrUpdatePayload,
        create: {
          ...createOrUpdatePayload,
          id: subnetData.id, // Ensure ID is part of create payload
        },
      });
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

      const createOrUpdatePayload: Prisma.IPAddressCreateInput & Prisma.IPAddressUpdateInput = {
        ...restOfIpData,
        status: ipData.status as string,
        peerUnitName: peerUnitName || null,
        peerDeviceName: peerDeviceName || null,
        peerPortName: peerPortName || null,
        selectedAccessType: selectedAccessType || null,
        selectedLocalDeviceName: selectedLocalDeviceName || null,
        selectedDevicePort: selectedDevicePort || null,
        selectedPaymentSource: selectedPaymentSource || null,
      };

      if (ipSubnetId) {
        createOrUpdatePayload.subnet = { connect: { id: ipSubnetId } };
      } else {
        createOrUpdatePayload.subnet = { disconnect: true };
      }
      if (directVlanId) {
        createOrUpdatePayload.directVlan = { connect: { id: directVlanId } };
      } else {
        createOrUpdatePayload.directVlan = { disconnect: true };
      }
      
      await prisma.iPAddress.upsert({
        where: { id: ipData.id }, // Use the predefined ID for lookup
        update: createOrUpdatePayload,
        create: {
            ...createOrUpdatePayload,
            id: ipData.id // Ensure ID is part of create payload
        },
      });
    } catch (e: any) {
      logger.error(`Error seeding IP Address ${ipData.ipAddress} (ID: ${ipData.id}):`, e, { name: e.name, message: e.message, stack: e.stack, ipDataAttempted: ipData });
    }
  }
  logger.info(`${seedIPsData.length} IP Addresses seeded.`);

  // 7. Seed Device Dictionaries
  logger.info('Start seeding Device Dictionaries...');
  for (const deviceData of mockDeviceDictionaries) {
    try {
      await prisma.deviceDictionary.upsert({
        where: { deviceName: deviceData.deviceName }, // deviceName is unique
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
        where: { sourceName: paymentData.sourceName }, // sourceName is unique
        update: {}, 
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
        where: { name: accessTypeData.name }, // name is unique
        update: {}, 
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
        where: { name: interfaceTypeData.name }, // name is unique
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
    logger.error('FATAL ERROR during seeding process:', e, { name: e.name, message: e.message, stack: e.stack });
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    logger.info('Prisma client disconnected.');
    console.log("--- PRISMA SEED SCRIPT: main() finished, client disconnected. ---");
  });

console.log("--- PRISMA SEED SCRIPT (FULL RESTORED LOGIC V2): Script Execution Reached End (before main might have finished) ---");

    
