
"use server";

import { revalidatePath } from "next/cache";
import { suggestSubnet, type SuggestSubnetInput } from "@/ai/flows/suggest-subnet";
import type { Subnet, VLAN, IPAddress, User, Role, AISuggestionResponse, AuditLog } from "@/types";
import { 
  mockSubnets, 
  mockVLANs, 
  mockIPAddresses, 
  mockUsers, 
  mockRoles,
  mockAuditLogs
} from "./data";
import { parseAndValidateCIDR, getUsableIpCount, cidrToPrefix, doSubnetsOverlap, isIpInCidrRange } from "./ip-utils";

const generateId = () => Math.random().toString(36).substr(2, 9);

// --- Subnet Actions ---
export async function getSubnetsAction(): Promise<Subnet[]> {
  const subnetsCopy: Subnet[] = JSON.parse(JSON.stringify(mockSubnets));
  
  subnetsCopy.forEach(subnet => {
    const prefix = cidrToPrefix(subnet.cidr);
    const totalUsableIps = getUsableIpCount(prefix);
    const allocatedIps = mockIPAddresses.filter(
      ip => ip.subnetId === subnet.id && ip.status === 'allocated'
    ).length;

    let calculatedUtilization = 0;
    if (totalUsableIps > 0) {
      calculatedUtilization = Math.round((allocatedIps / totalUsableIps) * 100);
    }
    subnet.utilization = calculatedUtilization;
  });
  return subnetsCopy;
}

export async function createSubnetAction(data: { 
  cidr: string; 
  vlanId?: string; 
  description?: string; 
}): Promise<Subnet> {
  const parsedCidr = parseAndValidateCIDR(data.cidr);
  if (!parsedCidr) {
    // This case should ideally be caught by form validation, but as a safeguard:
    throw new Error("Invalid CIDR notation provided.");
  }
  
  // Check if the IP part of the user-provided CIDR is the actual network address
  // This enforces that users define subnets by their canonical network address.
  if (parsedCidr.inputIp !== parsedCidr.networkAddress) {
    throw new Error(`The IP address ${parsedCidr.inputIp} is not the network address for the prefix /${parsedCidr.prefix}. Please use ${parsedCidr.networkAddress}/${parsedCidr.prefix}.`);
  }

  const canonicalCidr = `${parsedCidr.networkAddress}/${parsedCidr.prefix}`;

  // Check for duplicate CIDR (based on canonical representation)
  const existingSubnetByCidr = mockSubnets.find(subnet => subnet.cidr === canonicalCidr);
  if (existingSubnetByCidr) {
    throw new Error(`Subnet with CIDR ${canonicalCidr} already exists.`);
  }

  // Check for overlaps with other existing subnets
  for (const existingSubnet of mockSubnets) {
    const existingParsedCidr = parseAndValidateCIDR(existingSubnet.cidr);
    if (existingParsedCidr && doSubnetsOverlap(parsedCidr, existingParsedCidr)) {
      throw new Error(`The new subnet ${canonicalCidr} overlaps with existing subnet ${existingSubnet.cidr}.`);
    }
  }

  const newSubnet: Subnet = {
    id: generateId(),
    cidr: canonicalCidr, // Store the canonical CIDR
    networkAddress: parsedCidr.networkAddress,
    subnetMask: parsedCidr.subnetMask,
    ipRange: parsedCidr.ipRange,
    vlanId: data.vlanId || undefined,
    description: data.description || undefined,
    utilization: 0,
  };
  mockSubnets.push(newSubnet);
  mockAuditLogs.unshift({ id: generateId(), userId: 'user-1', username: 'admin', action: 'create_subnet', timestamp: new Date().toISOString(), details: `Created subnet ${newSubnet.cidr}` });
  revalidatePath("/subnets");
  revalidatePath("/dashboard");
  return newSubnet;
}

