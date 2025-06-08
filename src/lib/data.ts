
import type { Subnet, VLAN, IPAddress, User, Role, RoleName, Permission, PermissionId, AuditLog } from '../types';
import { calculateIpRange, calculateNetworkAddress, getPrefixFromCidr, prefixToSubnetMask } from './ip-utils';
import { PERMISSIONS } from '../types';


// Fixed Role IDs - Updated format
export const ADMIN_ROLE_ID = 'role_admin_fixed_id';
export const OPERATOR_ROLE_ID = 'role_operator_fixed_id';
export const VIEWER_ROLE_ID = 'role_viewer_fixed_id';

export const mockPermissions: Permission[] = [
  { id: PERMISSIONS.VIEW_DASHBOARD, name: 'View Dashboard', group: 'Dashboard' },
  { id: PERMISSIONS.VIEW_SUBNET, name: 'View Subnets', group: 'Subnet Management' },
  { id: PERMISSIONS.CREATE_SUBNET, name: 'Create Subnets', group: 'Subnet Management' },
  { id: PERMISSIONS.EDIT_SUBNET, name: 'Edit Subnets', group: 'Subnet Management' },
  { id: PERMISSIONS.DELETE_SUBNET, name: 'Delete Subnets', group: 'Subnet Management' },
  { id: PERMISSIONS.VIEW_VLAN, name: 'View VLANs', group: 'VLAN Management' },
  { id: PERMISSIONS.CREATE_VLAN, name: 'Create VLANs', group: 'VLAN Management' },
  { id: PERMISSIONS.EDIT_VLAN, name: 'Edit VLANs', group: 'VLAN Management' },
  { id: PERMISSIONS.DELETE_VLAN, name: 'Delete VLANs', group: 'VLAN Management' },
  { id: PERMISSIONS.VIEW_IPADDRESS, name: 'View IP Addresses', group: 'IP Address Management' },
  { id: PERMISSIONS.CREATE_IPADDRESS, name: 'Create IP Addresses', group: 'IP Address Management' },
  { id: PERMISSIONS.EDIT_IPADDRESS, name: 'Edit IP Addresses', group: 'IP Address Management' },
  { id: PERMISSIONS.DELETE_IPADDRESS, name: 'Delete IP Addresses', group: 'IP Address Management' },
  { id: PERMISSIONS.VIEW_USER, name: 'View Users', group: 'User Management' },
  { id: PERMISSIONS.CREATE_USER, name: 'Create Users', group: 'User Management' },
  { id: PERMISSIONS.EDIT_USER, name: 'Edit Users & Assign Roles', group: 'User Management' },
  { id: PERMISSIONS.DELETE_USER, name: 'Delete Users', group: 'User Management' },
  { id: PERMISSIONS.VIEW_ROLE, name: 'View Roles', group: 'Role Management' },
  { id: PERMISSIONS.EDIT_ROLE_DESCRIPTION, name: 'Edit Role Descriptions', group: 'Role Management' },
  { id: PERMISSIONS.EDIT_ROLE_PERMISSIONS, name: 'Edit Role Permissions', group: 'Role Management' },
  { id: PERMISSIONS.VIEW_AUDIT_LOG, name: 'View Audit Logs', group: 'System Logs' },
  { id: PERMISSIONS.DELETE_AUDIT_LOG, name: 'Delete Audit Logs', group: 'System Logs' },
  { id: PERMISSIONS.VIEW_TOOLS_IMPORT_EXPORT, name: 'View Import/Export Tool', group: 'Tools' },
  { id: PERMISSIONS.PERFORM_TOOLS_IMPORT, name: 'Perform Data Import', group: 'Tools' },
  { id: PERMISSIONS.PERFORM_TOOLS_EXPORT, name: 'Perform Data Export', group: 'Tools' },
  { id: PERMISSIONS.VIEW_SETTINGS, name: 'View Settings', group: 'System Settings' },
  { id: PERMISSIONS.VIEW_QUERY_PAGE, name: 'View Query Page', group: 'Query Tool', description: 'Access the comprehensive query tool.' },
];

