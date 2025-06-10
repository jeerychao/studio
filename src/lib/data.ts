
import type { Subnet, VLAN, IPAddress, User, Role, RoleName, Permission, PermissionId, AuditLog, IPAddressStatus, ISP, Device, DeviceConnection, DeviceConnectionType, DeviceConnectionStatus } from '../types';
import { PERMISSIONS, DeviceType } from '../types';
import { calculateIpRange, calculateNetworkAddress, getPrefixFromCidr, prefixToSubnetMask } from './ip-utils';

export const ADMIN_ROLE_ID = 'role_admin_fixed_id';
export const OPERATOR_ROLE_ID = 'role_operator_fixed_id';
export const VIEWER_ROLE_ID = 'role_viewer_fixed_id';

export const mockPermissions: Permission[] = [
  { id: PERMISSIONS.VIEW_DASHBOARD, name: 'View Dashboard', group: 'Dashboard', description: 'Can view the main dashboard overview.' },
  { id: PERMISSIONS.VIEW_SUBNET, name: 'View Subnets', group: 'Subnet Management', description: 'Can view subnet details and listings.' },
  { id: PERMISSIONS.CREATE_SUBNET, name: 'Create Subnets', group: 'Subnet Management', description: 'Can add new subnets.' },
  { id: PERMISSIONS.EDIT_SUBNET, name: 'Edit Subnets', group: 'Subnet Management', description: 'Can modify existing subnets (CIDR, VLAN, description).' },
  { id: PERMISSIONS.DELETE_SUBNET, name: 'Delete Subnets', group: 'Subnet Management', description: 'Can remove subnets (if empty or conditions met).' },
  { id: PERMISSIONS.VIEW_VLAN, name: 'View VLANs', group: 'VLAN Management', description: 'Can view VLAN details and listings.' },
  { id: PERMISSIONS.CREATE_VLAN, name: 'Create VLANs', group: 'VLAN Management', description: 'Can add new VLANs.' },
  { id: PERMISSIONS.EDIT_VLAN, name: 'Edit VLANs', group: 'VLAN Management', description: 'Can modify existing VLANs (number, name, description).' },
  { id: PERMISSIONS.DELETE_VLAN, name: 'Delete VLANs', group: 'VLAN Management', description: 'Can remove VLANs (if not in use).' },
  { id: PERMISSIONS.VIEW_IPADDRESS, name: 'View IP Addresses', group: 'IP Address Management', description: 'Can view IP address details and listings.' },
  { id: PERMISSIONS.CREATE_IPADDRESS, name: 'Create IP Addresses', group: 'IP Address Management', description: 'Can add new IP addresses.' },
  { id: PERMISSIONS.EDIT_IPADDRESS, name: 'Edit IP Addresses', group: 'IP Address Management', description: 'Can modify existing IP addresses (status, allocation, etc.).' },
  { id: PERMISSIONS.DELETE_IPADDRESS, name: 'Delete IP Addresses', group: 'IP Address Management', description: 'Can remove IP addresses (if not allocated/reserved or conditions met).' },
  { id: PERMISSIONS.VIEW_USER, name: 'View Users', group: 'User Management', description: 'Can view user accounts and their roles.' },
  { id: PERMISSIONS.CREATE_USER, name: 'Create Users', group: 'User Management', description: 'Can create new user accounts.' },
  { id: PERMISSIONS.EDIT_USER, name: 'Edit Users & Assign Roles', group: 'User Management', description: 'Can modify user details and change their roles.' },
  { id: PERMISSIONS.DELETE_USER, name: 'Delete Users', group: 'User Management', description: 'Can delete user accounts.' },
  { id: PERMISSIONS.VIEW_ROLE, name: 'View Roles', group: 'Role Management', description: 'Can view role details and their permissions.' },
  { id: PERMISSIONS.EDIT_ROLE_DESCRIPTION, name: 'Edit Role Descriptions', group: 'Role Management', description: 'Can change the description of existing roles.' },
  { id: PERMISSIONS.EDIT_ROLE_PERMISSIONS, name: 'Edit Role Permissions', group: 'Role Management', description: 'Can modify the permissions assigned to roles (except Admin role).' },
  { id: PERMISSIONS.VIEW_AUDIT_LOG, name: 'View Audit Logs', group: 'System Logs', description: 'Can view system activity and audit trails.' },
  { id: PERMISSIONS.DELETE_AUDIT_LOG, name: 'Delete Audit Logs', group: 'System Logs', description: 'Can delete audit log entries.' },
  { id: PERMISSIONS.VIEW_TOOLS_IMPORT_EXPORT, name: 'View Import/Export Tool', group: 'Tools', description: 'Can access the data import/export page.' },
  { id: PERMISSIONS.PERFORM_TOOLS_IMPORT, name: 'Perform Data Import', group: 'Tools', description: 'Can import data from files (e.g., Excel, CSV).' },
  { id: PERMISSIONS.PERFORM_TOOLS_EXPORT, name: 'Perform Data Export', group: 'Tools', description: 'Can export data to files (e.g., CSV).' },
  { id: PERMISSIONS.VIEW_SETTINGS, name: 'View Settings', group: 'System Settings', description: 'Can view application-wide settings.' },
  { id: PERMISSIONS.VIEW_QUERY_PAGE, name: 'View Query Page', group: 'Query Tool', description: 'Access the comprehensive query tool.' },
  { id: PERMISSIONS.VIEW_ISP, name: 'View ISPs', group: 'ISP Management', description: 'Can view ISP details.' },
  { id: PERMISSIONS.CREATE_ISP, name: 'Create ISPs', group: 'ISP Management', description: 'Can add new ISPs.' },
  { id: PERMISSIONS.EDIT_ISP, name: 'Edit ISPs', group: 'ISP Management', description: 'Can modify existing ISPs.' },
  { id: PERMISSIONS.DELETE_ISP, name: 'Delete ISPs', group: 'ISP Management', description: 'Can remove ISPs.' },
  { id: PERMISSIONS.VIEW_DEVICE, name: 'View Devices', group: 'Device Management', description: 'Can view device details.' },
  { id: PERMISSIONS.CREATE_DEVICE, name: 'Create Devices', group: 'Device Management', description: 'Can add new devices.' },
  { id: PERMISSIONS.EDIT_DEVICE, name: 'Edit Devices', group: 'Device Management', description: 'Can modify existing devices.' },
  { id: PERMISSIONS.DELETE_DEVICE, name: 'Delete Devices', group: 'Device Management', description: 'Can remove devices.' },
  { id: PERMISSIONS.VIEW_DEVICECONNECTION, name: 'View Device Connections', group: 'Device Connection Management', description: 'Can view device connection details.' },
  { id: PERMISSIONS.CREATE_DEVICECONNECTION, name: 'Create Device Connections', group: 'Device Connection Management', description: 'Can add new device connections.' },
  { id: PERMISSIONS.EDIT_DEVICECONNECTION, name: 'Edit Device Connections', group: 'Device Connection Management', description: 'Can modify existing device connections.' },
  { id: PERMISSIONS.DELETE_DEVICECONNECTION, name: 'Delete Device Connections', group: 'Device Connection Management', description: 'Can remove device connections.' },
];

