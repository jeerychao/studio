
import type { Subnet, VLAN, IPAddress, User, Role, RoleName, Permission, PermissionId, AuditLog, IPAddressStatus, OperatorDictionary, LocalDeviceDictionary, PaymentSourceDictionary, AccessTypeDictionary, NetworkInterfaceTypeDictionary } from '../types/index';
import { PERMISSIONS, DeviceType } from '../types/index';
import { calculateIpRange, calculateNetworkAddress, getPrefixFromCidr, prefixToSubnetMask } from './ip-utils';
// Import the centralized encrypt function
import { encrypt } from '../app/api/auth/[...nextauth]/route';


export const ADMIN_ROLE_ID = 'role_admin_fixed_id';
export const OPERATOR_ROLE_ID = 'role_operator_fixed_id';
export const VIEWER_ROLE_ID = 'role_viewer_fixed_id';

export const mockPermissions: Permission[] = [
  { id: PERMISSIONS.VIEW_DASHBOARD, name: '查看仪表盘', group: '仪表盘', description: '可以查看主仪表盘概览。' },
  { id: PERMISSIONS.VIEW_SUBNET, name: '查看子网', group: '子网管理', description: '可以查看子网详情和列表。' },
  { id: PERMISSIONS.CREATE_SUBNET, name: '创建子网', group: '子网管理', description: '可以添加新的子网。' },
  { id: PERMISSIONS.EDIT_SUBNET, name: '编辑子网', group: '子网管理', description: '可以修改现有子网（CIDR、VLAN、描述）。' },
  { id: PERMISSIONS.DELETE_SUBNET, name: '删除子网', group: '子网管理', description: '可以移除子网（如果为空或满足条件）。' },
  { id: PERMISSIONS.VIEW_VLAN, name: '查看VLAN', group: 'VLAN管理', description: '可以查看VLAN详情和列表。' },
  { id: PERMISSIONS.CREATE_VLAN, name: '创建VLAN', group: 'VLAN管理', description: '可以添加新的VLAN。' },
  { id: PERMISSIONS.EDIT_VLAN, name: '编辑VLAN', group: 'VLAN管理', description: '可以修改现有VLAN（编号、名称、描述）。' },
  { id: PERMISSIONS.DELETE_VLAN, name: '删除VLAN', group: 'VLAN管理', description: '可以移除VLAN（如果未使用）。' },
  { id: PERMISSIONS.VIEW_IPADDRESS, name: '查看IP地址', group: 'IP地址管理', description: '可以查看IP地址详情和列表。' },
  { id: PERMISSIONS.CREATE_IPADDRESS, name: '创建IP地址', group: 'IP地址管理', description: '可以添加新的IP地址。' },
  { id: PERMISSIONS.EDIT_IPADDRESS, name: '编辑IP地址', group: 'IP地址管理', description: '可以修改现有IP地址（状态、分配等）。' },
  { id: PERMISSIONS.DELETE_IPADDRESS, name: '删除IP地址', group: 'IP地址管理', description: '可以移除IP地址（如果未分配/预留或满足条件）。' },
  { id: PERMISSIONS.VIEW_USER, name: '查看用户', group: '用户管理', description: '可以查看用户账户及其角色。' },
  { id: PERMISSIONS.CREATE_USER, name: '创建用户', group: '用户管理', description: '可以创建新的用户账户。' },
  { id: PERMISSIONS.EDIT_USER, name: '编辑用户和分配角色', group: '用户管理', description: '可以修改用户详情和更改其角色。' },
  { id: PERMISSIONS.DELETE_USER, name: '删除用户', group: '用户管理', description: '可以删除用户账户。' },
  { id: PERMISSIONS.VIEW_ROLE, name: '查看角色', group: '角色管理', description: '可以查看角色详情及其权限。' },
  { id: PERMISSIONS.EDIT_ROLE_DESCRIPTION, name: '编辑角色描述', group: '角色管理', description: '可以更改现有角色的描述。' },
  { id: PERMISSIONS.EDIT_ROLE_PERMISSIONS, name: '编辑角色权限', group: '角色管理', description: '可以修改分配给角色的权限（管理员角色除外）。' },
  { id: PERMISSIONS.VIEW_AUDIT_LOG, name: '查看审计日志', group: '系统日志', description: '可以查看系统活动和审计追踪。' },
  { id: PERMISSIONS.DELETE_AUDIT_LOG, name: '删除审计日志', group: '系统日志', description: '可以删除审计日志条目。' },
  { id: PERMISSIONS.VIEW_TOOLS_IMPORT_EXPORT, name: '查看导入/导出工具', group: '工具', description: '可以访问数据导入/导出页面。' },
  { id: PERMISSIONS.PERFORM_TOOLS_EXPORT, name: '执行数据导出', group: '工具', description: '可以将数据导出到文件（例如CSV）。' },
  { id: PERMISSIONS.VIEW_QUERY_PAGE, name: '查看信息查询页面', group: '查询工具', description: '访问综合查询工具。' },
  { id: PERMISSIONS.VIEW_SETTINGS, name: '查看设置', group: '系统设置', description: '可以查看应用范围的设置（如果存在全局设置页面）。' },
  { id: PERMISSIONS.VIEW_DICTIONARY_OPERATOR, name: '查看运营商字典', group: '字典管理', description: '可以查看运营商字典条目。' },
  { id: PERMISSIONS.CREATE_DICTIONARY_OPERATOR, name: '创建运营商字典条目', group: '字典管理', description: '可以添加新的运营商字典条目。' },
  { id: PERMISSIONS.EDIT_DICTIONARY_OPERATOR, name: '编辑运营商字典条目', group: '字典管理', description: '可以修改现有的运营商字典条目。' },
  { id: PERMISSIONS.DELETE_DICTIONARY_OPERATOR, name: '删除运营商字典条目', group: '字典管理', description: '可以删除运营商字典条目。' },
  { id: PERMISSIONS.VIEW_DICTIONARY_LOCAL_DEVICE, name: '查看本地设备字典', group: '字典管理', description: '可以查看本地设备字典条目。' },
  { id: PERMISSIONS.CREATE_DICTIONARY_LOCAL_DEVICE, name: '创建本地设备字典条目', group: '字典管理', description: '可以添加新的本地设备字典条目。' },
  { id: PERMISSIONS.EDIT_DICTIONARY_LOCAL_DEVICE, name: '编辑本地设备字典条目', group: '字典管理', description: '可以修改现有的本地设备字典条目。' },
  { id: PERMISSIONS.DELETE_DICTIONARY_LOCAL_DEVICE, name: '删除本地设备字典条目', group: '字典管理', description: '可以删除本地设备字典条目。' },
  { id: PERMISSIONS.VIEW_DICTIONARY_PAYMENT_SOURCE, name: '查看付费来源字典', group: '字典管理', description: '可以查看付费来源字典条目。' },
  { id: PERMISSIONS.CREATE_DICTIONARY_PAYMENT_SOURCE, name: '创建付费来源字典条目', group: '字典管理', description: '可以添加新的付费来源字典条目。' },
  { id: PERMISSIONS.EDIT_DICTIONARY_PAYMENT_SOURCE, name: '编辑付费来源字典条目', group: '字典管理', description: '可以修改现有的付费来源字典条目。' },
  { id: PERMISSIONS.DELETE_DICTIONARY_PAYMENT_SOURCE, name: '删除付费来源字典条目', group: '字典管理', description: '可以删除付费来源字典条目。' },
  { id: PERMISSIONS.VIEW_DICTIONARY_ACCESS_TYPE, name: '查看接入方式字典', group: '字典管理', description: '可以查看接入方式字典条目。' },
  { id: PERMISSIONS.CREATE_DICTIONARY_ACCESS_TYPE, name: '创建接入方式字典条目', group: '字典管理', description: '可以添加新的接入方式字典条目。' },
  { id: PERMISSIONS.EDIT_DICTIONARY_ACCESS_TYPE, name: '编辑接入方式字典条目', group: '字典管理', description: '可以修改现有的接入方式字典条目。' },
  { id: PERMISSIONS.DELETE_DICTIONARY_ACCESS_TYPE, name: '删除接入方式字典条目', group: '字典管理', description: '可以删除接入方式字典条目。' },
  { id: PERMISSIONS.VIEW_DICTIONARY_NETWORK_INTERFACE_TYPE, name: '查看网络接口类型字典', group: '字典管理', description: '可以查看网络接口类型字典条目。' },
  { id: PERMISSIONS.CREATE_DICTIONARY_NETWORK_INTERFACE_TYPE, name: '创建网络接口类型字典条目', group: '字典管理', description: '可以添加新的网络接口类型字典条目。' },
  { id: PERMISSIONS.EDIT_DICTIONARY_NETWORK_INTERFACE_TYPE, name: '编辑网络接口类型字典条目', group: '字典管理', description: '可以修改现有的网络接口类型字典条目。' },
  { id: PERMISSIONS.DELETE_DICTIONARY_NETWORK_INTERFACE_TYPE, name: '删除网络接口类型字典条目', group: '字典管理', description: '可以删除网络接口类型字典条目。' },
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
    isGateway: true, allocatedTo: 'Office Router', usageUnit: 'IT Department', contactPerson: 'Admin', phone: '123-001', description: 'Default Gateway for Office Network',
    selectedOperatorName: '中国电信', selectedOperatorDevice: 'OLT-ZX-C300', selectedAccessType: '专线',
    selectedLocalDeviceName: '核心交换机-A栋', selectedDevicePort: 'Ten-GigabitEthernet1/0/1', selectedPaymentSource: '自费'
 },
  {
    id: 'seed_ip_002', ipAddress: '192.168.1.10', subnetId: 'seed_subnet_001', status: 'allocated' as IPAddressStatus,
    isGateway: false, allocatedTo: 'John Doe\'s PC', usageUnit: 'Marketing Department', contactPerson: 'John Doe', phone: '123-101', description: 'John - Primary Workstation',
    selectedOperatorName: '中国联通', selectedOperatorDevice: 'Router-HW-NE40', selectedAccessType: '汇聚',
    selectedLocalDeviceName: '接入交换机-B栋-F3', selectedDevicePort: 'GigabitEthernet0/24', selectedPaymentSource: '财政付费-项目A'
 },
  {
    id: 'seed_ip_003', ipAddress: '192.168.1.11', subnetId: 'seed_subnet_001', status: 'free' as IPAddressStatus,
    isGateway: false, selectedAccessType: '其他'
 },
  {
    id: 'seed_ip_004', ipAddress: '192.168.1.12', subnetId: 'seed_subnet_001', status: 'reserved' as IPAddressStatus,
    isGateway: false, description: 'Future Printer IP', usageUnit: 'Admin Office',
    selectedPaymentSource: '财政付费-项目B', selectedAccessType: '专线'
 },
  {
    id: 'seed_ip_005', ipAddress: '10.0.0.1', subnetId: 'seed_subnet_002', status: 'allocated' as IPAddressStatus,
    isGateway: true, allocatedTo: 'Server Farm Router', description: 'Gateway for Servers',
    selectedOperatorName: '中国移动', selectedOperatorDevice: 'Switch-H3C-S5500', selectedAccessType: '专线',
    selectedLocalDeviceName: '防火墙-总部出口', selectedDevicePort: 'eth1/1', selectedPaymentSource: '自费'
  },
 {
    id: 'seed_ip_006', ipAddress: '10.0.1.5', subnetId: 'seed_subnet_002', directVlanId: 'seed_vlan_002', status: 'allocated' as IPAddressStatus,
    isGateway: false, allocatedTo: 'WebServer01', usageUnit: 'Web Services Team', contactPerson: 'Jane Smith', phone: '123-201', description: 'Main Web Server',
    selectedOperatorName: '教育网', selectedOperatorDevice: 'Router-Ruijie-RSR77', selectedAccessType: '专线',
    selectedLocalDeviceName: '核心交换机-A栋', selectedDevicePort: 'Ten-GigabitEthernet1/0/2', selectedPaymentSource: '自费'
 },
  {
    id: 'seed_ip_007', ipAddress: '10.0.1.6', subnetId: 'seed_subnet_002', directVlanId: 'seed_vlan_002', status: 'allocated' as IPAddressStatus,
    isGateway: false, allocatedTo: 'DBServer01', usageUnit: 'Database Team', contactPerson: 'Robert Brown', phone: '123-202', description: 'Primary Database Server',
    selectedOperatorName: '广电网络', selectedOperatorDevice: 'CableModem-ARRIS-CM8200', selectedAccessType: '汇聚',
    selectedLocalDeviceName: '核心交换机-A栋', selectedDevicePort: 'Ten-GigabitEthernet1/0/3', selectedPaymentSource: '财政付费-项目A'
 },
];

