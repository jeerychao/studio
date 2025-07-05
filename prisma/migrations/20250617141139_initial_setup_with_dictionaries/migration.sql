-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "phone" TEXT,
    "avatar" TEXT,
    "last_login" DATETIME,
    "role_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
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
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "subnets_vlan_id_fkey" FOREIGN KEY ("vlan_id") REFERENCES "vlans" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
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
    "peer_unit_name" TEXT,
    "peer_device_name" TEXT,
    "peer_port_name" TEXT,
    "selected_local_device_name" TEXT,
    "selected_device_port" TEXT,
    "selected_access_type" TEXT,
    "selected_payment_source" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "ip_addresses_subnet_id_fkey" FOREIGN KEY ("subnet_id") REFERENCES "subnets" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ip_addresses_direct_vlan_id_fkey" FOREIGN KEY ("direct_vlan_id") REFERENCES "vlans" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT,
    "username" TEXT,
    "action" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "details" TEXT,
    CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "device_dictionary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "device_name" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "payment_source_dictionary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source_name" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "access_type_dictionary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "interface_type_dictionary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "_RolePermissions" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_RolePermissions_A_fkey" FOREIGN KEY ("A") REFERENCES "permissions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_RolePermissions_B_fkey" FOREIGN KEY ("B") REFERENCES "roles" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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
CREATE INDEX "subnets_network_address_idx" ON "subnets"("network_address");

-- CreateIndex
CREATE UNIQUE INDEX "vlans_vlan_number_key" ON "vlans"("vlan_number");

-- CreateIndex
CREATE UNIQUE INDEX "ip_addresses_ip_address_key" ON "ip_addresses"("ip_address");

-- CreateIndex
CREATE INDEX "ip_addresses_status_idx" ON "ip_addresses"("status");

-- CreateIndex
CREATE INDEX "ip_addresses_allocated_to_idx" ON "ip_addresses"("allocated_to");

-- CreateIndex
CREATE INDEX "ip_addresses_usage_unit_idx" ON "ip_addresses"("usage_unit");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_timestamp_idx" ON "audit_logs"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "device_dictionary_device_name_key" ON "device_dictionary"("device_name");

-- CreateIndex
CREATE UNIQUE INDEX "payment_source_dictionary_source_name_key" ON "payment_source_dictionary"("source_name");

-- CreateIndex
CREATE UNIQUE INDEX "access_type_dictionary_name_key" ON "access_type_dictionary"("name");

-- CreateIndex
CREATE UNIQUE INDEX "interface_type_dictionary_name_key" ON "interface_type_dictionary"("name");

-- CreateIndex
CREATE UNIQUE INDEX "_RolePermissions_AB_unique" ON "_RolePermissions"("A", "B");

-- CreateIndex
CREATE INDEX "_RolePermissions_B_index" ON "_RolePermissions"("B");
