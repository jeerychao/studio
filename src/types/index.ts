
export type RoleName = 'Administrator' | 'Operator' | 'Viewer';

export const PERMISSIONS = {
  VIEW_DASHBOARD: 'dashboard.view',
  VIEW_SUBNET: 'subnet.view',
  CREATE_SUBNET: 'subnet.create',
  EDIT_SUBNET: 'subnet.edit',
  DELETE_SUBNET: 'subnet.delete',
  VIEW_VLAN: 'vlan.view',
  CREATE_VLAN: 'vlan.create',
  EDIT_VLAN: 'vlan.edit',
  DELETE_VLAN: 'vlan.delete',
  VIEW_IPADDRESS: 'ipaddress.view',
  CREATE_IPADDRESS: 'ipaddress.create',
  EDIT_IPADDRESS: 'ipaddress.edit',
  DELETE_IPADDRESS: 'ipaddress.delete',
  VIEW_USER: 'user.view',
  CREATE_USER: 'user.create',
  EDIT_USER: 'user.edit',
  DELETE_USER: 'user.delete',
  VIEW_ROLE: 'role.view',
  EDIT_ROLE_DESCRIPTION: 'role.edit_description',
  EDIT_ROLE_PERMISSIONS: 'role.edit_permissions',
  VIEW_AUDIT_LOG: 'auditlog.view',
  DELETE_AUDIT_LOG: 'auditlog.delete',
  VIEW_TOOLS_IMPORT_EXPORT: 'tools.import_export.view',
  PERFORM_TOOLS_EXPORT: 'tools.import_export.export',
  VIEW_QUERY_PAGE: 'querypage.view',
  VIEW_SETTINGS: 'settings.view',

  VIEW_DEVICE_DICTIONARY: 'dictionary.device.view', // Renamed from local_device
  CREATE_DEVICE_DICTIONARY: 'dictionary.device.create', // Renamed
  EDIT_DEVICE_DICTIONARY: 'dictionary.device.edit', // Renamed
  DELETE_DEVICE_DICTIONARY: 'dictionary.device.delete', // Renamed

  VIEW_DICTIONARY_PAYMENT_SOURCE: 'dictionary.payment_source.view',
  CREATE_DICTIONARY_PAYMENT_SOURCE: 'dictionary.payment_source.create',
  EDIT_DICTIONARY_PAYMENT_SOURCE: 'dictionary.payment_source.edit',
  DELETE_DICTIONARY_PAYMENT_SOURCE: 'dictionary.payment_source.delete',

  VIEW_DICTIONARY_ACCESS_TYPE: 'dictionary.access_type.view',
  CREATE_DICTIONARY_ACCESS_TYPE: 'dictionary.access_type.create',
  EDIT_DICTIONARY_ACCESS_TYPE: 'dictionary.access_type.edit',
  DELETE_DICTIONARY_ACCESS_TYPE: 'dictionary.access_type.delete',

  VIEW_INTERFACE_TYPE_DICTIONARY: 'dictionary.interface_type.view', // Renamed from network_interface_type
  CREATE_INTERFACE_TYPE_DICTIONARY: 'dictionary.interface_type.create', // Renamed
  EDIT_INTERFACE_TYPE_DICTIONARY: 'dictionary.interface_type.edit', // Renamed
  DELETE_INTERFACE_TYPE_DICTIONARY: 'dictionary.interface_type.delete', // Renamed

  // OperatorDictionary related permissions are removed
  // VIEW_DICTIONARY_OPERATOR: 'dictionary.operator.view',
  // CREATE_DICTIONARY_OPERATOR: 'dictionary.operator.create',
  // EDIT_DICTIONARY_OPERATOR: 'dictionary.operator.edit',
  // DELETE_DICTIONARY_OPERATOR: 'dictionary.operator.delete',
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
  subnetCount?: number; // Represents count of associated subnets and direct IPs
}

export type IPAddressStatus = 'allocated' | 'free' | 'reserved';

export interface IPAddress {
  id: string;
  ipAddress: string;
  subnetId?: string;
  directVlanId?: string; // For IPs directly assigned to a VLAN, not through subnet
  status: IPAddressStatus;
  isGateway?: boolean;
  allocatedTo?: string;
  usageUnit?: string;
  contactPerson?: string;
  phone?: string;
  description?: string;
  lastSeen?: string; // ISO string