export const mockRoles: Role[] = [
  {
    id: ADMIN_ROLE_ID,
    name: 'Administrator' as RoleName,
    description: 'Full system access. Can manage all resources, users, roles, and system settings.',
    permissions: Object.values(PERMISSIONS) as PermissionId[]
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
      PERMISSIONS.VIEW_DICTIONARY_OPERATOR, PERMISSIONS.CREATE_DICTIONARY_OPERATOR, PERMISSIONS.EDIT_DICTIONARY_OPERATOR, PERMISSIONS.DELETE_DICTIONARY_OPERATOR,
      PERMISSIONS.VIEW_DICTIONARY_LOCAL_DEVICE, PERMISSIONS.CREATE_DICTIONARY_LOCAL_DEVICE, PERMISSIONS.EDIT_DICTIONARY_LOCAL_DEVICE, PERMISSIONS.DELETE_DICTIONARY_LOCAL_DEVICE,
      PERMISSIONS.VIEW_DICTIONARY_PAYMENT_SOURCE, PERMISSIONS.CREATE_DICTIONARY_PAYMENT_SOURCE, PERMISSIONS.EDIT_DICTIONARY_PAYMENT_SOURCE, PERMISSIONS.DELETE_DICTIONARY_PAYMENT_SOURCE,
      PERMISSIONS.VIEW_DICTIONARY_ACCESS_TYPE, PERMISSIONS.CREATE_DICTIONARY_ACCESS_TYPE, PERMISSIONS.EDIT_DICTIONARY_ACCESS_TYPE, PERMISSIONS.DELETE_DICTIONARY_ACCESS_TYPE,
      PERMISSIONS.VIEW_DICTIONARY_NETWORK_INTERFACE_TYPE, PERMISSIONS.CREATE_DICTIONARY_NETWORK_INTERFACE_TYPE, PERMISSIONS.EDIT_DICTIONARY_NETWORK_INTERFACE_TYPE, PERMISSIONS.DELETE_DICTIONARY_NETWORK_INTERFACE_TYPE,
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
      PERMISSIONS.VIEW_DICTIONARY_OPERATOR,
      PERMISSIONS.VIEW_DICTIONARY_LOCAL_DEVICE,
      PERMISSIONS.VIEW_DICTIONARY_PAYMENT_SOURCE,
      PERMISSIONS.VIEW_DICTIONARY_ACCESS_TYPE,
      PERMISSIONS.VIEW_DICTIONARY_NETWORK_INTERFACE_TYPE,
    ] as PermissionId[]
  },
];

