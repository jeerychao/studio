
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
  PERFORM_TOOLS_EXPORT: 'tools.import_export.export', // Only export was mentioned in mockPermissions, import can be added if needed

  // Query Page
  VIEW_QUERY_PAGE: 'querypage.view',

  // ISP Management
  VIEW_ISP: 'isp.view',
  CREATE_ISP: 'isp.create',
  EDIT_ISP: 'isp.edit',
  DELETE_ISP: 'isp.delete',

  // Device Management
  VIEW_DEVICE: 'device.view',
  CREATE_DEVICE: 'device.create',
  EDIT_DEVICE: 'device.edit',
  DELETE_DEVICE: 'device.delete',

  // Device Connection Management
  VIEW_DEVICECONNECTION: 'deviceconnection.view',
  CREATE_DEVICECONNECTION: 'deviceconnection.create',
  EDIT_DEVICECONNECTION: 'deviceconnection.edit',
  DELETE_DEVICECONNECTION: 'deviceconnection.delete',
  
  // Settings (General - may need refinement if specific sub-settings permissions are added)
  VIEW_SETTINGS: 'settings.view',

  // Dictionary Management (Permissions for dictionaries were not explicitly in the initial data.ts mockPermissions,
  // but they are defined in the schema. Including them here for completeness if needed later,
  // though they might not be used by the current role definitions.)
  VIEW_DICTIONARY_OPERATOR: 'dictionary.operator.view',
  CREATE_DICTIONARY_OPERATOR: 'dictionary.operator.create',
  EDIT_DICTIONARY_OPERATOR: 'dictionary.operator.edit',
  DELETE_DICTIONARY_OPERATOR: 'dictionary.operator.delete',

  VIEW_DICTIONARY_LOCAL_DEVICE: 'dictionary.local_device.view',
  CREATE_DICTIONARY_LOCAL_DEVICE: 'dictionary.local_device.create',
  EDIT_DICTIONARY_LOCAL_DEVICE: 'dictionary.local_device.edit',
  DELETE_DICTIONARY_LOCAL_DEVICE: 'dictionary.local_device.delete',

  VIEW_DICTIONARY_PAYMENT_SOURCE: 'dictionary.payment_source.view',
  CREATE_DICTIONARY_PAYMENT_SOURCE: 'dictionary.payment_source.create',
  EDIT_DICTIONARY_PAYMENT_SOURCE: 'dictionary.payment_source.edit',
  DELETE_DICTIONARY_PAYMENT_SOURCE: 'dictionary.payment_source.delete',

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

  selectedOperatorName?: string;
  selectedOperatorDevice?: string;
  selectedAccessType?: string;
  selectedLocalDeviceName?: string;
  selectedDevicePort?: string;
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

export interface ISP {
  id: string;
  name: string;
  description?: string;
  contactInfo?: string;
  createdAt?: string;
  updatedAt?: string;
}

export enum DeviceType {
  ROUTER = 'ROUTER',
  SWITCH = 'SWITCH',
  FIREWALL = 'FIREWALL',
  SERVER = 'SERVER',
  ACCESS_POINT = 'ACCESS_POINT',
  OLT = 'OLT',
  DDN_DEVICE = 'DDN_DEVICE',
  OTHER = 'OTHER',
}

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
  createdAt?: string;
  updatedAt?: string;
}

export enum DeviceConnectionType {
  ETHERNET_COPPER = 'ETHERNET_COPPER',
  ETHERNET_FIBER = 'ETHERNET_FIBER',
  WIFI = 'WIFI',
  SERIAL = 'SERIAL',
  VPN = 'VPN',
  OTHER = 'OTHER',
}

export enum DeviceConnectionStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  STANDBY = 'STANDBY',
  MAINTENANCE = 'MAINTENANCE',
}

export interface DeviceConnection {
  id: string;
  localDeviceId: string;
  remoteDeviceId?: string;
  remoteHostnameOrIp?: string;
  ispId?: string;
  connectionType: DeviceConnectionType;
  status: DeviceConnectionStatus;
  bandwidth?: string;
  localInterface?: string;
  remoteInterface?: string;
  localIpId?: string;
  remoteIpId?: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
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
  id: TIdentifier; // Can be the actual ID (string/number) or a temporary identifier if ID wasn't available
  itemIdentifier: string; // A user-friendly identifier for the item (e.g., name, CIDR, IP address)
  error: string;
}

export interface BatchDeleteResult<TIdentifier = string> {
  successCount: number;
  failureCount: number;
  failureDetails: Array<BatchOperationFailure<TIdentifier>>;
}

export interface OperatorDictionary {
  id: string;
  operatorName: string;
  operatorDevice?: string;
  accessType?: string; // e.g., "独享", "共享"
  createdAt?: string;
  updatedAt?: string;
}

export interface LocalDeviceDictionary {
  id: string;
  deviceName: string;
  port?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PaymentSourceDictionary {
  id: string;
  sourceName: string;
  createdAt?: string;
  updatedAt?: string;
}

    