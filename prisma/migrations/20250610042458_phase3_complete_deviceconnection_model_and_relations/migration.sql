/*
  Warnings:

  - You are about to drop the `_RolePermissions` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `remoteIp` on the `DeviceConnection` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[ipAddress,subnetId]` on the table `IPAddress` will be added. If there are existing duplicate values, this will fail.
  - Made the column `connectionType` on table `DeviceConnection` required. This step will fail if there are existing NULL values in that column.
  - Made the column `status` on table `DeviceConnection` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "_RolePermissions_B_index";

-- DropIndex
DROP INDEX "_RolePermissions_AB_unique";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "_RolePermissions";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "_RoleToPermissions" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_RoleToPermissions_A_fkey" FOREIGN KEY ("A") REFERENCES "Permission" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_RoleToPermissions_B_fkey" FOREIGN KEY ("B") REFERENCES "Role" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DeviceConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "description" TEXT,
    "connectionType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "bandwidth" TEXT,
    "localDeviceId" TEXT NOT NULL,
    "localInterface" TEXT,
    "localIpId" TEXT,
    "remoteDeviceId" TEXT,
    "remoteHostnameOrIp" TEXT,
    "remoteInterface" TEXT,
    "ispId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DeviceConnection_localDeviceId_fkey" FOREIGN KEY ("localDeviceId") REFERENCES "Device" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeviceConnection_localIpId_fkey" FOREIGN KEY ("localIpId") REFERENCES "IPAddress" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DeviceConnection_remoteDeviceId_fkey" FOREIGN KEY ("remoteDeviceId") REFERENCES "Device" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DeviceConnection_ispId_fkey" FOREIGN KEY ("ispId") REFERENCES "Isp" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_DeviceConnection" ("bandwidth", "connectionType", "createdAt", "description", "id", "ispId", "localDeviceId", "localIpId", "status", "updatedAt") SELECT "bandwidth", "connectionType", "createdAt", "description", "id", "ispId", "localDeviceId", "localIpId", "status", "updatedAt" FROM "DeviceConnection";
DROP TABLE "DeviceConnection";
ALTER TABLE "new_DeviceConnection" RENAME TO "DeviceConnection";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "_RoleToPermissions_AB_unique" ON "_RoleToPermissions"("A", "B");

-- CreateIndex
CREATE INDEX "_RoleToPermissions_B_index" ON "_RoleToPermissions"("B");

-- CreateIndex
CREATE UNIQUE INDEX "IPAddress_ipAddress_subnetId_key" ON "IPAddress"("ipAddress", "subnetId");
