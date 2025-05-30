
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
  // ASSIGN_USER_ROLE: 'user.assign_role', // Implied by EDIT_USER for now

  // Roles
  VIEW_ROLE: 'role.view',
  EDIT_ROLE_DESCRIPTION: 'role.edit_description', // Keep if only description editing is needed
  EDIT_ROLE_PERMISSIONS: 'role.edit_permissions', // To manage the permissions of a role

  // Audit Logs
  VIEW_AUDIT_LOG: 'auditlog.view',

  // Tools
  VIEW_TOOLS_IMPORT_EXPORT: 'tools.import_export.view',
  PERFORM_TOOLS_IMPORT: 'tools.import_export.import', // Example if more granularity needed
  PERFORM_TOOLS_EXPORT: 'tools.import_export.export', // Example
  VIEW_TOOLS_SUBNET_SUGGESTION: 'tools.subnet_suggestion.view',
  USE_TOOLS_SUBNET_SUGGESTION: 'tools.subnet_suggestion.use', // Example

  // Potentially for user's own profile actions later
  // EDIT_OWN_PROFILE: 'profile.edit_own',
} as const;

export type PermissionId = typeof PERMISSIONS[keyof typeof PERMISSIONS];

export interface Permission {
  id: PermissionId;
  name: string; // User-friendly name, e.g., "Create Subnets"
  group: string; // For UI grouping, e.g., "Subnet Management"
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
  vlanId?: string; 
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
  permissions: PermissionId[]; // Array of permission IDs assigned to this role
}

// For AI Subnet Suggestion
export type ExistingSubnetInput = {
  networkAddress: string; 
  utilization: number; 
};

export type AISuggestion = {
  subnetAddress: string;
  ipRange: string;
};

export type AISuggestionResponse = {
  suggestedSubnet: AISuggestion;
  justification: string;
};

// For Audit Logs (simplified)
export interface AuditLog {
  id: string;
  userId: string;
  username?: string; 
  action: string; 
  timestamp: string; 
  details?: string; 
}