export const mockUsers: Array<Omit<User, 'roleName' | 'permissions'> & { password?: string, phone?: string }> = [
  { id: 'seed_user_admin', username: 'admin', email: 'admin@example.com', roleId: ADMIN_ROLE_ID,
    password: encrypt('admin'),
    phone: '11111111111',
    avatar: '/images/avatars/admin_avatar.png', lastLogin: new Date(Date.now() - 86400000).toISOString() },
  { id: 'seed_user_operator', username: 'operator', email: 'operator@example.com', roleId: OPERATOR_ROLE_ID,
    password: encrypt('operator'),
    phone: '22222222222',
    avatar: '/images/avatars/operator_avatar.png', lastLogin: new Date(Date.now() - 3600000).toISOString() },
  { id: 'seed_user_viewer', username: 'viewer', email: 'viewer@example.com', roleId: VIEWER_ROLE_ID,
    password: encrypt('viewer'),
    phone: '33333333333',
    avatar: '/images/avatars/viewer_avatar.png', lastLogin: new Date().toISOString() },
];

export let mockAuditLogs: AuditLog[] = [
  { id: 'seed_log_001', userId: 'seed_user_admin', username: 'admin', action: 'create_subnet_seed', timestamp: new Date(Date.now() - 3600000 * 2).toISOString(), details: 'Seeded subnet 172.16.0.0/20 (Guest WiFi Zone)' },
  { id: 'seed_log_002', userId: 'seed_user_operator', username: 'operator', action: 'assign_ip_seed', timestamp: new Date(Date.now() - 3600000).toISOString(), details: 'Seeded IP 192.168.1.10 to John Doe\'s PC' },
  { id: 'seed_log_003', userId: 'seed_user_admin', username: 'admin', action: 'update_vlan_seed', timestamp: new Date().toISOString(), details: 'Seeded VLAN 10 (Office VLAN) description update' },
  { id: 'seed_log_004', userId: 'seed_user_admin', username: 'admin', action: 'user_login_seed', timestamp: new Date(Date.now() - 86400000).toISOString(), details: 'User admin successfully logged in.' },
];

