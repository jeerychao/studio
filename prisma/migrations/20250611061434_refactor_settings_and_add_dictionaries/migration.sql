/*
  Warnings:

  - You are about to drop the `_PermissionToRole` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `bandwidth` on the `DeviceConnection` table. All the data in the column will be lost.
  - You are about to drop the column `localInterface` on the `DeviceConnection` table. All the data in the column will be lost.
  - You are about to drop the column `remoteHostnameOrIp` on the `DeviceConnection` table. All the data in the column will be lost.
  - You are about to drop the column `remoteInterface` on the `DeviceConnection` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[id]` on the table `IPAddress` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[id]` on the table `Permission` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[id]` on the table `Role` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[id]` on the table `Subnet` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[id]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[id]` on the table `VLAN` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `updatedAt` to the `AuditLog` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "_PermissionToRole_B_index";

-- DropIndex
DROP INDEX "_PermissionToRole_AB_unique";

-- AlterTable
ALTER TABLE "IPAddress" ADD COLUMN "selectedAccessType" TEXT;
ALTER TABLE "IPAddress" ADD COLUMN "selectedDevicePort" TEXT;
ALTER TABLE "IPAddress" ADD COLUMN "selectedLocalDeviceName" TEXT;
ALTER TABLE "IPAddress" ADD COLUMN "selectedOperatorDevice" TEXT;
ALTER TABLE "IPAddress" ADD COLUMN "selectedOperatorName" TEXT;
ALTER TABLE "IPAddress" ADD COLUMN "selectedPaymentSource" TEXT;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "_PermissionToRole";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "OperatorDictionary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "operatorName" TEXT NOT NULL,
    "operatorDevice" TEXT,
    "accessType" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LocalDeviceDictionary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deviceName" TEXT NOT NULL,
    "port" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PaymentSourceDictionary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "_RolePermissions" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_RolePermissions_A_fkey" FOREIGN KEY ("A") REFERENCES "Permission" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_RolePermissions_B_fkey" FOREIGN KEY ("B") REFERENCES "Role" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "username" TEXT,
    "action" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "details" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AuditLog" ("action", "details", "id", "timestamp", "userId", "username") SELECT "action", "details", "id", "timestamp", "userId", "username" FROM "AuditLog";
DROP TABLE "AuditLog";
ALTER TABLE "new_AuditLog" RENAME TO "AuditLog";
CREATE TABLE "new_DeviceConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "localDeviceId" TEXT NOT NULL,
    "localDeviceInterface" TEXT,
    "localIpId" TEXT,
    "remoteDeviceId" TEXT,
    "remoteDeviceInterface" TEXT,
    "remoteIpOrHostname" TEXT,
    "ispId" TEXT,
    "circuitId" TEXT,
    "connectionType" TEXT,
    "status" TEXT,
    "bandwidthMbps" INTEGER,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_DeviceConnection" ("connectionType", "createdAt", "description", "id", "ispId", "localDeviceId", "localIpId", "remoteDeviceId", "status", "updatedAt") SELECT "connectionType", "createdAt", "description", "id", "ispId", "localDeviceId", "localIpId", "remoteDeviceId", "status", "updatedAt" FROM "DeviceConnection";
DROP TABLE "DeviceConnection";
ALTER TABLE "new_DeviceConnection" RENAME TO "DeviceConnection";
CREATE UNIQUE INDEX "DeviceConnection_localIpId_key" ON "DeviceConnection"("localIpId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "OperatorDictionary_operatorName_key" ON "OperatorDictionary"("operatorName");

-- CreateIndex
CREATE UNIQUE INDEX "LocalDeviceDictionary_deviceName_key" ON "LocalDeviceDictionary"("deviceName");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentSourceDictionary_sourceName_key" ON "PaymentSourceDictionary"("sourceName");

-- CreateIndex
CREATE UNIQUE INDEX "_RolePermissions_AB_unique" ON "_RolePermissions"("A", "B");

-- CreateIndex
CREATE INDEX "_RolePermissions_B_index" ON "_RolePermissions"("B");

-- CreateIndex
CREATE UNIQUE INDEX "IPAddress_id_key" ON "IPAddress"("id");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_id_key" ON "Permission"("id");

-- CreateIndex
CREATE UNIQUE INDEX "Role_id_key" ON "Role"("id");

-- CreateIndex
CREATE UNIQUE INDEX "Subnet_id_key" ON "Subnet"("id");

-- CreateIndex
CREATE UNIQUE INDEX "User_id_key" ON "User"("id");

-- CreateIndex
CREATE UNIQUE INDEX "VLAN_id_key" ON "VLAN"("id");
