
export type RoleName = 'Administrator' | 'Operator' | 'Viewer';

// Define all possible granular permissions in the system
export const PERMISSIONS = {
  // Dashboard
  VIEW_DASHBOARD: 'dashboard.view',

  // Subnets
  VIEW_SUBNET: 'subnet.view',
  CREATE_SUBNET: 'subnet.create',
  EDIT_SUBNET: 'subnet.edit',
  DELETE_SUBNET: 'subnet.delete',

  // VLANs
  VIEW_VLAN: 'vlan.view',
  CREATE_VLAN: 'vlan.create',
  EDIT_VLAN: 'vlan.edit',
  DELETE_VLAN: 'vlan.delete',

  // IP Addresses
  VIEW_IPADDRESS: 'ipaddress.view',
  CREATE_IPADDRESS: 'ipaddress.create',
  EDIT_IPADDRESS: 'ipaddress.edit',
  DELETE_IPADDRESS: 'ipaddress.delete',

  // Users
  VIEW_USER: 'user.view',
  CREATE_USER: 'user.create',
  EDIT_USER: 'user.edit',
  DELETE_USER: 'user.delete',

  // Roles
  VIEW_ROLE: 'role.view',
  EDIT_ROLE_DESCRIPTION: 'role.edit_description',
  EDIT_ROLE_PERMISSIONS: 'role.edit_permissions',

  // Audit Logs
  VIEW_AUDIT_LOG: 'auditlog.view',
  DELETE_AUDIT_LOG: 'auditlog.delete',

  // Tools
  VIEW_TOOLS_IMPORT_EXPORT: 'tools.import_export.view',
  PERFORM_TOOLS_IMPORT: 'tools.import_export.import',
  PERFORM_TOOLS_EXPORT: 'tools.import_export.export',

  // Settings
  VIEW_SETTINGS: 'settings.view',

  // Query Page (New)
  VIEW_QUERY_PAGE: 'querypage.view',

} as const;

export type PermissionId = typeof PERMISSIONS[keyof typeof PERMISSIONS];

export interface Permission {
  id: PermissionId;
  name: string;
  group: string;
  description?: string;
}

export interface Subnet {
  id: string;
  cidr: string;
  networkAddress: string;
  subnetMask: string;
  ipRange?: string;
  vlanId?: string;
  description?: string;
  utilization?: number;
}

export interface VLAN {
  id: string;
  vlanNumber: number;
  description?: string;
  subnetCount?: number;
}

export type IPAddressStatus = 'allocated' | 'free' | 'reserved';

export interface IPAddress {
  id: string;
  ipAddress: string;
  subnetId?: string;
  vlanId?: string; // IP-specific VLAN override
  status: IPAddressStatus;
  allocatedTo?: string;
  description?: string;
  lastSeen?: string;
}

export interface User {
  id: string;
  username: string;
  email: string;
  roleId: string;
  roleName?: RoleName;
  avatar?: string;
  lastLogin?: string;
}

export interface Role {
  id: string;
  name: RoleName;
  description?: string;
  userCount?: number;
  permissions: PermissionId[];
}


// For Audit Logs (simplified)
export interface AuditLog {
  id: string;
  userId: string;
  username?: string;
  action: string;
  timestamp: string;
  details?: string;
}

// Types for Query Results
export interface SubnetQueryResult {
  id: string;
  cidr: string;
  description?: string;
  vlanNumber?: number;
  vlanDescription?: string;
  totalUsableIPs: number;
  allocatedIPsCount: number; // IPs marked 'allocated' in DB
  dbFreeIPsCount: number;    // IPs marked 'free' in DB
  reservedIPsCount: number;  // IPs marked 'reserved' in DB
}

export interface VlanQueryResult {
  id: string;
  vlanNumber: number;
  description?: string;
  associatedSubnets: Array<{ id: string; cidr: string; description?: string }>;
  associatedDirectIPs: Array<{ id: string; ipAddress: string; description?: string }>;
}
// For IP Address query, we can reuse AppIPAddressWithRelations from actions.ts


// New type for Subnet IP Details view
export interface SubnetFreeIpDetails {
  subnetId: string;
  subnetCidr: string;
  totalUsableIPs: number;      // Mathematical total usable IPs in the subnet
  dbAllocatedIPsCount: number; // Count of IPs marked 'allocated' in DB for this subnet
  dbReservedIPsCount: number;  // Count of IPs marked 'reserved' in DB for this subnet
  // dbFreeIPsInDbCount: number; // Count of IPs marked 'free' in DB for this subnet (might be less relevant than calculated)
  calculatedAvailableIPsCount: number; // Count of IPs that are not allocated or reserved (includes those not in DB and those marked 'free' in DB)
  calculatedAvailableIpRanges: string[]; // Formatted list of free IP ranges (e.g., ["10.0.1.1-10.0.1.6", "10.0.1.10"])
}

export interface PaginatedResponse<T> {
  data: T[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  pageSize: number;
}

export interface BatchOperationFailure<TIdentifier = string> {
  id: TIdentifier;
  itemIdentifier: string; // User-friendly identifier (e.g., CIDR, IP address, VLAN number)
  error: string; // User-friendly error message
}

export interface BatchDeleteResult<TIdentifier = string> {
  successCount: number;
  failureCount: number;
  failureDetails: Array<BatchOperationFailure<TIdentifier>>;
}