export const mockOperatorDictionaries: Omit<OperatorDictionary, 'id' | 'createdAt' | 'updatedAt'>[] = [
  { operatorName: '中国电信', operatorDevice: 'OLT-ZX-C300' },
  { operatorName: '中国联通', operatorDevice: 'Router-HW-NE40' },
  { operatorName: '中国移动', operatorDevice: 'Switch-H3C-S5500' },
  { operatorName: '广电网络', operatorDevice: 'CableModem-ARRIS-CM8200' },
  { operatorName: '教育网', operatorDevice: 'Router-Ruijie-RSR77' },
];

export const mockLocalDeviceDictionaries: Omit<LocalDeviceDictionary, 'id' | 'createdAt' | 'updatedAt'>[] = [
  { deviceName: '核心交换机-A栋', port: 'Ten-GigabitEthernet1/0/1' },
  { deviceName: '接入交换机-B栋-F3', port: 'GigabitEthernet0/24' },
  { deviceName: '防火墙-总部出口', port: 'eth1/1' },
  { deviceName: '服务器-WEB集群-节点1', port: 'eth0' },
  { deviceName: '无线控制器-主楼', port: 'Port-channel1' },
];

export const mockPaymentSourceDictionaries: Omit<PaymentSourceDictionary, 'id' | 'createdAt' | 'updatedAt'>[] = [
  { sourceName: '自费' },
  { sourceName: '财政付费-项目A' },
  { sourceName: '财政付费-项目B' },
  { sourceName: '部门预算-市场部' },
  { sourceName: '集团统筹' },
];

