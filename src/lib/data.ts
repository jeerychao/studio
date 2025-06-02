
import type { Subnet, VLAN, IPAddress, User, Role, RoleName, Permission, PermissionId, AuditLog } from '../types';
import { calculateIpRange, calculateNetworkAddress, prefixToSubnetMask, cidrToPrefix } from './ip-utils';
import { PERMISSIONS } from '../types';


// Fixed Role IDs - these MUST match the IDs used in prisma/seed.ts and potentially in UI logic
export const ADMIN_ROLE_ID = 'role-admin-fixed';
export const OPERATOR_ROLE_ID = 'role-operator-fixed';
export const VIEWER_ROLE_ID = 'role-viewer-fixed';

// Define all system permissions - This list is the source of truth for permission definitions.
// The `prisma/seed.ts` script will use this to populate the Permission table.
// The `id` here uses '.' as a separator, while Prisma schema uses '_' for enums.
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

// Helper to generate initial subnet data with calculated fields for seeding
function createInitialSubnetSeedData(id: string, cidr: string, vlanId?: string, description?: string): Omit<Subnet, 'utilization'> {
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
  };
}

// This data is now PRIMARILY FOR SEEDING the database.
// The `useCurrentUser` hook will still reference these for its mock user switching logic for simplicity.
export const mockSubnets: Omit<Subnet, 'utilization'>[] = [
  createInitialSubnetSeedData('subnet-1-seed', '192.168.1.0/24', 'vlan-1-seed', 'Main Office Network'),
  createInitialSubnetSeedData('subnet-2-seed', '10.0.0.0/16', 'vlan-2-seed', 'Server Farm'),
  createInitialSubnetSeedData('subnet-3-seed', '172.16.0.0/20', undefined, 'Guest WiFi'),
];

export const mockVLANs: Omit<VLAN, 'subnetCount'>[] = [
  { id: 'vlan-1-seed', vlanNumber: 10, description: 'Office VLAN' },
  { id: 'vlan-2-seed', vlanNumber: 20, description: 'Servers VLAN' },
  { id: 'vlan-3-seed', vlanNumber: 30, description: 'Guest VLAN' },
];

export const mockIPAddresses: IPAddress[] = [
  { id: 'ip-1-seed', ipAddress: '192.168.1.10', subnetId: 'subnet-1-seed', status: 'allocated', allocatedTo: 'John Doe\'s PC', description: 'Marketing Department' },
  { id: 'ip-2-seed', ipAddress: '192.168.1.11', subnetId: 'subnet-1-seed', status: 'free' },
  { id: 'ip-3-seed', ipAddress: '192.168.1.12', subnetId: 'subnet-1-seed', status: 'reserved', description: 'Future Printer' },
  { id: 'ip-4-seed', ipAddress: '10.0.1.5', subnetId: 'subnet-2-seed', status: 'allocated', allocatedTo: 'WebServer01' },
  { id: 'ip-5-seed', ipAddress: '10.0.1.6', subnetId: 'subnet-2-seed', vlanId: 'vlan-2-seed', status: 'allocated', allocatedTo: 'DBServer01' },
];

export const mockRoles: Role[] = [ // The `permissions` array here should use the string IDs from `types/index.ts`
  {
    id: ADMIN_ROLE_ID, // 'role-admin-fixed'
    name: 'Administrator' as RoleName,
    description: 'Full system access. Can manage all resources, users, roles, and system settings.',
    permissions: mockPermissions.map(p => p.id as PermissionId) // All permissions
  },
  {
    id: OPERATOR_ROLE_ID, // 'role-operator-fixed'
    name: 'Operator' as RoleName,
    description: 'Manages IP resources. Cannot manage users, roles, or most system settings.',
    permissions: [
      PERMISSIONS.VIEW_DASHBOARD,
      PERMISSIONS.VIEW_SUBNET, PERMISSIONS.CREATE_SUBNET, PERMISSIONS.EDIT_SUBNET, PERMISSIONS.DELETE_SUBNET,
      PERMISSIONS.VIEW_VLAN, PERMISSIONS.CREATE_VLAN, PERMISSIONS.EDIT_VLAN, PERMISSIONS.DELETE_VLAN,
      PERMISSIONS.VIEW_IPADDRESS, PERMISSIONS.CREATE_IPADDRESS, PERMISSIONS.EDIT_IPADDRESS, PERMISSIONS.DELETE_IPADDRESS,
    ] as PermissionId[]
  },
  {
    id: VIEWER_ROLE_ID, // 'role-viewer-fixed'
    name: 'Viewer' as RoleName,
    description: 'Read-only access to IP resources and dashboard.',
    permissions: [
      PERMISSIONS.VIEW_DASHBOARD,
      PERMISSIONS.VIEW_SUBNET,
      PERMISSIONS.VIEW_VLAN,
      PERMISSIONS.VIEW_IPADDRESS,
    ] as PermissionId[]
  },
];

export const mockUsers: User[] = [ // These are used by useCurrentUser and for seeding
  { id: 'user-admin-seed', username: 'admin_user', email: 'admin@example.com', roleId: ADMIN_ROLE_ID, avatar: `https://placehold.co/100x100.png?text=A`, lastLogin: new Date(Date.now() - 86400000).toISOString() },
  { id: 'user-operator-seed', username: 'operator_jane', email: 'operator@example.com', roleId: OPERATOR_ROLE_ID, avatar: `https://placehold.co/100x100.png?text=O`, lastLogin: new Date(Date.now() - 3600000).toISOString() },
  { id: 'user-viewer-seed', username: 'viewer_john', email: 'viewer@example.com', roleId: VIEWER_ROLE_ID, avatar: `https://placehold.co/100x100.png?text=V`, lastLogin: new Date().toISOString() },
];


export let mockAuditLogs: AuditLog[] = [ // For seeding
  { id: 'log-1-seed', userId: 'user-admin-seed', username: 'admin_user', action: 'create_subnet_seed', timestamp: new Date(Date.now() - 3600000 * 2).toISOString(), details: 'Seeded subnet 172.16.0.0/20' },
  { id: 'log-2-seed', userId: 'user-operator-seed', username: 'operator_jane', action: 'assign_ip_seed', timestamp: new Date(Date.now() - 3600000).toISOString(), details: 'Seeded IP 192.168.1.10 to John Doe\'s PC' },
  { id: 'log-3-seed', userId: 'user-admin-seed', username: 'admin_user', action: 'update_vlan_seed', timestamp: new Date().toISOString(), details: 'Seeded VLAN 10 description update' },
];

// The old getter functions are no longer relevant as actions.ts will use Prisma.
// They can be removed if not used by any other part of the app (e.g. tests not converted yet).
// For now, I'll leave them commented out or remove them.
// export const getSubnets = async (): Promise<Subnet[]> => { ... };
// ... and so on for other getters.

