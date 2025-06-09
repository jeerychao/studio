
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

  // Query Page
  VIEW_QUERY_PAGE: 'querypage.view',

  // ISP Management (New)
  VIEW_ISP: 'isp.view',
  CREATE_ISP: 'isp.create',
  EDIT_ISP: 'isp.edit',
  DELETE_ISP: 'isp.delete',

  // Device Management (New)
  VIEW_DEVICE: 'device.view',
  CREATE_DEVICE: 'device.create',
  EDIT_DEVICE: 'device.edit',
  DELETE_DEVICE: 'device.delete',

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
  name?: string; 
  description?: string;
  dhcpEnabled?: boolean; 
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
  directVlanId?: string; 
  status: IPAddressStatus;
  isGateway?: boolean; 
  allocatedTo?: string; 
  usageUnit?: string; 
  contactPerson?: string; 
  phone?: string; 
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
  permissions?: PermissionId[]; 
}

export interface Role {
  id: string;
  name: RoleName;
  description?: string;
  userCount?: number; 
  permissions: PermissionId[];
}

export interface AuditLog {
  id: string;
  userId?: string; 
  username?: string; 
  action: string;
  timestamp: string; 
  details?: string;
}

export interface SubnetQueryResult {
  id: string;
  cidr: string;
  name?: string; 
  description?: string;
  dhcpEnabled?: boolean; 
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
  id: TIdentifier; 
  itemIdentifier: string; 
  error: string; 
}

export interface BatchDeleteResult<TIdentifier = string> {
  successCount: number;
  failureCount: number;
  failureDetails: Array<BatchOperationFailure<TIdentifier>>;
}

// New Enum for Device Types (matches Prisma Enum)
export enum DeviceType {
  ROUTER = "ROUTER",
  SWITCH = "SWITCH",
  FIREWALL = "FIREWALL",
  SERVER = "SERVER",
  ACCESS_POINT = "ACCESS_POINT",
  OLT = "OLT",
  DDN_DEVICE = "DDN_DEVICE",
  OTHER = "OTHER",
}

// New Interface for ISP
export interface ISP {
  id: string;
  name: string;
  description?: string;
  contactInfo?: string;
  // deviceConnectionCount?: number; // Will be added when DeviceConnection is introduced
  createdAt?: string;
  updatedAt?: string;
}

// New Interface for Device
export interface Device {
  id: string;
  name: string;
  deviceType?: DeviceType;
  location?: string;
  managementIp?: string;
  brand?: string;
  modelNumber?: string;
  serialNumber?: string;
  description?: string;
  // deviceConnectionCount?: number; // Will be added when DeviceConnection is introduced
  createdAt?: string;
  updatedAt?: string;
}

// DeviceConnection interface will be added in Phase 3