export async function updateSubnetAction(id: string, data: Partial<Omit<Subnet, "id" | "networkAddress" | "subnetMask" | "ipRange" | "utilization">> & { cidr?: string }): Promise<Subnet | null> {
  const index = mockSubnets.findIndex(s => s.id === id);
  if (index === -1) return null;

  let subnetToUpdate = { ...mockSubnets[index] };
  let oldParsedCidr = parseAndValidateCIDR(subnetToUpdate.cidr); // For logging if needed

  if (data.cidr && data.cidr !== subnetToUpdate.cidr) {
    const newParsedCidr = parseAndValidateCIDR(data.cidr);
    if (!newParsedCidr) {
      throw new Error("Invalid new CIDR notation provided.");
    }

    // Enforce that the IP part of the new CIDR is its network address
    if (newParsedCidr.inputIp !== newParsedCidr.networkAddress) {
        throw new Error(`The IP address ${newParsedCidr.inputIp} is not the network address for the prefix /${newParsedCidr.prefix}. Please use ${newParsedCidr.networkAddress}/${newParsedCidr.prefix} for the new CIDR.`);
    }
    
    const newCanonicalCidr = `${newParsedCidr.networkAddress}/${newParsedCidr.prefix}`;

    // Check if another subnet (excluding the current one) already has this new CIDR
    const conflictingSubnetByCidr = mockSubnets.find(s => s.id !== id && s.cidr === newCanonicalCidr);
    if (conflictingSubnetByCidr) {
      throw new Error(`Another subnet with CIDR ${newCanonicalCidr} already exists.`);
    }

    // Check for overlaps with other existing subnets (excluding the current one being updated)
    for (const existingSubnet of mockSubnets) {
      if (existingSubnet.id === id) continue; // Skip self
      const existingParsedCidr = parseAndValidateCIDR(existingSubnet.cidr);
      if (existingParsedCidr && doSubnetsOverlap(newParsedCidr, existingParsedCidr)) {
        throw new Error(`The new CIDR ${newCanonicalCidr} overlaps with existing subnet ${existingSubnet.cidr}.`);
      }
    }

    // Check if existing allocated IPs for this subnet are still valid within the new CIDR
    const allocatedIpsInSubnet = mockIPAddresses.filter(ip => ip.subnetId === id && ip.status === 'allocated');
    for (const allocatedIp of allocatedIpsInSubnet) {
      if (!isIpInCidrRange(allocatedIp.ipAddress, newParsedCidr)) {
        throw new Error(`Cannot change CIDR to ${newCanonicalCidr}: Allocated IP address ${allocatedIp.ipAddress} would be outside the new range.`);
      }
    }

    subnetToUpdate.cidr = newCanonicalCidr;
    subnetToUpdate.networkAddress = newParsedCidr.networkAddress;
    subnetToUpdate.subnetMask = newParsedCidr.subnetMask;
    subnetToUpdate.ipRange = newParsedCidr.ipRange;
  }

  if (data.hasOwnProperty('vlanId')) subnetToUpdate.vlanId = data.vlanId || undefined;
  if (data.hasOwnProperty('description')) subnetToUpdate.description = data.description || undefined;
  
  mockSubnets[index] = subnetToUpdate;
  mockAuditLogs.unshift({ id: generateId(), userId: 'user-1', username: 'admin', action: 'update_subnet', timestamp: new Date().toISOString(), details: `Updated subnet ID ${id} (Old CIDR: ${oldParsedCidr?.cidr}, New CIDR: ${subnetToUpdate.cidr})` });
  revalidatePath("/subnets");
  revalidatePath("/dashboard");
  return mockSubnets[index];
}

export async function deleteSubnetAction(id: string): Promise<{ success: boolean }> {
  const initialLength = mockSubnets.length;
  const subnetToDelete = mockSubnets.find(s => s.id === id);

  const ipsInSubnet = mockIPAddresses.filter(ip => ip.subnetId === id);
  ipsInSubnet.forEach(ip => {
    const ipIndex = mockIPAddresses.findIndex(i => i.id === ip.id);
    if (ipIndex !== -1) mockIPAddresses.splice(ipIndex, 1);
  });

  const subnetIndex = mockSubnets.findIndex(s => s.id === id);
  if (subnetIndex !== -1) {
     mockSubnets.splice(subnetIndex, 1);
     if (subnetToDelete) {
        mockAuditLogs.unshift({ id: generateId(), userId: 'user-1', username: 'admin', action: 'delete_subnet', timestamp: new Date().toISOString(), details: `Deleted subnet ${subnetToDelete.cidr}` });
     }
  }
  
  revalidatePath("/subnets");
  revalidatePath("/ip-addresses");
  revalidatePath("/dashboard");
  return { success: mockSubnets.length < initialLength };
}