function createInitialSubnetSeedData(
  id: string,
  cidr: string,
  name?: string,
  dhcpEnabled?: boolean,
  vlanId?: string,
  description?: string
): Omit<Subnet, 'utilization'> {
  const prefix = getPrefixFromCidr(cidr);
  const ipPart = cidr.split('/')[0];
  const networkAddress = calculateNetworkAddress(ipPart, prefix);
  const subnetMask = prefixToSubnetMask(prefix);
  const ipRange = calculateIpRange(networkAddress, prefix) || undefined;

  return {
    id,
    cidr,
    networkAddress,
    subnetMask,
    ipRange,
    name: name || undefined,
    dhcpEnabled: dhcpEnabled ?? false,
    vlanId,
    description,
  };
}

export const mockSubnets: Omit<Subnet, 'utilization'>[] = [
  createInitialSubnetSeedData('seed_subnet_001', '192.168.1.0/24', 'Main Office Network', true, 'seed_vlan_001', 'Primary network for office staff and devices.'),
  createInitialSubnetSeedData('seed_subnet_002', '10.0.0.0/16', 'Server Farm Segment', false, 'seed_vlan_002', 'Houses all production and staging servers.'),
  createInitialSubnetSeedData('seed_subnet_003', '172.16.0.0/20', 'Guest WiFi Zone', true, undefined, 'Isolated network for guest internet access.'),
];

