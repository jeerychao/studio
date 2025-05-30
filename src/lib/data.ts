
import type { Subnet, VLAN, IPAddress, User, Role, RoleName } from '@/types';
import { calculateIpRange, calculateNetworkAddress, prefixToSubnetMask, cidrToPrefix } from './ip-utils';

// Fixed Role IDs
export const ADMIN_ROLE_ID = 'role-admin-fixed';
export const OPERATOR_ROLE_ID = 'role-operator-fixed';
export const VIEWER_ROLE_ID = 'role-viewer-fixed';


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
    // Utilization will be calculated dynamically by getSubnetsAction
  };
}


export const mockSubnets: Subnet[] = [
  createInitialSubnet('subnet-1', '192.168.1.0/24', 'vlan-1', 'Main Office Network'),
  createInitialSubnet('subnet-2', '10.0.0.0/16', 'vlan-2', 'Server Farm'),
  createInitialSubnet('subnet-3', '172.16.0.0/20', undefined, 'Guest WiFi'),
];


export const mockVLANs: VLAN[] = [
  { id: 'vlan-1', vlanNumber: 10, description: 'Office VLAN', subnetCount: 0 }, // subnetCount calculated dynamically
  { id: 'vlan-2', vlanNumber: 20, description: 'Servers VLAN', subnetCount: 0 },
  { id: 'vlan-3', vlanNumber: 30, description: 'Guest VLAN', subnetCount: 0 },
];

export const mockIPAddresses: IPAddress[] = [
  { id: 'ip-1', ipAddress: '192.168.1.10', subnetId: 'subnet-1', status: 'allocated', allocatedTo: 'John Doe\'s PC', description: 'Marketing Department' },
  { id: 'ip-2', ipAddress: '192.168.1.11', subnetId: 'subnet-1', status: 'free' },
  { id: 'ip-3', ipAddress: '192.168.1.12', subnetId: 'subnet-1', status: 'reserved', description: 'Future Printer' },
  { id: 'ip-4', ipAddress: '10.0.1.5', subnetId: 'subnet-2', status: 'allocated', allocatedTo: 'WebServer01' },
  { id: 'ip-5', ipAddress: '10.0.1.6', subnetId: 'subnet-2', status: 'allocated', allocatedTo: 'DBServer01' },
];

export const mockRoles: Role[] = [
  { id: ADMIN_ROLE_ID, name: 'Administrator' as RoleName, description: 'Full system access', userCount: 0 },
  { id: OPERATOR_ROLE_ID, name: 'Operator' as RoleName, description: 'Manages IP resources, cannot manage users or system settings.', userCount: 0 },
  { id: VIEWER_ROLE_ID, name: 'Viewer' as RoleName, description: 'Read-only access to IP resources.', userCount: 0 },
];

export const mockUsers: User[] = [
  { id: 'user-1', username: 'admin', email: 'admin@example.com', roleId: ADMIN_ROLE_ID, avatar: `https://placehold.co/100x100.png?text=A`, lastLogin: new Date(Date.now() - 86400000).toISOString() },
  { id: 'user-2', username: 'operator_jane', email: 'operator@example.com', roleId: OPERATOR_ROLE_ID, avatar: `https://placehold.co/100x100.png?text=O`, lastLogin: new Date(Date.now() - 3600000).toISOString() },
  { id: 'user-3', username: 'viewer_john', email: 'viewer@example.com', roleId: VIEWER_ROLE_ID, avatar: `https://placehold.co/100x100.png?text=V`, lastLogin: new Date().toISOString() },
];


export let mockAuditLogs: AuditLog[] = [ // Made it 'let' to allow unshift
  { id: 'log-1', userId: 'user-1', username: 'admin', action: 'create_subnet', timestamp: new Date(Date.now() - 3600000 * 2).toISOString(), details: 'Created subnet 172.16.0.0/20' },
  { id: 'log-2', userId: 'user-2', username: 'operator_jane', action: 'assign_ip', timestamp: new Date(Date.now() - 3600000).toISOString(), details: 'Assigned IP 192.168.1.10 to John Doe\'s PC' },
  { id: 'log-3', userId: 'user-1', username: 'admin', action: 'update_vlan', timestamp: new Date().toISOString(), details: 'Updated VLAN 10 description' },
];

// The following export functions that return Promises are kept for potential future use
// if data fetching becomes asynchronous (e.g., from a database).
// For the current direct mock data usage in actions, they might not be directly called by pages.
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
