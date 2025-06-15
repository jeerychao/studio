/*
  Warnings:

  - You are about to drop the `AccessTypeDictionary` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AuditLog` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `IPAddress` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `LocalDeviceDictionary` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `NetworkInterfaceTypeDictionary` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `OperatorDictionary` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PaymentSourceDictionary` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Permission` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Role` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Subnet` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `User` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `VLAN` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropIndex
DROP INDEX "AccessTypeDictionary_name_key";

-- DropIndex
DROP INDEX "AuditLog_timestamp_idx";

-- DropIndex
DROP INDEX "AuditLog_action_idx";

-- DropIndex
DROP INDEX "AuditLog_userId_idx";

-- DropIndex
DROP INDEX "IPAddress_ipAddress_subnetId_key";

-- DropIndex
DROP INDEX "IPAddress_usageUnit_idx";

-- DropIndex
DROP INDEX "IPAddress_allocatedTo_idx";

-- DropIndex
DROP INDEX "IPAddress_status_idx";

-- DropIndex
DROP INDEX "LocalDeviceDictionary_deviceName_key";

-- DropIndex
DROP INDEX "NetworkInterfaceTypeDictionary_name_key";

-- DropIndex
DROP INDEX "OperatorDictionary_operatorName_key";

-- DropIndex
DROP INDEX "PaymentSourceDictionary_sourceName_key";

-- DropIndex
DROP INDEX "Permission_name_key";

-- DropIndex
DROP INDEX "Role_name_key";

-- DropIndex
DROP INDEX "Subnet_cidr_key";

-- DropIndex
DROP INDEX "User_email_key";

-- DropIndex
DROP INDEX "User_username_key";

-- DropIndex
DROP INDEX "VLAN_vlanNumber_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "AccessTypeDictionary";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "AuditLog";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "IPAddress";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "LocalDeviceDictionary";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "NetworkInterfaceTypeDictionary";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "OperatorDictionary";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "PaymentSourceDictionary";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Permission";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Role";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Subnet";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "User";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "VLAN";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "phone" TEXT,
    "avatar" TEXT,
    "role_id" TEXT NOT NULL,
    "last_login" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "description" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT,
    "username" TEXT,
    "action" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "details" TEXT
);

-- CreateTable
CREATE TABLE "subnets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cidr" TEXT NOT NULL,
    "network_address" TEXT NOT NULL,
    "subnet_mask" TEXT NOT NULL,
    "ip_range" TEXT,
    "name" TEXT,
    "description" TEXT,
    "dhcp_enabled" BOOLEAN DEFAULT false,
    "vlan_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "vlans" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vlan_number" INTEGER NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ip_addresses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ip_address" TEXT NOT NULL,
    "subnet_id" TEXT,
    "direct_vlan_id" TEXT,
    "status" TEXT NOT NULL,
    "is_gateway" BOOLEAN DEFAULT false,
    "allocated_to" TEXT,
    "usage_unit" TEXT,
    "contact_person" TEXT,
    "phone" TEXT,
    "description" TEXT,
    "last_seen" DATETIME,
    "peer_unit_name" TEXT,
    "peer_device_name" TEXT,
    "peer_port_name" TEXT,
    "selected_access_type" TEXT,
    "selected_local_device_name" TEXT,
    "selected_device_port" TEXT,
    "selected_payment_source" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "device_dictionaries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "device_name" TEXT NOT NULL,
    "port" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "payment_source_dictionaries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source_name" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "access_type_dictionaries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "interface_type_dictionaries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new__RolePermissions" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);
INSERT INTO "new__RolePermissions" ("A", "B") SELECT "A", "B" FROM "_RolePermissions";
DROP TABLE "_RolePermissions";
ALTER TABLE "new__RolePermissions" RENAME TO "_RolePermissions";
CREATE UNIQUE INDEX "_RolePermissions_AB_unique" ON "_RolePermissions"("A", "B");
CREATE INDEX "_RolePermissions_B_index" ON "_RolePermissions"("B");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_name_key" ON "permissions"("name");

-- CreateIndex
CREATE UNIQUE INDEX "subnets_cidr_key" ON "subnets"("cidr");

-- CreateIndex
CREATE UNIQUE INDEX "vlans_vlan_number_key" ON "vlans"("vlan_number");

-- CreateIndex
CREATE UNIQUE INDEX "ip_addresses_ip_address_subnet_id_key" ON "ip_addresses"("ip_address", "subnet_id");

-- CreateIndex
CREATE UNIQUE INDEX "device_dictionaries_device_name_key" ON "device_dictionaries"("device_name");

-- CreateIndex
CREATE UNIQUE INDEX "payment_source_dictionaries_source_name_key" ON "payment_source_dictionaries"("source_name");

-- CreateIndex
CREATE UNIQUE INDEX "access_type_dictionaries_name_key" ON "access_type_dictionaries"("name");

-- CreateIndex
CREATE UNIQUE INDEX "interface_type_dictionaries_name_key" ON "interface_type_dictionaries"("name");
