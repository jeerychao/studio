
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

  VIEW_DEVICE_DICTIONARY: 'dictionary.device.view', // Renamed from LOCAL_DEVICE
  CREATE_DEVICE_DICTIONARY: 'dictionary.device.create',
  EDIT_DEVICE_DICTIONARY: 'dictionary.device.edit',
  DELETE_DEVICE_DICTIONARY: 'dictionary.device.delete',

  VIEW_DICTIONARY_PAYMENT_SOURCE: 'dictionary.payment_source.view',
  CREATE_DICTIONARY_PAYMENT_SOURCE: 'dictionary.payment_source.create',
  EDIT_DICTIONARY_PAYMENT_SOURCE: 'dictionary.payment_source.edit',
  DELETE_DICTIONARY_PAYMENT_SOURCE: 'dictionary.payment_source.delete',

  VIEW_DICTIONARY_ACCESS_TYPE: 'dictionary.access_type.view',
  CREATE_DICTIONARY_ACCESS_TYPE: 'dictionary.access_type.create',
  EDIT_DICTIONARY_ACCESS_TYPE: 'dictionary.access_type.edit',
  DELETE_DICTIONARY_ACCESS_TYPE: 'dictionary.access_type.delete',

  VIEW_INTERFACE_TYPE_DICTIONARY: 'dictionary.interface_type.view', // Renamed from NETWORK_INTERFACE_TYPE
  CREATE_INTERFACE_TYPE_DICTIONARY: 'dictionary.interface_type.create',
  EDIT_INTERFACE_TYPE_DICTIONARY: 'dictionary.interface_type.edit',
  DELETE_INTERFACE_TYPE_DICTIONARY: 'dictionary.interface_type.delete',
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
  subnetCount?: number;
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

  peerUnitName?: string;      // New: Manual input for peer/customer/partner name
  peerDeviceName?: string;    // New: Name of the device on the peer side (from DeviceDictionary)
  peerPortName?: string;      // New: Port on the peer device (derived from selected DeviceDictionary entry's port)

  selectedLocalDeviceName?: string; // Existing: Name of local device (from DeviceDictionary)
  selectedDevicePort?: string;      // Existing: Port on local device (derived)
  
  selectedAccessType?: string;
  selectedPaymentSource?: string;
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

// Renamed from LocalDeviceDictionary
export interface DeviceDictionary {
  id: string;
  deviceName: string;
  port?: string; // e.g., "GigabitEthernet1/0/1", "Port-channel10"
  createdAt?: string;
  updatedAt?: string;
}

export interface PaymentSourceDictionary {
  id: string;
  sourceName: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AccessTypeDictionary {
  id: string;
  name: string; 
  createdAt?: string;
  updatedAt?: string;
}

// Renamed from NetworkInterfaceTypeDictionary
export interface InterfaceTypeDictionary {
  id: string;
  name: string; 
  description?: string;
  createdAt?: string;
  updatedAt?: string;
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

export enum DeviceType { // This enum might not be directly used if DeviceDictionary is generic
  ROUTER = "ROUTER",
  SWITCH = "SWITCH",
  FIREWALL = "FIREWALL",
  SERVER = "SERVER",
  ACCESS_POINT = "ACCESS_POINT",
  OLT = "OLT",
  DDN_DEVICE = "DDN_DEVICE",
  OTHER = "OTHER",
}

export interface IPStatusCounts {
  allocated: number;
  free: number;
  reserved: number;
}

export interface TopNItemCount {
  item: string;
  count: number;
  fill?: string;
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
  // ipUsageByOperator removed as per discussion
  busiestVlans: VLANResourceInfo[];
  subnetsNeedingAttention: SubnetUtilizationInfo[];
  recentAuditLogs?: AppAuditLog[];
}