export const mockVLANs: Omit<VLAN, 'subnetCount'>[] = [
  { id: 'seed_vlan_001', vlanNumber: 10, name: 'Office VLAN', description: 'Main office users and devices' },
  { id: 'seed_vlan_002', vlanNumber: 20, name: 'Servers', description: 'Production and staging servers' },
  { id: 'seed_vlan_003', vlanNumber: 30, name: 'Guest WiFi', description: 'Internet access for guests (untrusted)' },
  { id: 'seed_vlan_004', vlanNumber: 40, name: 'Legacy Devices', description: 'Legacy Devices VLAN' },
];

export const mockIPAddresses: IPAddress[] = [
  {
    id: 'seed_ip_001', ipAddress: '192.168.1.1', subnetId: 'seed_subnet_001', status: 'allocated' as IPAddressStatus,
    isGateway: true, allocatedTo: 'Office Router', usageUnit: 'IT Department', contactPerson: 'Admin', phone: '123-001', description: 'Default Gateway for Office Network'
  },
  {
    id: 'seed_ip_002', ipAddress: '192.168.1.10', subnetId: 'seed_subnet_001', status: 'allocated' as IPAddressStatus,
    isGateway: false, allocatedTo: 'John Doe\'s PC', usageUnit: 'Marketing Department', contactPerson: 'John Doe', phone: '123-101', description: 'John - Primary Workstation'
  },
  {
    id: 'seed_ip_003', ipAddress: '192.168.1.11', subnetId: 'seed_subnet_001', status: 'free' as IPAddressStatus,
    isGateway: false,
  },
  {
    id: 'seed_ip_004', ipAddress: '192.168.1.12', subnetId: 'seed_subnet_001', status: 'reserved' as IPAddressStatus,
    isGateway: false, description: 'Future Printer IP', usageUnit: 'Admin Office'
  },
  {
    id: 'seed_ip_005', ipAddress: '10.0.0.1', subnetId: 'seed_subnet_002', status: 'allocated' as IPAddressStatus,
    isGateway: true, allocatedTo: 'Server Farm Router', description: 'Gateway for Servers'
  },
  {
    id: 'seed_ip_006', ipAddress: '10.0.1.5', subnetId: 'seed_subnet_002', directVlanId: 'seed_vlan_002', status: 'allocated' as IPAddressStatus,
    isGateway: false, allocatedTo: 'WebServer01', usageUnit: 'Web Services Team', contactPerson: 'Jane Smith', phone: '123-201', description: 'Main Web Server'
  },
  {
    id: 'seed_ip_007', ipAddress: '10.0.1.6', subnetId: 'seed_subnet_002', directVlanId: 'seed_vlan_002', status: 'allocated' as IPAddressStatus,
    isGateway: false, allocatedTo: 'DBServer01', usageUnit: 'Database Team', contactPerson: 'Robert Brown', phone: '123-202', description: 'Primary Database Server'
  },
];