  // Fields replacing operator-specific ones
  peerUnitName?: string; // Formerly selectedOperatorName, now free text
  peerDeviceName?: string; // Formerly selectedOperatorDevice, now sourced from DeviceDictionary
  peerPortName?: string; // Auto-filled based on peerDeviceName from DeviceDictionary

  // Fields for local connection details
  selectedLocalDeviceName?: string; // Sourced from DeviceDictionary
  selectedDevicePort?: string; // Auto-filled based on selectedLocalDeviceName from DeviceDictionary
  
  selectedAccessType?: string; // Sourced from AccessTypeDictionary
  selectedPaymentSource?: string; // Sourced from PaymentSourceDictionary
}


export interface User {
  id: string;
  username: string;
  email: string;
  roleId: string;
  roleName?: RoleName; // Added for convenience, not directly in DB User model
  avatar?: string;
  lastLogin?: string; // ISO string
  permissions?: PermissionId[]; // Added for convenience
}

export interface Role {
  id: string;
  name: RoleName;
  description?: string;
  userCount?: number; // Calculated, not in DB
  permissions: PermissionId[];
}

export interface AuditLog {
  id: string;
  userId?: string;
  username?: string;
  action: string;
  timestamp: string; // ISO string
  details?: string;
}

// Renamed from LocalDeviceDictionary
export interface DeviceDictionary {
  id: string;
  deviceName: string; // Unique
  port?: string; // Optional port information, potentially structured or free-text
  createdAt?: string; // ISO string
  updatedAt?: string; // ISO string
}

export interface PaymentSourceDictionary {
  id: string;
  sourceName: string; // Unique
  createdAt?: string; // ISO string
  updatedAt?: string; // ISO string
}

export interface AccessTypeDictionary {
  id: string;
  name: string; // Unique
  createdAt?: string; // ISO string
  updatedAt?: string; // ISO string
}

// Renamed from NetworkInterfaceTypeDictionary
export interface InterfaceTypeDictionary {
  id: string;
  name: string; // Unique (e.g., "GigabitEthernet", "ge-", "Port-channel")
  description?: string;
  createdAt?: string; // ISO string
  updatedAt?: string; // ISO string
}

// OperatorDictionary type is removed

export interface PaginatedResponse<T> {
  data: T[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  pageSize: number;
}

export interface BatchOperationFailure<TIdentifier = string> {
  id?: TIdentifier; // ID might not always be available if failure is pre-DB
  itemIdentifier: string; // A user-friendly identifier for the item
  error: string;
}

export interface BatchDeleteResult<TIdentifier = string> {
  successCount: number;
  failureCount: number;
  failureDetails: Array<BatchOperationFailure<TIdentifier>>;
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
  dbFreeIPsCount: number; // IPs marked as 'free' in DB for this subnet
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
  calculatedAvailableIPsCount: number; // Based on totalUsable - (dbAllocated + dbReserved) - potentially more complex if actual free IPs are tracked. Simpler: totalUsable - used in DB.
  calculatedAvailableIpRanges: string[]; // List of free IP ranges.
}


// This enum is not currently used directly for DeviceDictionary types.
// It was for a more structured 'Device' model which is not part of DeviceDictionary.
// export enum DeviceType {
//   ROUTER = "ROUTER",
//   SWITCH = "SWITCH",
//   FIREWALL = "FIREWALL",
//   SERVER = "SERVER",
//   ACCESS_POINT = "ACCESS_POINT",
//   OLT = "OLT",
//   DDN_DEVICE = "DDN_DEVICE",
//   OTHER = "OTHER",
// }


export interface IPStatusCounts {
  allocated: number;
  free: number;
  reserved: number;
}

export interface TopNItemCount {
  item: string; // e.g., usageUnit, operatorName
  count: number;
  fill?: string; // for charts
}

export interface VLANResourceInfo {
  id: string;
  vlanNumber: number;
  name?: string;
  resourceCount: number;
}

export interface SubnetUtilizationInfo {
  id: string;
  cidr: string;
  name?: string;
  utilization: number;
}

export interface DashboardData {
  totalIpCount: number;
  ipStatusCounts: IPStatusCounts;
  totalVlanCount: number;
  totalSubnetCount: number;
  ipUsageByUnit: TopNItemCount[];
  // ipUsageByOperator removed as OperatorDictionary is removed
  busiestVlans: VLANResourceInfo[];
  subnetsNeedingAttention: SubnetUtilizationInfo[];
  recentAuditLogs?: AuditLog[]; // Corrected from AppAuditLog
}