// --- VLAN Actions ---
export async function getVLANsAction(): Promise<VLAN[]> {
  return mockVLANs;
}

export async function createVLANAction(data: Omit<VLAN, "id" | "subnetCount">): Promise<VLAN> {
  const existingVLAN = mockVLANs.find(v => v.vlanNumber === data.vlanNumber);
  if (existingVLAN) {
    throw new Error(`VLAN ${data.vlanNumber} already exists.`);
  }
  const newVLAN: VLAN = { ...data, id: generateId(), subnetCount: 0 };
  mockVLANs.push(newVLAN);
  mockAuditLogs.unshift({ id: generateId(), userId: 'user-1', username: 'admin', action: 'create_vlan', timestamp: new Date().toISOString(), details: `Created VLAN ${newVLAN.vlanNumber}` });
  revalidatePath("/vlans");
  return newVLAN;
}

export async function updateVLANAction(id: string, data: Partial<Omit<VLAN, "id">>): Promise<VLAN | null> {
  const index = mockVLANs.findIndex(v => v.id === id);
  if (index === -1) return null;

  if (data.vlanNumber && data.vlanNumber !== mockVLANs[index].vlanNumber) {
    const existingVLAN = mockVLANs.find(v => v.vlanNumber === data.vlanNumber && v.id !== id);
    if (existingVLAN) {
      throw new Error(`Another VLAN with number ${data.vlanNumber} already exists.`);
    }
  }

  mockVLANs[index] = { ...mockVLANs[index], ...data };
  mockAuditLogs.unshift({ id: generateId(), userId: 'user-1', username: 'admin', action: 'update_vlan', timestamp: new Date().toISOString(), details: `Updated VLAN ${mockVLANs[index].vlanNumber}` });
  revalidatePath("/vlans");
  return mockVLANs[index];
}

export async function deleteVLANAction(id: string): Promise<{ success: boolean }> {
  const initialLength = mockVLANs.length;
  const vlanToDelete = mockVLANs.find(v => v.id === id);

  mockSubnets.forEach(subnet => {
    if (subnet.vlanId === id) {
      subnet.vlanId = undefined;
    }
  });
  
  const vlanIndex = mockVLANs.findIndex(v => v.id === id);
  if (vlanIndex !== -1) {
    mockVLANs.splice(vlanIndex, 1);
    if (vlanToDelete) {
      mockAuditLogs.unshift({ id: generateId(), userId: 'user-1', username: 'admin', action: 'delete_vlan', timestamp: new Date().toISOString(), details: `Deleted VLAN ${vlanToDelete.vlanNumber}` });
    }
  }

  revalidatePath("/vlans");
  revalidatePath("/subnets");
  return { success: mockVLANs.length < initialLength };
}

// --- IP Address Actions ---
export async function getIPAddressesAction(subnetId?: string): Promise<IPAddress[]> {
  if (subnetId) return mockIPAddresses.filter(ip => ip.subnetId === subnetId);
  return mockIPAddresses;
}

export async function createIPAddressAction(data: Omit<IPAddress, "id">): Promise<IPAddress> {
  const existingIP = mockIPAddresses.find(ip => ip.subnetId === data.subnetId && ip.ipAddress === data.ipAddress);
  if (existingIP) {
    throw new Error("IP address already exists in this subnet.");
  }
  const newIP: IPAddress = { ...data, id: generateId() };
  mockIPAddresses.push(newIP);
  mockAuditLogs.unshift({ id: generateId(), userId: 'user-1', username: 'admin', action: 'create_ip_address', timestamp: new Date().toISOString(), details: `Created IP ${newIP.ipAddress} in subnet ${newIP.subnetId}` });
  revalidatePath("/ip-addresses");
  revalidatePath("/dashboard"); 
  return newIP;
}