export const mockRoles: Role[] = [
  {
    id: ADMIN_ROLE_ID,
    name: 'Administrator' as RoleName,
    description: 'Full system access. Can manage all resources, users, roles, and system settings.',
    permissions: mockPermissions.map(p => p.id as PermissionId)
  },
  {
    id: OPERATOR_ROLE_ID,
    name: 'Operator' as RoleName,
    description: 'Manages IP resources. Cannot manage users, roles, or most system settings.',
    permissions: [
      PERMISSIONS.VIEW_DASHBOARD,
      PERMISSIONS.VIEW_SUBNET, PERMISSIONS.CREATE_SUBNET, PERMISSIONS.EDIT_SUBNET, PERMISSIONS.DELETE_SUBNET,
      PERMISSIONS.VIEW_VLAN, PERMISSIONS.CREATE_VLAN, PERMISSIONS.EDIT_VLAN, PERMISSIONS.DELETE_VLAN,
      PERMISSIONS.VIEW_IPADDRESS, PERMISSIONS.CREATE_IPADDRESS, PERMISSIONS.EDIT_IPADDRESS, PERMISSIONS.DELETE_IPADDRESS,
      PERMISSIONS.VIEW_AUDIT_LOG,
      PERMISSIONS.VIEW_QUERY_PAGE,
      PERMISSIONS.VIEW_TOOLS_IMPORT_EXPORT, PERMISSIONS.PERFORM_TOOLS_EXPORT,
      PERMISSIONS.VIEW_ISP, PERMISSIONS.CREATE_ISP, PERMISSIONS.EDIT_ISP, PERMISSIONS.DELETE_ISP,
      PERMISSIONS.VIEW_DEVICE, PERMISSIONS.CREATE_DEVICE, PERMISSIONS.EDIT_DEVICE, PERMISSIONS.DELETE_DEVICE,
      PERMISSIONS.VIEW_DEVICECONNECTION, PERMISSIONS.CREATE_DEVICECONNECTION, PERMISSIONS.EDIT_DEVICECONNECTION, PERMISSIONS.DELETE_DEVICECONNECTION,
    ] as PermissionId[]
  },
  {
    id: VIEWER_ROLE_ID,
    name: 'Viewer' as RoleName,
    description: 'Read-only access to IP resources and dashboard.',
    permissions: [
      PERMISSIONS.VIEW_DASHBOARD,
      PERMISSIONS.VIEW_SUBNET,
      PERMISSIONS.VIEW_VLAN,
      PERMISSIONS.VIEW_IPADDRESS,
      PERMISSIONS.VIEW_AUDIT_LOG,
      PERMISSIONS.VIEW_QUERY_PAGE,
      PERMISSIONS.VIEW_ISP,
      PERMISSIONS.VIEW_DEVICE,
      PERMISSIONS.VIEW_DEVICECONNECTION,
    ] as PermissionId[]
  },
];

export const mockUsers: Array<User & { password?: string }> = [
  { id: 'seed_user_admin', username: 'admin', email: 'admin@example.com', roleId: ADMIN_ROLE_ID, password: 'admin', avatar: '/images/avatars/admin_avatar.png', lastLogin: new Date(Date.now() - 86400000).toISOString() },
  { id: 'seed_user_operator', username: 'operator', email: 'operator@example.com', roleId: OPERATOR_ROLE_ID, password: 'operator', avatar: '/images/avatars/operator_avatar.png', lastLogin: new Date(Date.now() - 3600000).toISOString() },
  { id: 'seed_user_viewer', username: 'viewer', email: 'viewer@example.com', roleId: VIEWER_ROLE_ID, password: 'viewer', avatar: '/images/avatars/viewer_avatar.png', lastLogin: new Date().toISOString() },
];

export let mockAuditLogs: AuditLog[] = [
  { id: 'seed_log_001', userId: 'seed_user_admin', username: 'admin', action: 'create_subnet_seed', timestamp: new Date(Date.now() - 3600000 * 2).toISOString(), details: 'Seeded subnet 172.16.0.0/20 (Guest WiFi Zone)' },
  { id: 'seed_log_002', userId: 'seed_user_operator', username: 'operator', action: 'assign_ip_seed', timestamp: new Date(Date.now() - 3600000).toISOString(), details: 'Seeded IP 192.168.1.10 to John Doe\'s PC' },
  { id: 'seed_log_003', userId: 'seed_user_admin', username: 'admin', action: 'update_vlan_seed', timestamp: new Date().toISOString(), details: 'Seeded VLAN 10 (Office VLAN) description update' },
  { id: 'seed_log_004', userId: 'seed_user_admin', username: 'admin', action: 'user_login_seed', timestamp: new Date(Date.now() - 86400000).toISOString(), details: 'User admin successfully logged in.' },
];

export const mockISPs: Omit<ISP, 'id' | 'createdAt' | 'updatedAt'>[] = [
  { name: '中国电信 (China Telecom)', description: '主要固网和移动运营商', contactInfo: '客服热线: 10000' },
  { name: '中国联通 (China Unicom)', description: '主要固网和移动运营商', contactInfo: '客服热线: 10010' },
  { name: '中国移动 (China Mobile)', description: '主要移动和固网运营商', contactInfo: '客服热线: 10086' },
  { name: '教育网 (CERNET)', description: '中国教育和科研计算机网', contactInfo: 'noc@cernet.com' },
];

