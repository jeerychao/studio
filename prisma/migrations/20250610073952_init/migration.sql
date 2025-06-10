-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "avatar" TEXT,
    "lastLogin" DATETIME,
    "roleId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VLAN" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vlanNumber" INTEGER NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Subnet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cidr" TEXT NOT NULL,
    "networkAddress" TEXT NOT NULL,
    "subnetMask" TEXT NOT NULL,
    "ipRange" TEXT,
    "name" TEXT,
    "dhcpEnabled" BOOLEAN DEFAULT false,
    "description" TEXT,
    "vlanId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Subnet_vlanId_fkey" FOREIGN KEY ("vlanId") REFERENCES "VLAN" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IPAddress" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "IPAddress_subnetId_fkey" FOREIGN KEY ("subnetId") REFERENCES "Subnet" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "IPAddress_directVlanId_fkey" FOREIGN KEY ("directVlanId") REFERENCES "VLAN" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "username" TEXT,
    "action" TEXT NOT NULL,
    "details" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

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
    "localDeviceId" TEXT NOT NULL,
    "localIpId" TEXT,
    "remoteDeviceId" TEXT,
    "remoteHostnameOrIp" TEXT,
    "ispId" TEXT,
    "connectionType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "bandwidth" TEXT,
    "localInterface" TEXT,
    "remoteInterface" TEXT,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DeviceConnection_localDeviceId_fkey" FOREIGN KEY ("localDeviceId") REFERENCES "Device" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DeviceConnection_localIpId_fkey" FOREIGN KEY ("localIpId") REFERENCES "IPAddress" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DeviceConnection_remoteDeviceId_fkey" FOREIGN KEY ("remoteDeviceId") REFERENCES "Device" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DeviceConnection_ispId_fkey" FOREIGN KEY ("ispId") REFERENCES "Isp" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_PermissionToRole" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_PermissionToRole_A_fkey" FOREIGN KEY ("A") REFERENCES "Permission" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_PermissionToRole_B_fkey" FOREIGN KEY ("B") REFERENCES "Role" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Permission_name_key" ON "Permission"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "VLAN_vlanNumber_key" ON "VLAN"("vlanNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Subnet_cidr_key" ON "Subnet"("cidr");

-- CreateIndex
CREATE UNIQUE INDEX "IPAddress_ipAddress_subnetId_key" ON "IPAddress"("ipAddress", "subnetId");

-- CreateIndex
CREATE UNIQUE INDEX "Isp_name_key" ON "Isp"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Device_name_key" ON "Device"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Device_managementIp_key" ON "Device"("managementIp");

-- CreateIndex
CREATE UNIQUE INDEX "Device_serialNumber_key" ON "Device"("serialNumber");

-- CreateIndex
CREATE UNIQUE INDEX "_PermissionToRole_AB_unique" ON "_PermissionToRole"("A", "B");

-- CreateIndex
CREATE INDEX "_PermissionToRole_B_index" ON "_PermissionToRole"("B");
