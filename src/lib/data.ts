
import type { Subnet, VLAN, IPAddress, User, Role, RoleName, Permission, PermissionId, AuditLog } from '@/types';
import { calculateIpRange, calculateNetworkAddress, prefixToSubnetMask, cidrToPrefix } from './ip-utils';
import { PERMISSIONS } from '@/types';


// Fixed Role IDs
export const ADMIN_ROLE_ID = 'role-admin-fixed';
export const OPERATOR_ROLE_ID = 'role-operator-fixed';
export const VIEWER_ROLE_ID = 'role-viewer-fixed';

// Define all system permissions
export const mockPermissions: Permission[] = [
  // Dashboard
  { id: PERMISSIONS.VIEW_DASHBOARD, name: 'View Dashboard', group: 'Dashboard' },
  // Subnets
  { id: PERMISSIONS.VIEW_SUBNET, name: 'View Subnets', group: 'Subnet Management' },
  { id: PERMISSIONS.CREATE_SUBNET, name: 'Create Subnets', group: 'Subnet Management' },
  { id: PERMISSIONS.EDIT_SUBNET, name: 'Edit Subnets', group: 'Subnet Management' },
  { id: PERMISSIONS.DELETE_SUBNET, name: 'Delete Subnets', group: 'Subnet Management' },
  // VLANs
  { id: PERMISSIONS.VIEW_VLAN, name: 'View VLANs', group: 'VLAN Management' },
  { id: PERMISSIONS.CREATE_VLAN, name: 'Create VLANs', group: 'VLAN Management' },
  { id: PERMISSIONS.EDIT_VLAN, name: 'Edit VLANs', group: 'VLAN Management' },
  { id: PERMISSIONS.DELETE_VLAN, name: 'Delete VLANs', group: 'VLAN Management' },
  // IP Addresses
  { id: PERMISSIONS.VIEW_IPADDRESS, name: 'View IP Addresses', group: 'IP Address Management' },
  { id: PERMISSIONS.CREATE_IPADDRESS, name: 'Create IP Addresses', group: 'IP Address Management' },
  { id: PERMISSIONS.EDIT_IPADDRESS, name: 'Edit IP Addresses', group: 'IP Address Management' },
  { id: PERMISSIONS.DELETE_IPADDRESS, name: 'Delete IP Addresses', group: 'IP Address Management' },
  // Users
  { id: PERMISSIONS.VIEW_USER, name: 'View Users', group: 'User Management' },
  { id: PERMISSIONS.CREATE_USER, name: 'Create Users', group: 'User Management' },
  { id: PERMISSIONS.EDIT_USER, name: 'Edit Users & Assign Roles', group: 'User Management' },
  { id: PERMISSIONS.DELETE_USER, name: 'Delete Users', group: 'User Management' },
  // Roles
  { id: PERMISSIONS.VIEW_ROLE, name: 'View Roles', group: 'Role Management' },
  { id: PERMISSIONS.EDIT_ROLE_DESCRIPTION, name: 'Edit Role Descriptions', group: 'Role Management' },
  { id: PERMISSIONS.EDIT_ROLE_PERMISSIONS, name: 'Edit Role Permissions', group: 'Role Management' },
  // Audit Logs
  { id: PERMISSIONS.VIEW_AUDIT_LOG, name: 'View Audit Logs', group: 'System Logs' },
  // Tools
  { id: PERMISSIONS.VIEW_TOOLS_IMPORT_EXPORT, name: 'View Import/Export Tool', group: 'Tools' },
  { id: PERMISSIONS.PERFORM_TOOLS_IMPORT, name: 'Perform Data Import', group: 'Tools' },
  { id: PERMISSIONS.PERFORM_TOOLS_EXPORT, name: 'Perform Data Export', group: 'Tools' },
  // Settings
  { id: PERMISSIONS.VIEW_SETTINGS, name: 'View Settings', group: 'System Settings' },
];

// Helper to generate initial subnet data with calculated fields
function createInitialSubnet(id: string, cidr: string, vlanId?: string, description?: string): Subnet {
  const prefix = cidrToPrefix(cidr);
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
    // utilization is calculated dynamically by getSubnetsAction
  };
}


export const mockSubnets: Subnet[] = [
  createInitialSubnet('subnet-1', '192.168.1.0/24', 'vlan-1', 'Main Office Network'),
  createInitialSubnet('subnet-2', '10.0.0.0/16', 'vlan-2', 'Server Farm'),
  createInitialSubnet('subnet-3', '172.16.0.0/20', undefined, 'Guest WiFi'),
];