export const mockDevices: Omit<Device, 'id' | 'createdAt' | 'updatedAt'>[] = [
  { name: 'Core-Switch-Alpha', deviceType: DeviceType.SWITCH, location: '主数据中心 A1柜', managementIp: '10.200.0.1', serialNumber: 'UNIQUE_SN_CS_ALPHA', brand: 'H3C', modelNumber: 'S7506E', description: '核心汇聚交换机 Alpha' },
  { name: 'Edge-Router-Main-Telecom', deviceType: DeviceType.ROUTER, location: '电信接入间', managementIp: '10.200.1.1', serialNumber: 'UNIQUE_SN_ERT_MAIN_TELECOM', brand: 'Huawei', modelNumber: 'NE40E-X8', description: '电信主出口路由器' },
  { name: 'Firewall-Perimeter', deviceType: DeviceType.FIREWALL, location: '主数据中心 安全区', managementIp: '10.200.2.1', serialNumber: 'UNIQUE_SN_FW_PERIMETER', brand: 'Hillstone', modelNumber: 'SG-6000-E5960', description: '边界主防火墙' },
  { name: 'AP-Office-F1-ZoneA', deviceType: DeviceType.ACCESS_POINT, location: '办公区一层 区域A', managementIp: '10.200.3.1', serialNumber: 'UNIQUE_SN_AP_F1ZA', brand: 'Ruijie', modelNumber: 'RG-AP820-L(V2)', description: '一层办公区AP 01' },
  { name: 'Server-VMHost-Node01', deviceType: DeviceType.SERVER, location: '服务器区 B2柜', managementIp: '10.200.4.1', serialNumber: 'UNIQUE_SN_SRV_VMH01', brand: 'Dell', modelNumber: 'PowerEdge R740', description: '虚拟化宿主机 01' },
  { name: 'OLT-Campus-West', deviceType: DeviceType.OLT, location: '园区西栋弱电间', managementIp: '10.200.5.1', serialNumber: 'UNIQUE_SN_OLT_CW', brand: 'ZTE', modelNumber: 'C300', description: '西栋楼宇OLT设备' },
  { name: 'Router-Branch-East', deviceType: DeviceType.ROUTER, location: '东部分公司机房', managementIp: '10.200.6.1', serialNumber: 'UNIQUE_SN_RTR_BE', brand: 'Cisco', modelNumber: '2901', description: '东部分公司接入路由' },
  { name: 'Edge-Router-Backup-Unicom', deviceType: DeviceType.ROUTER, location: '联通接入间', managementIp: '10.200.7.1', serialNumber: 'UNIQUE_SN_ERT_BACKUP_UNICOM', brand: 'Juniper', modelNumber: 'MX204', description: '联通备份出口路由器' },
  { name: 'Core-Switch-Bravo', deviceType: DeviceType.SWITCH, location: '主数据中心 B1柜', managementIp: '10.200.8.1', serialNumber: 'UNIQUE_SN_CS_BRAVO', brand: 'H3C', modelNumber: 'S7506E', description: '核心汇聚交换机 Bravo (冗余)' },
  { name: 'Workgroup-Switch-Finance', deviceType: DeviceType.SWITCH, location: '财务部办公室', managementIp: undefined, serialNumber: 'UNIQUE_SN_SW_FIN', brand: 'Netgear', modelNumber: 'GS108', description: '财务部非管理型桌面交换机' },
  { name: 'Workgroup-Switch-HR', deviceType: DeviceType.SWITCH, location: '人力资源部机柜', managementIp: undefined, serialNumber: 'UNIQUE_SN_SW_HR', brand: 'TP-Link', modelNumber: 'TL-SG1008D', description: '人力部非管理型桌面交换机' },
];

// Assign sequential IDs after mock data definition
mockISPs.forEach((isp, index) => {
  (isp as any).id = `seed_isp_${index.toString().padStart(3, '0')}`;
});
mockDevices.forEach((device, index) => {
  (device as any).id = `seed_device_${index.toString().padStart(3, '0')}`;
});