function createInitialSubnetSeedData(id: string, cidr: string, vlanId?: string, description?: string): Omit<Subnet, 'utilization'> {
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
    vlanId,
    description,
  };
}

export const mockSubnets: Omit<Subnet, 'utilization'>[] = [
  createInitialSubnetSeedData('seed_subnet_001', '192.168.1.0/24', 'seed_vlan_001', 'Main Office Network'),
  createInitialSubnetSeedData('seed_subnet_002', '10.0.0.0/16', 'seed_vlan_002', 'Server Farm'),
  createInitialSubnetSeedData('seed_subnet_003', '172.16.0.0/20', undefined, 'Guest WiFi'),
];

export const mockVLANs: Omit<VLAN, 'subnetCount'>[] = [
  { id: 'seed_vlan_001', vlanNumber: 10, name: 'Office VLAN', description: 'Main office users and devices' },
  { id: 'seed_vlan_002', vlanNumber: 20, name: 'Servers', description: 'Production and staging servers' },
  { id: 'seed_vlan_003', vlanNumber: 30, name: 'Guest WiFi', description: 'Internet access for guests (untrusted)' },
  { id: 'seed_vlan_004', vlanNumber: 40, name: 'Legacy Devices', description: 'Legacy Devices VLAN' },
];

export const mockIPAddresses: IPAddress[] = [
  { id: 'seed_ip_001', ipAddress: '192.168.1.10', subnetId: 'seed_subnet_001', status: 'allocated', allocatedTo: 'John Doe\'s PC', description: 'Marketing Department' },
  { id: 'seed_ip_002', ipAddress: '192.168.1.11', subnetId: 'seed_subnet_001', status: 'free' },
  { id: 'seed_ip_003', ipAddress: '192.168.1.12', subnetId: 'seed_subnet_001', status: 'reserved', description: 'Future Printer' },
  { id: 'seed_ip_004', ipAddress: '10.0.1.5', subnetId: 'seed_subnet_002', status: 'allocated', allocatedTo: 'WebServer01' },
  { id: 'seed_ip_005', ipAddress: '10.0.1.6', subnetId: 'seed_subnet_002', vlanId: 'seed_vlan_002', status: 'allocated', allocatedTo: 'DBServer01' },
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

export const mockUsers: Array<User & { password?: string }> = [
  { id: 'seed_user_admin', username: 'admin', email: 'admin@example.com', roleId: ADMIN_ROLE_ID, password: 'admin', avatar: '/images/avatars/admin_avatar.png', lastLogin: new Date(Date.now() - 86400000).toISOString() },
  { id: 'seed_user_operator', username: 'operator', email: 'operator@example.com', roleId: OPERATOR_ROLE_ID, password: 'operator', avatar: '/images/avatars/operator_avatar.png', lastLogin: new Date(Date.now() - 3600000).toISOString() },
  { id: 'seed_user_viewer', username: 'viewer', email: 'viewer@example.com', roleId: VIEWER_ROLE_ID, password: 'viewer', avatar: '/images/avatars/viewer_avatar.png', lastLogin: new Date().toISOString() },
];


export let mockAuditLogs: AuditLog[] = [
  { id: 'seed_log_001', userId: 'seed_user_admin', username: 'admin', action: 'create_subnet_seed', timestamp: new Date(Date.now() - 3600000 * 2).toISOString(), details: 'Seeded subnet 172.16.0.0/20' },
  { id: 'seed_log_002', userId: 'seed_user_operator', username: 'operator', action: 'assign_ip_seed', timestamp: new Date(Date.now() - 3600000).toISOString(), details: 'Seeded IP 192.168.1.10 to John Doe\'s PC' },
  { id: 'seed_log_003', userId: 'seed_user_admin', username: 'admin', action: 'update_vlan_seed', timestamp: new Date().toISOString(), details: 'Seeded VLAN 10 description update' },
];

    