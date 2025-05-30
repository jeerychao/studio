
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

  // Tools
  VIEW_TOOLS_IMPORT_EXPORT: 'tools.import_export.view',
  PERFORM_TOOLS_IMPORT: 'tools.import_export.import', 
  PERFORM_TOOLS_EXPORT: 'tools.import_export.export',
  
  // Settings
  VIEW_SETTINGS: 'settings.view',

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

