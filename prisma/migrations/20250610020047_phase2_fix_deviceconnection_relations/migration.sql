/*
  Warnings:

  - Made the column `username` on table `AuditLog` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `updatedAt` to the `IPAddress` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Permission` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Role` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Subnet` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `User` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `VLAN` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "Isp" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "contactInfo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "deviceType" TEXT,
    "location" TEXT,
    "managementIp" TEXT,
    "brand" TEXT,
    "modelNumber" TEXT,
    "serialNumber" TEXT,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DeviceConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "connectionType" TEXT,
    "localIpId" TEXT,
    "localDeviceId" TEXT NOT NULL,
    "remoteIp" TEXT,
    "ispId" TEXT,
    "bandwidth" TEXT,
    "description" TEXT,
    "status" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DeviceConnection_localIpId_fkey" FOREIGN KEY ("localIpId") REFERENCES "IPAddress" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DeviceConnection_localDeviceId_fkey" FOREIGN KEY ("localDeviceId") REFERENCES "Device" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeviceConnection_ispId_fkey" FOREIGN KEY ("ispId") REFERENCES "Isp" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "username" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AuditLog" ("action", "details", "id", "timestamp", "userId", "username") SELECT "action", "details", "id", "timestamp", "userId", "username" FROM "AuditLog";
DROP TABLE "AuditLog";
ALTER TABLE "new_AuditLog" RENAME TO "AuditLog";
CREATE TABLE "new_IPAddress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ipAddress" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "isGateway" BOOLEAN DEFAULT false,
    "allocatedTo" TEXT,
    "usageUnit" TEXT,
    "contactPerson" TEXT,
    "phone" TEXT,
    "description" TEXT,
    "subnetId" TEXT,
    "directVlanId" TEXT,
    "lastSeen" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "IPAddress_subnetId_fkey" FOREIGN KEY ("subnetId") REFERENCES "Subnet" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "IPAddress_directVlanId_fkey" FOREIGN KEY ("directVlanId") REFERENCES "VLAN" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_IPAddress" ("allocatedTo", "contactPerson", "description", "directVlanId", "id", "ipAddress", "isGateway", "lastSeen", "phone", "status", "subnetId", "usageUnit") SELECT "allocatedTo", "contactPerson", "description", "directVlanId", "id", "ipAddress", "isGateway", "lastSeen", "phone", "status", "subnetId", "usageUnit" FROM "IPAddress";
DROP TABLE "IPAddress";
ALTER TABLE "new_IPAddress" RENAME TO "IPAddress";
CREATE TABLE "new_Permission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Permission" ("description", "group", "id", "name") SELECT "description", "group", "id", "name" FROM "Permission";
DROP TABLE "Permission";
ALTER TABLE "new_Permission" RENAME TO "Permission";
CREATE UNIQUE INDEX "Permission_name_key" ON "Permission"("name");
CREATE TABLE "new_Role" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Role" ("description", "id", "name") SELECT "description", "id", "name" FROM "Role";
DROP TABLE "Role";
ALTER TABLE "new_Role" RENAME TO "Role";
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");
CREATE TABLE "new_Subnet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cidr" TEXT NOT NULL,
    "networkAddress" TEXT NOT NULL,
    "subnetMask" TEXT NOT NULL,
    "ipRange" TEXT,
    "name" TEXT,
    "description" TEXT,
    "dhcpEnabled" BOOLEAN DEFAULT false,
    "vlanId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Subnet_vlanId_fkey" FOREIGN KEY ("vlanId") REFERENCES "VLAN" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Subnet" ("cidr", "description", "dhcpEnabled", "id", "ipRange", "name", "networkAddress", "subnetMask", "vlanId") SELECT "cidr", "description", "dhcpEnabled", "id", "ipRange", "name", "networkAddress", "subnetMask", "vlanId" FROM "Subnet";
DROP TABLE "Subnet";
ALTER TABLE "new_Subnet" RENAME TO "Subnet";
CREATE UNIQUE INDEX "Subnet_cidr_key" ON "Subnet"("cidr");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "avatar" TEXT,
    "lastLogin" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_User" ("avatar", "email", "id", "lastLogin", "password", "roleId", "username") SELECT "avatar", "email", "id", "lastLogin", "password", "roleId", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE TABLE "new_VLAN" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vlanNumber" INTEGER NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_VLAN" ("description", "id", "name", "vlanNumber") SELECT "description", "id", "name", "vlanNumber" FROM "VLAN";
DROP TABLE "VLAN";
ALTER TABLE "new_VLAN" RENAME TO "VLAN";
CREATE UNIQUE INDEX "VLAN_vlanNumber_key" ON "VLAN"("vlanNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Isp_name_key" ON "Isp"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Device_name_key" ON "Device"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Device_managementIp_key" ON "Device"("managementIp");

-- CreateIndex
CREATE UNIQUE INDEX "Device_serialNumber_key" ON "Device"("serialNumber");
