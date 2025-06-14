/*
  Warnings:

  - You are about to drop the column `createdAt` on the `AuditLog` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `AuditLog` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "username" TEXT,
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
    "subnetId" TEXT,
    "directVlanId" TEXT,
    "status" TEXT NOT NULL,
    "isGateway" BOOLEAN DEFAULT false,
    "allocatedTo" TEXT,
    "usageUnit" TEXT,
    "contactPerson" TEXT,
    "phone" TEXT,
    "description" TEXT,
    "lastSeen" DATETIME,
    "selectedOperatorName" TEXT,
    "selectedOperatorDevice" TEXT,
    "selectedAccessType" TEXT,
    "selectedLocalDeviceName" TEXT,
    "selectedDevicePort" TEXT,
    "selectedPaymentSource" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "IPAddress_subnetId_fkey" FOREIGN KEY ("subnetId") REFERENCES "Subnet" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "IPAddress_directVlanId_fkey" FOREIGN KEY ("directVlanId") REFERENCES "VLAN" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_IPAddress" ("allocatedTo", "contactPerson", "createdAt", "description", "directVlanId", "id", "ipAddress", "isGateway", "lastSeen", "phone", "selectedAccessType", "selectedDevicePort", "selectedLocalDeviceName", "selectedOperatorDevice", "selectedOperatorName", "selectedPaymentSource", "status", "subnetId", "updatedAt", "usageUnit") SELECT "allocatedTo", "contactPerson", "createdAt", "description", "directVlanId", "id", "ipAddress", "isGateway", "lastSeen", "phone", "selectedAccessType", "selectedDevicePort", "selectedLocalDeviceName", "selectedOperatorDevice", "selectedOperatorName", "selectedPaymentSource", "status", "subnetId", "updatedAt", "usageUnit" FROM "IPAddress";
DROP TABLE "IPAddress";
ALTER TABLE "new_IPAddress" RENAME TO "IPAddress";
CREATE INDEX "IPAddress_status_idx" ON "IPAddress"("status");
CREATE INDEX "IPAddress_allocatedTo_idx" ON "IPAddress"("allocatedTo");
CREATE INDEX "IPAddress_selectedOperatorName_idx" ON "IPAddress"("selectedOperatorName");
CREATE INDEX "IPAddress_selectedLocalDeviceName_idx" ON "IPAddress"("selectedLocalDeviceName");
CREATE UNIQUE INDEX "IPAddress_ipAddress_subnetId_key" ON "IPAddress"("ipAddress", "subnetId");
CREATE TABLE "new_Subnet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cidr" TEXT NOT NULL,
    "networkAddress" TEXT NOT NULL,
    "subnetMask" TEXT NOT NULL,
    "ipRange" TEXT,
    "name" TEXT,
    "dhcpEnabled" BOOLEAN DEFAULT false,
    "vlanId" TEXT,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Subnet_vlanId_fkey" FOREIGN KEY ("vlanId") REFERENCES "VLAN" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Subnet" ("cidr", "createdAt", "description", "dhcpEnabled", "id", "ipRange", "name", "networkAddress", "subnetMask", "updatedAt", "vlanId") SELECT "cidr", "createdAt", "description", "dhcpEnabled", "id", "ipRange", "name", "networkAddress", "subnetMask", "updatedAt", "vlanId" FROM "Subnet";
DROP TABLE "Subnet";
ALTER TABLE "new_Subnet" RENAME TO "Subnet";
CREATE UNIQUE INDEX "Subnet_cidr_key" ON "Subnet"("cidr");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "phone" TEXT,
    "roleId" TEXT NOT NULL,
    "avatar" TEXT DEFAULT '/images/avatars/default_avatar.png',
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