export async function updateIPAddressAction(id: string, data: Partial<Omit<IPAddress, "id">>): Promise<IPAddress | null> {
  const index = mockIPAddresses.findIndex(ip => ip.id === id);
  if (index === -1) return null;

  const targetIp = data.ipAddress || mockIPAddresses[index].ipAddress;
  const targetSubnetId = data.subnetId || mockIPAddresses[index].subnetId;

  if (targetIp !== mockIPAddresses[index].ipAddress || targetSubnetId !== mockIPAddresses[index].subnetId) {
    const existingIP = mockIPAddresses.find(ip => ip.id !== id && ip.subnetId === targetSubnetId && ip.ipAddress === targetIp);
    if (existingIP) {
      throw new Error("IP address already exists in the target subnet.");
    }
  }
  
  mockIPAddresses[index] = { ...mockIPAddresses[index], ...data };
  mockAuditLogs.unshift({ id: generateId(), userId: 'user-1', username: 'admin', action: 'update_ip_address', timestamp: new Date().toISOString(), details: `Updated IP ${mockIPAddresses[index].ipAddress}` });
  revalidatePath("/ip-addresses");
  revalidatePath("/dashboard"); 
  return mockIPAddresses[index];
}

export async function deleteIPAddressAction(id: string): Promise<{ success: boolean }> {
  const initialLength = mockIPAddresses.length;
  const ipToDelete = mockIPAddresses.find(ip => ip.id === id);
  const ipIndex = mockIPAddresses.findIndex(ip => ip.id === id);

  if (ipIndex !== -1) {
    mockIPAddresses.splice(ipIndex, 1);
    if (ipToDelete) {
       mockAuditLogs.unshift({ id: generateId(), userId: 'user-1', username: 'admin', action: 'delete_ip_address', timestamp: new Date().toISOString(), details: `Deleted IP ${ipToDelete.ipAddress}` });
    }
  }
  revalidatePath("/ip-addresses");
  revalidatePath("/dashboard"); 
  return { success: mockIPAddresses.length < initialLength };
}


// --- User Actions ---
export async function getUsersAction(): Promise<User[]> {
  return mockUsers;
}

export async function createUserAction(data: Omit<User, "id" | "avatar" | "lastLogin">): Promise<User> {
  const existingUserByEmail = mockUsers.find(u => u.email === data.email);
  if (existingUserByEmail) {
    throw new Error(`User with email ${data.email} already exists.`);
  }
  const existingUserByUsername = mockUsers.find(u => u.username === data.username);
  if (existingUserByUsername) {
    throw new Error(`User with username ${data.username} already exists.`);
  }

  const newUser: User = { ...data, id: generateId(), avatar: `https://placehold.co/100x100.png?text=${data.username.substring(0,1)}`, lastLogin: new Date().toISOString() };
  mockUsers.push(newUser);
  mockAuditLogs.unshift({ id: generateId(), userId: 'user-1', username: 'admin', action: 'create_user', timestamp: new Date().toISOString(), details: `Created user ${newUser.username}` });
  revalidatePath("/users");
  return newUser;
}

export async function updateUserAction(id: string, data: Partial<Omit<User, "id">>): Promise<User | null> {
  const index = mockUsers.findIndex(u => u.id === id);
  if (index === -1) return null;

  if (data.email && data.email !== mockUsers[index].email) {
    const existingUserByEmail = mockUsers.find(u => u.email === data.email && u.id !== id);
    if (existingUserByEmail) {
      throw new Error(`Another user with email ${data.email} already exists.`);
    }
  }
  if (data.username && data.username !== mockUsers[index].username) {
    const existingUserByUsername = mockUsers.find(u => u.username === data.username && u.id !== id);
    if (existingUserByUsername) {
      throw new Error(`Another user with username ${data.username} already exists.`);
    }
  }

  mockUsers[index] = { ...mockUsers[index], ...data };
  mockAuditLogs.unshift({ id: generateId(), userId: 'user-1', username: 'admin', action: 'update_user', timestamp: new Date().toISOString(), details: `Updated user ${mockUsers[index].username}` });
  revalidatePath("/users");
  return mockUsers[index];
}