export const mockDeviceConnections: Omit<DeviceConnection, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    localDeviceId: 'seed_device_000', // Core-Switch-Alpha
    remoteDeviceId: 'seed_device_001', // Edge-Router-Main-Telecom
    connectionType: 'ETHERNET_FIBER' as DeviceConnectionType,
    status: 'ACTIVE' as DeviceConnectionStatus,
    bandwidth: '10 Gbps',
    localInterface: 'Ten-GigabitEthernet1/0/1',
    remoteInterface: 'GigabitEthernet0/0/1',
    description: 'Uplink from Core Switch Alpha to Main Telecom Edge Router',
  },
  {
    localDeviceId: 'seed_device_001', // Edge-Router-Main-Telecom
    remoteHostnameOrIp: '202.96.128.86',
    ispId: 'seed_isp_000', // China Telecom
    connectionType: 'ETHERNET_FIBER' as DeviceConnectionType,
    status: 'ACTIVE' as DeviceConnectionStatus,
    bandwidth: '1 Gbps',
    localInterface: 'GigabitEthernet0/0/0',
    description: 'Primary internet connection via China Telecom',
  },
  {
    localDeviceId: 'seed_device_000', // Core-Switch-Alpha
    localIpId: 'seed_ip_001', // 192.168.1.1 (assuming this IP is on Core-Switch-Alpha for management or SVI)
    remoteDeviceId: 'seed_device_002', // Firewall-Perimeter
    connectionType: 'ETHERNET_FIBER' as DeviceConnectionType,
    status: 'ACTIVE' as DeviceConnectionStatus,
    bandwidth: '10 Gbps',
    localInterface: 'Ten-GigabitEthernet1/0/2',
    remoteInterface: 'eth1/1',
    description: 'Connection from Core Switch Alpha to Perimeter Firewall',
  },
  {
    localDeviceId: 'seed_device_007', // Edge-Router-Backup-Unicom
    remoteHostnameOrIp: '210.22.84.3',
    ispId: 'seed_isp_001', // China Unicom
    connectionType: 'ETHERNET_FIBER' as DeviceConnectionType,
    status: 'STANDBY' as DeviceConnectionStatus,
    bandwidth: '500 Mbps',
    localInterface: 'ge-0/0/0',
    description: 'Backup internet connection via China Unicom',
  },
  {
    localDeviceId: 'seed_device_004', // Server-VMHost-Node01
    remoteDeviceId: 'seed_device_000', // Core-Switch-Alpha
    localIpId: 'seed_ip_006', // 10.0.1.5 (IP of Server-VMHost-Node01)
    connectionType: 'ETHERNET_COPPER' as DeviceConnectionType,
    status: 'ACTIVE' as DeviceConnectionStatus,
    bandwidth: '2x1 Gbps LACP',
    localInterface: 'bond0 (eth0, eth1)',
    remoteInterface: 'GigabitEthernet1/0/10, GigabitEthernet1/0/11',
    description: 'Dual link from VMHost-Node01 to Core Switch Alpha',
  },
   {
    localDeviceId: 'seed_device_003', // AP-Office-F1-ZoneA
    remoteDeviceId: 'seed_device_000', // Core-Switch-Alpha
    connectionType: 'ETHERNET_COPPER' as DeviceConnectionType,
    status: 'ACTIVE' as DeviceConnectionStatus,
    bandwidth: '1 Gbps',
    localInterface: 'eth0',
    remoteInterface: 'GigabitEthernet1/0/20',
    description: 'AP in Office Floor 1 Zone A to Core Switch Alpha',
  }
];

// Assign sequential IDs for DeviceConnections
mockDeviceConnections.forEach((conn, index) => {
    (conn as any).id = `seed_dc_${index.toString().padStart(3, '0')}`;
});

// Basic validation for seed data integrity (can be expanded)
mockDeviceConnections.forEach((conn) => {
    if (!mockDevices.find(d => (d as any).id === conn.localDeviceId)) {
        console.warn(`[Seed Data Warning] DeviceConnection localDeviceId ${conn.localDeviceId} not found in mockDevices.`);
    }
    if (conn.remoteDeviceId && !mockDevices.find(d => (d as any).id === conn.remoteDeviceId)) {
        console.warn(`[Seed Data Warning] DeviceConnection remoteDeviceId ${conn.remoteDeviceId} not found in mockDevices.`);
    }
    if (conn.localIpId && !mockIPAddresses.find(ip => ip.id === conn.localIpId)) {
        console.warn(`[Seed Data Warning] DeviceConnection localIpId ${conn.localIpId} not found in mockIPAddresses.`);
    }
    if (conn.ispId && !mockISPs.find(isp => (isp as any).id === conn.ispId)) {
        console.warn(`[Seed Data Warning] DeviceConnection ispId ${conn.ispId} not found in mockISPs.`);
    }
});