export const mockVLANs: VLAN[] = [
  { id: 'vlan-1', vlanNumber: 10, description: 'Office VLAN' },
  { id: 'vlan-2', vlanNumber: 20, description: 'Servers VLAN' },
  { id: 'vlan-3', vlanNumber: 30, description: 'Guest VLAN' },
];

export const mockIPAddresses: IPAddress[] = [
  { id: 'ip-1', ipAddress: '192.168.1.10', subnetId: 'subnet-1', vlanId: undefined, status: 'allocated', allocatedTo: 'John Doe\'s PC', description: 'Marketing Department' },
  { id: 'ip-2', ipAddress: '192.168.1.11', subnetId: 'subnet-1', vlanId: undefined, status: 'free' },
  { id: 'ip-3', ipAddress: '192.168.1.12', subnetId: 'subnet-1', vlanId: undefined, status: 'reserved', description: 'Future Printer' },
  { id: 'ip-4', ipAddress: '10.0.1.5', subnetId: 'subnet-2', vlanId: undefined, status: 'allocated', allocatedTo: 'WebServer01' },
  { id: 'ip-5', ipAddress: '10.0.1.6', subnetId: 'subnet-2', vlanId: 'vlan-2', status: 'allocated', allocatedTo: 'DBServer01' }, // Example of IP-specific VLAN
];

export const mockRoles: Role[] = [
  {
    id: ADMIN_ROLE_ID,
    name: 'Administrator' as RoleName,
    description: 'Full system access. Can manage all resources, users, roles, and system settings.',
    permissions: mockPermissions.map(p => p.id) // All permissions
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
    ]
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
    ]
  },
];

export const mockUsers: User[] = [
  { id: 'user-1', username: 'admin_user', email: 'admin@example.com', roleId: ADMIN_ROLE_ID, avatar: `https://placehold.co/100x100.png?text=A`, lastLogin: new Date(Date.now() - 86400000).toISOString() },
  { id: 'user-2', username: 'operator_jane', email: 'operator@example.com', roleId: OPERATOR_ROLE_ID, avatar: `https://placehold.co/100x100.png?text=O`, lastLogin: new Date(Date.now() - 3600000).toISOString() },
  { id: 'user-3', username: 'viewer_john', email: 'viewer@example.com', roleId: VIEWER_ROLE_ID, avatar: `https://placehold.co/100x100.png?text=V`, lastLogin: new Date().toISOString() },
];


export let mockAuditLogs: AuditLog[] = [
  { id: 'log-1', userId: 'user-1', username: 'admin_user', action: 'create_subnet', timestamp: new Date(Date.now() - 3600000 * 2).toISOString(), details: 'Created subnet 172.16.0.0/20' },
  { id: 'log-2', userId: 'user-2', username: 'operator_jane', action: 'assign_ip', timestamp: new Date(Date.now() - 3600000).toISOString(), details: 'Assigned IP 192.168.1.10 to John Doe\'s PC' },
  { id: 'log-3', userId: 'user-1', username: 'admin_user', action: 'update_vlan', timestamp: new Date().toISOString(), details: 'Updated VLAN 10 description' },
];

// These getter functions are kept for potential direct use if needed,
// but server actions (get<Resource>Action) are preferred for components
// as they can encapsulate more logic like dynamic calculations.
export const getSubnets = async (): Promise<Subnet[]> => {
  return new Promise(resolve => setTimeout(() => resolve(mockSubnets), 100));
};

export const getVLANs = async (): Promise<VLAN[]> => {
  return new Promise(resolve => setTimeout(() => resolve(mockVLANs), 100));
};

export const getIPAddresses = async (subnetId?: string): Promise<IPAddress[]> => {
  return new Promise(resolve => setTimeout(() => {
    if (subnetId) {
      resolve(mockIPAddresses.filter(ip => ip.subnetId === subnetId));
    } else {
      resolve(mockIPAddresses);
    }
  }, 100));
};

export const getUsers = async (): Promise<User[]> => {
  return new Promise(resolve => setTimeout(() => resolve(mockUsers), 100));
};

export const getRoles = async (): Promise<Role[]> => {
  return new Promise(resolve => setTimeout(() => resolve(mockRoles), 100));
};

export const getAuditLogs = async (): Promise<AuditLog[]> => {
  return new Promise(resolve => setTimeout(() => resolve(mockAuditLogs), 100));
};

export const getAllPermissions = async (): Promise<Permission[]> => {
  return new Promise(resolve => setTimeout(() => resolve(mockPermissions), 50));
};