export async function deleteUserAction(id: string): Promise<{ success: boolean }> {
  const initialLength = mockUsers.length;
  const userToDelete = mockUsers.find(u => u.id === id);
  const userIndex = mockUsers.findIndex(u => u.id === id);
  if (userIndex !== -1) {
    mockUsers.splice(userIndex, 1);
    if (userToDelete) {
        mockAuditLogs.unshift({ id: generateId(), userId: 'user-1', username: 'admin', action: 'delete_user', timestamp: new Date().toISOString(), details: `Deleted user ${userToDelete.username}` });
    }
  }
  revalidatePath("/users");
  return { success: mockUsers.length < initialLength };
}

// --- Role Actions ---
export async function getRolesAction(): Promise<Role[]> {
  return mockRoles;
}

export async function createRoleAction(data: Omit<Role, "id" | "userCount">): Promise<Role> {
  const existingRole = mockRoles.find(r => r.name.toLowerCase() === data.name.toLowerCase());
  if (existingRole) {
    throw new Error(`Role with name "${data.name}" already exists.`);
  }
  const newRole: Role = { ...data, id: generateId(), userCount: 0 };
  mockRoles.push(newRole);
  mockAuditLogs.unshift({ id: generateId(), userId: 'user-1', username: 'admin', action: 'create_role', timestamp: new Date().toISOString(), details: `Created role ${newRole.name}` });
  revalidatePath("/roles");
  return newRole;
}

export async function updateRoleAction(id: string, data: Partial<Omit<Role, "id">>): Promise<Role | null> {
  const index = mockRoles.findIndex(r => r.id === id);
  if (index === -1) return null;

  if (data.name && data.name.toLowerCase() !== mockRoles[index].name.toLowerCase()) {
    const existingRole = mockRoles.find(r => r.name.toLowerCase() === data.name!.toLowerCase() && r.id !== id);
    if (existingRole) {
      throw new Error(`Another role with name "${data.name}" already exists.`);
    }
  }

  mockRoles[index] = { ...mockRoles[index], ...data };
  mockAuditLogs.unshift({ id: generateId(), userId: 'user-1', username: 'admin', action: 'update_role', timestamp: new Date().toISOString(), details: `Updated role ${mockRoles[index].name}` });
  revalidatePath("/roles");
  return mockRoles[index];
}

export async function deleteRoleAction(id: string): Promise<{ success: boolean }> {
  const initialLength = mockRoles.length;
  const roleToDelete = mockRoles.find(r => r.id === id);

  const defaultRoleId = mockRoles.find(r => r.name === 'Viewer')?.id || ''; 
  mockUsers.forEach(user => {
    if (user.roleId === id) {
      user.roleId = defaultRoleId; 
    }
  });

  const roleIndex = mockRoles.findIndex(r => r.id === id);
  if (roleIndex !== -1) {
    mockRoles.splice(roleIndex, 1);
    if (roleToDelete) {
        mockAuditLogs.unshift({ id: generateId(), userId: 'user-1', username: 'admin', action: 'delete_role', timestamp: new Date().toISOString(), details: `Deleted role ${roleToDelete.name}` });
    }
  }
  revalidatePath("/roles");
  revalidatePath("/users"); 
  return { success: mockRoles.length < initialLength };
}

// --- AI Subnet Suggestion Action ---
export async function suggestSubnetAIAction(input: SuggestSubnetInput): Promise<AISuggestionResponse> {
  try {
    const result = await suggestSubnet(input);
    mockAuditLogs.unshift({ id: generateId(), userId: 'user-1', username: 'admin', action: 'ai_suggest_subnet', timestamp: new Date().toISOString(), details: `AI suggested subnet for: ${input.newSegmentDescription}` });
    return JSON.parse(JSON.stringify(result)); 
  } catch (error: any) {
    console.error("AI Subnet Suggestion Error:", error);
    throw new Error(error.message || "Failed to get AI subnet suggestion.");
  }
}

// --- Audit Log Actions ---
export async function getAuditLogsAction(): Promise<AuditLog[]> {
  const logsCopy = JSON.parse(JSON.stringify(mockAuditLogs));
  return logsCopy.map((log: AuditLog) => {
    if (!log.username && log.userId) { 
      const user = mockUsers.find(u => u.id === log.userId);
      return { ...log, username: user ? user.username : 'System' };
    }
    return log;
  });
}