export const mockAccessTypeDictionaries: Omit<AccessTypeDictionary, 'id' | 'createdAt' | 'updatedAt'>[] = [
  { name: '汇聚' },
  { name: '专线' },
  { name: '拨号' },
  { name: '无线' },
  { name: '其他' },
];

export const mockNetworkInterfaceTypeDictionaries: Omit<NetworkInterfaceTypeDictionary, 'id' | 'createdAt' | 'updatedAt'>[] = [
  { name: 'GigabitEthernet', description: '千兆以太网接口' },
  { name: 'TenGigabitEthernet', description: '万兆以太网接口' },
  { name: 'FastEthernet', description: '百兆以太网接口' },
  { name: 'Ethernet', description: '十兆以太网接口' },
  { name: 'ge-', description: 'Juniper风格千兆接口前缀' },
  { name: 'fe-', description: 'Juniper风格百兆接口前缀' },
  { name: 'Te', description: '简写万兆 (例如 Te1/0/1)' },
  { name: 'Gi', description: '简写千兆 (例如 Gi0/1)' },
  { name: 'Fa', description: '简写百兆 (例如 Fa0/0)' },
  { name: 'Eth', description: '简写十兆 (例如 Eth0)' },
  { name: 'XGigabitEthernet', description: '另一种万兆以太网接口表示' },
  { name: 'xe-', description: 'Juniper风格万兆接口前缀' },
  { name: 'Port-channel', description: '端口聚合组' },
  { name: 'Loopback', description: '逻辑环回接口' },
  { name: 'Vlan-interface', description: 'VLAN逻辑接口/SVI' },
];
