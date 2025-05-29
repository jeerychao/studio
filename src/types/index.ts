
export interface Subnet {
  id: string;
  networkAddress: string;
  subnetMask: string;
  gateway?: string;
  vlanId?: string;
  description?: string;
  utilization?: number; // Percentage 0-100
}

export interface VLAN {
  id: string;
  vlanNumber: number;
  description?: string;
  subnetCount?: number; // Derived data for display
}

export type IPAddressStatus = 'allocated' | 'free' | 'reserved';

export interface IPAddress {
  id: string;
  ipAddress: string;
  subnetId: string;
  status: IPAddressStatus;
  allocatedTo?: string;
  description?: string;
  lastSeen?: string; // Timestamp
}

export interface User {
  id: string;
  username: string;
  email: string;
  roleId: string;
  avatar?: string; // URL to avatar image
  lastLogin?: string; // Timestamp
}

export interface Role {
  id: string;
  name: string;
  description?: string;
  userCount?: number; // Derived data for display
}

// For AI Subnet Suggestion
export type ExistingSubnetInput = {
  networkAddress: string; // e.g., "192.168.1.0/24"
  utilization: number; // e.g., 60 for 60%
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
  username?: string; // Denormalized for display
  action: string; // e.g., 'create_subnet', 'assign_ip'
  timestamp: string; // ISO date string
  details?: string; // e.g., "Created subnet 192.168.1.0/24"
}
