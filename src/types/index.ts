
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
  // PERFORM_DATABASE_BACKUP: 'settings.db_backup', // Example for future backup permission

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
  name?: string; // New: For "子网名称"
  description?: string;
  dhcpEnabled?: boolean; // New: For "dhp启用"
  vlanId?: string;
  utilization?: number;
}

export interface VLAN {
  id: string;
  vlanNumber: number;
  name?: string;
  description?: string;
  subnetCount?: number; // Number of subnets and directly associated IPs
}

export type IPAddressStatus = 'allocated' | 'free' | 'reserved';

export interface IPAddress {
  id: string;
  ipAddress: string;
  subnetId?: string;
  directVlanId?: string; // Renamed from vlanId for clarity: IP-specific VLAN override
  status: IPAddressStatus;
  isGateway?: boolean; // New: For "是否网关"
  allocatedTo?: string; // General allocation target (e.g., device, service name)
  usageUnit?: string; // New: For "使用单位"
  contactPerson?: string; // New: For "联系人"
  phone?: string; // New: For "电话"
  description?: string;
  lastSeen?: string;
}

export interface User {
  id: string;
  username: string;
  email: string;
  roleId: string;
  roleName?: RoleName; // Derived in application logic
  avatar?: string;
  lastLogin?: string;
  permissions?: PermissionId[]; // Added for currentUser context
}

export interface Role {
  id: string;
  name: RoleName;
  description?: string;
  userCount?: number; // Derived from _count relation
  permissions: PermissionId[];
}

// For Audit Logs
export interface AuditLog {
  id: string;
  userId: string; // Can be 'system' or a user ID
  username?: string; // Denormalized for display, esp. if user is deleted
  action: string;
  timestamp: string; // ISO string
  details?: string;
}

// Types for Query Results
export interface SubnetQueryResult {
  id: string;
  cidr: string;
  name?: string; // New
  description?: string;
  dhcpEnabled?: boolean; // New
  vlanNumber?: number;
  vlanName?: string;
  totalUsableIPs: number;
  allocatedIPsCount: number;
  dbFreeIPsCount: number;
  reservedIPsCount: number;
}

export interface VlanQueryResult {
  id: string;
  vlanNumber: number;
  name?: string;
  description?: string;
  associatedSubnets: Array<{ id: string; cidr: string; name?:string; description?: string }>;
  associatedDirectIPs: Array<{ id: string; ipAddress: string; description?: string }>;
  resourceCount: number;
}
// For IP Address query, we can reuse AppIPAddressWithRelations from actions.ts

export interface SubnetFreeIpDetails {
  subnetId: string;
  subnetCidr: string;
  totalUsableIPs: number;
  dbAllocatedIPsCount: number;
  dbReservedIPsCount: number;
  calculatedAvailableIPsCount: number;
  calculatedAvailableIpRanges: string[];
}

export interface PaginatedResponse<T> {
  data: T[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  pageSize: number;
}

export interface BatchOperationFailure<TIdentifier = string> {
  id: TIdentifier; // Original ID of the item that failed
  itemIdentifier: string; // User-friendly identifier (e.g., CIDR, VLAN number, IP address)
  error: string; // User-friendly error message
}

export interface BatchDeleteResult<TIdentifier = string> {
  successCount: number;
  failureCount: number;
  failureDetails: Array<BatchOperationFailure<TIdentifier>>;
}
