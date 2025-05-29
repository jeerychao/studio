
import type { Subnet, VLAN, IPAddress, User, Role, AuditLog } from '@/types';
import { calculateIpRange, calculateNetworkAddress, prefixToSubnetMask, cidrToPrefix } from './ip-utils';

// Helper to generate initial subnet data with calculated fields
function createInitialSubnet(id: string, cidr: string, vlanId?: string, description?: string, utilization?: number): Subnet {
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
    // gateway field removed from direct creation
    vlanId,
    description,
    utilization,
  };
}


export const mockSubnets: Subnet[] = [
  createInitialSubnet('subnet-1', '192.168.1.0/24', 'vlan-1', 'Main Office Network', 60), // Original gateway '192.168.1.1' removed from direct creation. It might exist if data has it.
  createInitialSubnet('subnet-2', '10.0.0.0/16', 'vlan-2', 'Server Farm', 45), // Original gateway '10.0.0.1' removed.
  createInitialSubnet('subnet-3', '172.16.0.0/20', undefined, 'Guest WiFi', 80), // No gateway previously, still no gateway.
];

// Manually re-add gateway to specific mock subnets if needed for other parts of the app or testing,
// but the createInitialSubnet and form will not handle it.
if (mockSubnets[0]) mockSubnets[0].gateway = '192.168.1.1';
if (mockSubnets[1]) mockSubnets[1].gateway = '10.0.0.1';


export const mockVLANs: VLAN[] = [
  { id: 'vlan-1', vlanNumber: 10, description: 'Office VLAN', subnetCount: 1 },
  { id: 'vlan-2', vlanNumber: 20, description: 'Servers VLAN', subnetCount: 1 },
  { id: 'vlan-3', vlanNumber: 30, description: 'Guest VLAN', subnetCount: 0 },
];

export const mockIPAddresses: IPAddress[] = [
  { id: 'ip-1', ipAddress: '192.168.1.10', subnetId: 'subnet-1', status: 'allocated', allocatedTo: 'John Doe\'s PC', description: 'Marketing Department' },
  { id: 'ip-2', ipAddress: '192.168.1.11', subnetId: 'subnet-1', status: 'free' },
  { id: 'ip-3', ipAddress: '192.168.1.12', subnetId: 'subnet-1', status: 'reserved', description: 'Future Printer' },
  { id: 'ip-4', ipAddress: '10.0.1.5', subnetId: 'subnet-2', status: 'allocated', allocatedTo: 'WebServer01' },
  { id: 'ip-5', ipAddress: '10.0.1.6', subnetId: 'subnet-2', status: 'allocated', allocatedTo: 'DBServer01' },
];

export const mockUsers: User[] = [
  { id: 'user-1', username: 'admin', email: 'admin@example.com', roleId: 'role-1', avatar: 'https://placehold.co/100x100.png', lastLogin: new Date(Date.now() - 86400000).toISOString() },
  { id: 'user-2', username: 'net_admin', email: 'netadmin@example.com', roleId: 'role-2', avatar: 'https://placehold.co/100x100.png', lastLogin: new Date(Date.now() - 3600000).toISOString() },
  { id: 'user-3', username: 'viewer', email: 'viewer@example.com', roleId: 'role-3', avatar: 'https://placehold.co/100x100.png', lastLogin: new Date().toISOString() },
];

export const mockRoles: Role[] = [
  { id: 'role-1', name: 'Administrator', description: 'Full system access', userCount: 1 },
  { id: 'role-2', name: 'Network Manager', description: 'Manages IP resources', userCount: 1 },
  { id: 'role-3', name: 'Viewer', description: 'Read-only access', userCount: 1 },
];

export const mockAuditLogs: AuditLog[] = [
  { id: 'log-1', userId: 'user-1', username: 'admin', action: 'create_subnet', timestamp: new Date(Date.now() - 3600000 * 2).toISOString(), details: 'Created subnet 172.16.0.0/20' },
  { id: 'log-2', userId: 'user-2', username: 'net_admin', action: 'assign_ip', timestamp: new Date(Date.now() - 3600000).toISOString(), details: 'Assigned IP 192.168.1.10 to John Doe\'s PC' },
  { id: 'log-3', userId: 'user-1', username: 'admin', action: 'update_vlan', timestamp: new Date().toISOString(), details: 'Updated VLAN 10 description' },
];

export const getSubnets = async (): Promise<Subnet[]> => {
  return new Promise(resolve => setTimeout(() => resolve(mockSubnets), 500));
};

export const getVLANs = async (): Promise<VLAN[]> => {
  return new Promise(resolve => setTimeout(() => resolve(mockVLANs), 500));
};

export const getIPAddresses = async (subnetId?: string): Promise<IPAddress[]> => {
  return new Promise(resolve => setTimeout(() => {
    if (subnetId) {
      resolve(mockIPAddresses.filter(ip => ip.subnetId === subnetId));
    } else {
      resolve(mockIPAddresses);
    }
  }, 500));
};

export const getUsers = async (): Promise<User[]> => {
  return new Promise(resolve => setTimeout(() => resolve(mockUsers), 500));
};

export const getRoles = async (): Promise<Role[]> => {
  return new Promise(resolve => setTimeout(() => resolve(mockRoles), 500));
};

export const getAuditLogs = async (): Promise<AuditLog[]> => {
  return new Promise(resolve => setTimeout(() => resolve(mockAuditLogs), 500));
};
