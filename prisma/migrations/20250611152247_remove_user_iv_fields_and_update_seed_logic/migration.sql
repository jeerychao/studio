/*
  Warnings:

  - You are about to drop the `Device` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `DeviceConnection` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Isp` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `passwordIv` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `phoneIv` on the `User` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Device_serialNumber_key";

-- DropIndex
DROP INDEX "Device_managementIp_key";

-- DropIndex
DROP INDEX "Device_name_key";

-- DropIndex
DROP INDEX "DeviceConnection_localIpId_key";

-- DropIndex
DROP INDEX "Isp_name_key";

-- DropIndex
DROP INDEX "Permission_id_key";

-- DropIndex
DROP INDEX "Role_id_key";

-- DropIndex
DROP INDEX "Subnet_id_key";

-- DropIndex
DROP INDEX "VLAN_id_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Device";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "DeviceConnection";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Isp";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_IPAddress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ipAddress" TEXT NOT NULL,
    "subnetId" TEXT,
    "directVlanId" TEXT,
    "status" TEXT NOT NULL,
    "isGateway" BOOLEAN DEFAULT false,
    "allocatedTo" TEXT,
    "usageUnit" TEXT,
    "contactPerson" TEXT,
    "phone" TEXT,
    "description" TEXT,
    "lastSeen" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "selectedOperatorName" TEXT,
    "selectedOperatorDevice" TEXT,
    "selectedAccessType" TEXT,
    "selectedLocalDeviceName" TEXT,
    "selectedDevicePort" TEXT,
    "selectedPaymentSource" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "IPAddress_subnetId_fkey" FOREIGN KEY ("subnetId") REFERENCES "Subnet" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "IPAddress_directVlanId_fkey" FOREIGN KEY ("directVlanId") REFERENCES "VLAN" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_IPAddress" ("allocatedTo", "contactPerson", "createdAt", "description", "directVlanId", "id", "ipAddress", "isGateway", "lastSeen", "phone", "selectedAccessType", "selectedDevicePort", "selectedLocalDeviceName", "selectedOperatorDevice", "selectedOperatorName", "selectedPaymentSource", "status", "subnetId", "updatedAt", "usageUnit") SELECT "allocatedTo", "contactPerson", "createdAt", "description", "directVlanId", "id", "ipAddress", "isGateway", "lastSeen", "phone", "selectedAccessType", "selectedDevicePort", "selectedLocalDeviceName", "selectedOperatorDevice", "selectedOperatorName", "selectedPaymentSource", "status", "subnetId", "updatedAt", "usageUnit" FROM "IPAddress";
DROP TABLE "IPAddress";
ALTER TABLE "new_IPAddress" RENAME TO "IPAddress";
CREATE UNIQUE INDEX "IPAddress_ipAddress_subnetId_key" ON "IPAddress"("ipAddress", "subnetId");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "phone" TEXT,
    "avatar" TEXT,
    "roleId" TEXT NOT NULL,
    "lastLogin" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_User" ("avatar", "createdAt", "email", "id", "lastLogin", "password", "phone", "roleId", "updatedAt", "username") SELECT "avatar", "createdAt", "email", "id", "lastLogin", "password", "phone", "roleId", "updatedAt", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
