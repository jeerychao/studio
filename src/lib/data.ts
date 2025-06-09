
import type { Subnet, VLAN, IPAddress, User, Role, RoleName, Permission, PermissionId, AuditLog, IPAddressStatus } from '../types';
import { calculateIpRange, calculateNetworkAddress, getPrefixFromCidr, prefixToSubnetMask } from './ip-utils';
import { PERMISSIONS } from '../types';

// Fixed Role IDs
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
  // Example for a future backup permission
  // { id: PERMISSIONS.PERFORM_DATABASE_BACKUP, name: 'Perform Database Backup', group: 'System Settings', description: 'Can initiate a database backup.' },
];

function createInitialSubnetSeedData(
  id: string,
  cidr: string,
  name?: string, // New
  dhcpEnabled?: boolean, // New
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
    name: name || cidr, // Default name to CIDR if not provided
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
    permissions: mockPermissions.map(p => p.id as PermissionId) // All permissions
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
      PERMISSIONS.VIEW_TOOLS_IMPORT_EXPORT, PERMISSIONS.PERFORM_TOOLS_EXPORT, // Allow export for operator
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
    ] as PermissionId[]
  },
];

// User mock data remains the same as it uses roleId which then defines permissions
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
