
"use server";

import { revalidatePath } from "next/cache";
import { suggestSubnet, type SuggestSubnetInput } from "@/ai/flows/suggest-subnet";
import type { Subnet, VLAN, IPAddress, User, Role, AISuggestionResponse, AuditLog, IPAddressStatus } from "@/types";
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

// Helper for audit logs
const getCurrentUser = () => {
    // In a real app, this would come from session/auth
    return mockUsers.find(u => u.username === 'admin') || { id: 'system', username: 'System' };
}

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
  const currentUser = getCurrentUser();
  const parsedCidr = parseAndValidateCIDR(data.cidr);
  if (!parsedCidr) {
    throw new Error("Invalid CIDR notation provided. Please use format X.X.X.X/Y.");
  }
  // Use the canonical network address from the parsed CIDR for checks and storage
  const canonicalCidr = `${parsedCidr.networkAddress}/${parsedCidr.prefix}`;

  const existingSubnetByCidr = mockSubnets.find(subnet => subnet.cidr === canonicalCidr);
  if (existingSubnetByCidr) {
    throw new Error(`Subnet with CIDR ${canonicalCidr} already exists.`);
  }

  for (const existingSubnet of mockSubnets) {
    const existingParsedCidr = parseAndValidateCIDR(existingSubnet.cidr);
    if (existingParsedCidr && doSubnetsOverlap(parsedCidr, existingParsedCidr)) {
      throw new Error(`The new subnet ${canonicalCidr} overlaps with existing subnet ${existingSubnet.cidr}.`);
    }
  }

  const newSubnet: Subnet = {
    id: generateId(),
    cidr: canonicalCidr, 
    networkAddress: parsedCidr.networkAddress,
    subnetMask: parsedCidr.subnetMask,
    ipRange: parsedCidr.ipRange,
    vlanId: data.vlanId || undefined,
    description: data.description || undefined,
    utilization: 0,
  };
  mockSubnets.push(newSubnet);
  mockAuditLogs.unshift({ id: generateId(), userId: currentUser.id, username: currentUser.username, action: 'create_subnet', timestamp: new Date().toISOString(), details: `Created subnet ${newSubnet.cidr}` });
  revalidatePath("/subnets");
  revalidatePath("/dashboard");
  revalidatePath("/ip-addresses"); // Revalidate IP addresses in case new subnet affects global IP view or filters
  return newSubnet;
}

export async function updateSubnetAction(id: string, data: Partial<Omit<Subnet, "id" | "utilization">> & { cidr?: string }): Promise<Subnet | null> {
  const currentUser = getCurrentUser();
  const index = mockSubnets.findIndex(s => s.id === id);
  if (index === -1) {
    throw new Error("Subnet not found for update.");
  }

  let subnetToUpdate = { ...mockSubnets[index] };
  const originalCidrForLog = subnetToUpdate.cidr;
  let cidrChanged = false;
  let vlanIdChanged = false;
  let newCanonicalCidrToStore = subnetToUpdate.cidr; 

  if (data.cidr && data.cidr !== subnetToUpdate.cidr) {
    cidrChanged = true;
    const newParsedCidrInfo = parseAndValidateCIDR(data.cidr); 
    if (!newParsedCidrInfo) {
      throw new Error("Invalid new CIDR notation provided. Please use format X.X.X.X/Y.");
    }
    
    newCanonicalCidrToStore = `${newParsedCidrInfo.networkAddress}/${newParsedCidrInfo.prefix}`;

    for (const existingSubnet of mockSubnets) {
      if (existingSubnet.id === id) continue; 
      const existingParsedCidr = parseAndValidateCIDR(existingSubnet.cidr); 
      if (existingParsedCidr && doSubnetsOverlap(newParsedCidrInfo, existingParsedCidr)) { 
        throw new Error(`The new subnet CIDR ${newCanonicalCidrToStore} overlaps with existing subnet ${existingSubnet.cidr}.`);
      }
    }
    
    const ipsInSubnet = mockIPAddresses.filter(ip => ip.subnetId === id);
    const ipsHandledDetails: string[] = [];

    for (const ip of ipsInSubnet) {
      if (!isIpInCidrRange(ip.ipAddress, newParsedCidrInfo)) { 
        const ipIndexInMock = mockIPAddresses.findIndex(mockIp => mockIp.id === ip.id);
        if (ipIndexInMock !== -1) {
          const ipToModify = mockIPAddresses[ipIndexInMock];
          ipsHandledDetails.push(`${ipToModify.ipAddress} (was status: ${ipToModify.status}, allocatedTo: ${ipToModify.allocatedTo || 'N/A'})`);
          
          ipToModify.status = 'free';
          ipToModify.allocatedTo = undefined;
          ipToModify.subnetId = undefined; 
        }
      }
    }
    
    if (ipsHandledDetails.length > 0) {
      mockAuditLogs.unshift({ 
        id: generateId(), 
        userId: currentUser.id, 
        username: currentUser.username, 
        action: 'auto_handle_ip_on_subnet_resize', 
        timestamp: new Date().toISOString(), 
        details: `Subnet ${originalCidrForLog} (ID: ${id}) resized to ${newCanonicalCidrToStore}. Automatically handled out-of-range IPs: ${ipsHandledDetails.join('; ')}. These IPs are now 'free' and unassociated.` 
      });
    }

    subnetToUpdate.cidr = newCanonicalCidrToStore; 
    subnetToUpdate.networkAddress = newParsedCidrInfo.networkAddress;
    subnetToUpdate.subnetMask = newParsedCidrInfo.subnetMask;
    subnetToUpdate.ipRange = newParsedCidrInfo.ipRange;
  }

  if (data.hasOwnProperty('vlanId')) {
    const newVlanId = data.vlanId === "" || data.vlanId === undefined ? undefined : data.vlanId;
    if (subnetToUpdate.vlanId !== newVlanId) {
        vlanIdChanged = true;
        subnetToUpdate.vlanId = newVlanId;
    }
  }
  if (data.hasOwnProperty('description')) {
    subnetToUpdate.description = data.description || undefined;
  }
  
  mockSubnets[index] = subnetToUpdate;
  mockAuditLogs.unshift({ id: generateId(), userId: currentUser.id, username: currentUser.username, action: 'update_subnet', timestamp: new Date().toISOString(), details: `Updated subnet ID ${id} (Old CIDR: ${originalCidrForLog}, New CIDR: ${newCanonicalCidrToStore})` });
  
  revalidatePath("/subnets");
  revalidatePath("/dashboard");
  if (cidrChanged || vlanIdChanged) { 
    revalidatePath("/ip-addresses"); 
  }
  return mockSubnets[index];
}

export async function deleteSubnetAction(id: string): Promise<{ success: boolean }> {
  const currentUser = getCurrentUser();
  const initialLength = mockSubnets.length;
  const subnetToDelete = mockSubnets.find(s => s.id === id);

  mockIPAddresses.forEach(ip => {
    if (ip.subnetId === id) {
      ip.subnetId = undefined;
      ip.status = 'free';
      ip.allocatedTo = undefined;
      mockAuditLogs.unshift({ id: generateId(), userId: currentUser.id, username: currentUser.username, action: 'auto_disassociate_ip_on_subnet_delete', timestamp: new Date().toISOString(), details: `IP ${ip.ipAddress} disassociated and set to free due to deletion of subnet ${subnetToDelete?.cidr}` });
    }
  });

  const subnetIndex = mockSubnets.findIndex(s => s.id === id);
  if (subnetIndex !== -1) {
     mockSubnets.splice(subnetIndex, 1);
     if (subnetToDelete) {
        mockAuditLogs.unshift({ id: generateId(), userId: currentUser.id, username: currentUser.username, action: 'delete_subnet', timestamp: new Date().toISOString(), details: `Deleted subnet ${subnetToDelete.cidr}` });
     }
  }
  
  revalidatePath("/subnets");
  revalidatePath("/ip-addresses"); 
  revalidatePath("/dashboard");
  return { success: mockSubnets.length < initialLength };
}


// --- VLAN Actions ---
export async function getVLANsAction(): Promise<VLAN[]> {
  // Simulate fetching VLANs and updating their subnet counts
  const vlansWithCounts = mockVLANs.map(vlan => {
    const count = mockSubnets.filter(subnet => subnet.vlanId === vlan.id).length;
    return { ...vlan, subnetCount: count };
  });
  return vlansWithCounts;
}

export async function createVLANAction(data: Omit<VLAN, "id" | "subnetCount">): Promise<VLAN> {
  const currentUser = getCurrentUser();
  const existingVLAN = mockVLANs.find(v => v.vlanNumber === data.vlanNumber);
  if (existingVLAN) {
    throw new Error(`VLAN ${data.vlanNumber} already exists.`);
  }
  const newVLAN: VLAN = { ...data, id: generateId(), subnetCount: 0 };
  mockVLANs.push(newVLAN);
  mockAuditLogs.unshift({ id: generateId(), userId: currentUser.id, username: currentUser.username, action: 'create_vlan', timestamp: new Date().toISOString(), details: `Created VLAN ${newVLAN.vlanNumber}` });
  revalidatePath("/vlans");
  return newVLAN;
}

export async function updateVLANAction(id: string, data: Partial<Omit<VLAN, "id" | "subnetCount">>): Promise<VLAN | null> {
  const currentUser = getCurrentUser();
  const index = mockVLANs.findIndex(v => v.id === id);
  if (index === -1) return null;

  if (data.vlanNumber && data.vlanNumber !== mockVLANs[index].vlanNumber) {
    const existingVLAN = mockVLANs.find(v => v.vlanNumber === data.vlanNumber && v.id !== id);
    if (existingVLAN) {
      throw new Error(`Another VLAN with number ${data.vlanNumber} already exists.`);
    }
  }
  // Retain existing subnetCount as this form doesn't modify it directly
  mockVLANs[index] = { ...mockVLANs[index], ...data, subnetCount: mockVLANs[index].subnetCount };
  mockAuditLogs.unshift({ id: generateId(), userId: currentUser.id, username: currentUser.username, action: 'update_vlan', timestamp: new Date().toISOString(), details: `Updated VLAN ${mockVLANs[index].vlanNumber}` });
  revalidatePath("/vlans");
  return mockVLANs[index];
}

export async function deleteVLANAction(id: string): Promise<{ success: boolean; message?: string }> {
  const currentUser = getCurrentUser();
  const vlanToDelete = mockVLANs.find(v => v.id === id);
  if (!vlanToDelete) {
    return { success: false, message: "VLAN not found." };
  }

  const subnetsUsingVlan = mockSubnets.filter(subnet => subnet.vlanId === id);
  if (subnetsUsingVlan.length > 0) {
    throw new Error(`Cannot delete VLAN ${vlanToDelete.vlanNumber} as it is currently assigned to ${subnetsUsingVlan.length} subnet(s): ${subnetsUsingVlan.map(s=>s.cidr).join(', ')}. Please disassociate it from subnets first.`);
  }
  
  const initialLength = mockVLANs.length;
  const vlanIndex = mockVLANs.findIndex(v => v.id === id);

  if (vlanIndex !== -1) {
    mockVLANs.splice(vlanIndex, 1);
    mockAuditLogs.unshift({ id: generateId(), userId: currentUser.id, username: currentUser.username, action: 'delete_vlan', timestamp: new Date().toISOString(), details: `Deleted VLAN ${vlanToDelete.vlanNumber}` });
    revalidatePath("/vlans");
    revalidatePath("/subnets"); 
    revalidatePath("/ip-addresses");
    return { success: true };
  }
  return { success: false, message: "Failed to delete VLAN." };
}

// --- IP Address Actions ---
export async function getIPAddressesAction(subnetId?: string): Promise<IPAddress[]> {
  if (subnetId) return mockIPAddresses.filter(ip => ip.subnetId === subnetId);
  return mockIPAddresses;
}

export async function createIPAddressAction(data: Omit<IPAddress, "id">): Promise<IPAddress> {
  const currentUser = getCurrentUser();
  if (!data.subnetId && (data.status === 'allocated' || data.status === 'reserved')) {
      throw new Error("Subnet ID is required to create an 'allocated' or 'reserved' IP address.");
  }
  
  if (data.subnetId) {
    const targetSubnet = mockSubnets.find(s => s.id === data.subnetId);
    if (!targetSubnet) {
      throw new Error("Target subnet not found.");
    }
    const parsedTargetSubnetCidr = parseAndValidateCIDR(targetSubnet.cidr);
    if (!parsedTargetSubnetCidr) {
      throw new Error("Target subnet has an invalid CIDR configuration.");
    }
    if (!isIpInCidrRange(data.ipAddress, parsedTargetSubnetCidr)) {
      throw new Error(`IP address ${data.ipAddress} is not within the range of subnet ${targetSubnet.cidr}.`);
    }

    const existingIPInSubnet = mockIPAddresses.find(ip => ip.ipAddress === data.ipAddress && ip.subnetId === data.subnetId);
    if (existingIPInSubnet) {
      throw new Error(`IP address ${data.ipAddress} already exists in subnet ${targetSubnet.networkAddress}.`);
    }
  } else { 
      const globallyExistingIP = mockIPAddresses.find(ip => ip.ipAddress === data.ipAddress && !ip.subnetId);
      if (globallyExistingIP) {
          throw new Error(`IP address ${data.ipAddress} already exists in the global pool (not assigned to a subnet).`);
      }
  }

  const newIP: IPAddress = { ...data, id: generateId() };
  mockIPAddresses.push(newIP);
  mockAuditLogs.unshift({ 
    id: generateId(), 
    userId: currentUser.id, 
    username: currentUser.username, 
    action: 'create_ip_address', 
    timestamp: new Date().toISOString(), 
    details: `Created IP ${newIP.ipAddress}${data.subnetId ? ` in subnet ${mockSubnets.find(s=>s.id===data.subnetId)?.networkAddress}` : ' in global pool'}` 
  });
  revalidatePath("/ip-addresses");
  revalidatePath("/dashboard"); 
  revalidatePath("/subnets"); // For utilization updates
  return newIP;
}

export async function updateIPAddressAction(id: string, data: Partial<Omit<IPAddress, "id">>): Promise<IPAddress | null> {
  const currentUser = getCurrentUser();
  const index = mockIPAddresses.findIndex(ip => ip.id === id);
  if (index === -1) return null;

  const originalIPData = mockIPAddresses[index];
  const updatedIPData = { ...originalIPData, ...data };

  if (data.subnetId !== undefined || data.ipAddress) { 
    const targetSubnetId = updatedIPData.subnetId; 
    const targetIpAddress = updatedIPData.ipAddress;

    if (targetSubnetId) { 
        const targetSubnet = mockSubnets.find(s => s.id === targetSubnetId);
        if (!targetSubnet) {
            throw new Error("Target subnet not found.");
        }
        const parsedTargetSubnetCidr = parseAndValidateCIDR(targetSubnet.cidr);
        if (!parsedTargetSubnetCidr) {
            throw new Error("Target subnet has an invalid CIDR configuration.");
        }
        if (!isIpInCidrRange(targetIpAddress, parsedTargetSubnetCidr)) {
            throw new Error(`IP address ${targetIpAddress} is not within the range of subnet ${targetSubnet.cidr}.`);
        }

        const conflictingIP = mockIPAddresses.find(ip => 
            ip.id !== id && 
            ip.ipAddress === targetIpAddress && 
            ip.subnetId === targetSubnetId
        );
        if (conflictingIP) {
            throw new Error(`IP address ${targetIpAddress} already exists in subnet ${targetSubnet.networkAddress}.`);
        }
    } else { 
        const globallyConflictingIP = mockIPAddresses.find(ip => 
            ip.id !== id && 
            ip.ipAddress === targetIpAddress && 
            !ip.subnetId 
        );
        if (globallyConflictingIP) {
            throw new Error(`IP address ${targetIpAddress} already exists in the global pool (not assigned to a subnet).`);
        }
    }
  }
  
  mockIPAddresses[index] = updatedIPData;
  mockAuditLogs.unshift({ id: generateId(), userId: currentUser.id, username: currentUser.username, action: 'update_ip_address', timestamp: new Date().toISOString(), details: `Updated IP ${updatedIPData.ipAddress}` });
  revalidatePath("/ip-addresses");
  revalidatePath("/dashboard"); 
  revalidatePath("/subnets"); // For utilization updates
  return mockIPAddresses[index];
}

export async function deleteIPAddressAction(id: string): Promise<{ success: boolean }> {
  const currentUser = getCurrentUser();
  const initialLength = mockIPAddresses.length;
  const ipToDelete = mockIPAddresses.find(ip => ip.id === id);
  const ipIndex = mockIPAddresses.findIndex(ip => ip.id === id);

  if (ipIndex !== -1) {
    mockIPAddresses.splice(ipIndex, 1);
    if (ipToDelete) {
       mockAuditLogs.unshift({ id: generateId(), userId: currentUser.id, username: currentUser.username, action: 'delete_ip_address', timestamp: new Date().toISOString(), details: `Deleted IP ${ipToDelete.ipAddress}` });
    }
  }
  revalidatePath("/ip-addresses");
  revalidatePath("/dashboard"); 
  revalidatePath("/subnets"); // For utilization updates
  return { success: mockIPAddresses.length < initialLength };
}


// --- User Actions ---
export async function getUsersAction(): Promise<User[]> {
  return mockUsers.map(user => {
    const role = mockRoles.find(r => r.id === user.roleId);
    return { ...user, roleName: role?.name || "N/A"}; // Add roleName for display
  });
}

export async function createUserAction(data: Omit<User, "id" | "avatar" | "lastLogin" | "roleName">): Promise<User> {
  const currentUser = getCurrentUser();
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
  mockAuditLogs.unshift({ id: generateId(), userId: currentUser.id, username: currentUser.username, action: 'create_user', timestamp: new Date().toISOString(), details: `Created user ${newUser.username}` });
  revalidatePath("/users");
  revalidatePath("/roles"); // User count on roles page
  return newUser;
}

export async function updateUserAction(id: string, data: Partial<Omit<User, "id" | "roleName">>): Promise<User | null> {
  const currentUser = getCurrentUser();
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
  mockAuditLogs.unshift({ id: generateId(), userId: currentUser.id, username: currentUser.username, action: 'update_user', timestamp: new Date().toISOString(), details: `Updated user ${mockUsers[index].username}` });
  revalidatePath("/users");
  revalidatePath("/roles"); // User count on roles page
  return mockUsers[index];
}

export async function deleteUserAction(id: string): Promise<{ success: boolean }> {
  const currentUser = getCurrentUser();
  const initialLength = mockUsers.length;
  const userToDelete = mockUsers.find(u => u.id === id);
  const userIndex = mockUsers.findIndex(u => u.id === id);
  if (userIndex !== -1) {
    const adminRole = mockRoles.find(role => role.name.toLowerCase() === 'administrator');
    if (adminRole && mockUsers[userIndex].roleId === adminRole.id) {
        const otherAdmins = mockUsers.filter(u => u.id !== id && u.roleId === adminRole.id);
        if (otherAdmins.length === 0) {
            throw new Error("Cannot delete the last administrator user.");
        }
    }
    mockUsers.splice(userIndex, 1);
    if (userToDelete) {
        mockAuditLogs.unshift({ id: generateId(), userId: currentUser.id, username: currentUser.username, action: 'delete_user', timestamp: new Date().toISOString(), details: `Deleted user ${userToDelete.username}` });
    }
  }
  revalidatePath("/users");
  revalidatePath("/roles"); // User count on roles page
  return { success: mockUsers.length < initialLength };
}

// --- Role Actions ---
export async function getRolesAction(): Promise<Role[]> {
  // Calculate userCount for each role
  return mockRoles.map(role => ({
    ...role,
    userCount: mockUsers.filter(user => user.roleId === role.id).length,
  }));
}

export async function createRoleAction(data: Omit<Role, "id" | "userCount">): Promise<Role> {
  const currentUser = getCurrentUser();
  const existingRole = mockRoles.find(r => r.name.toLowerCase() === data.name.toLowerCase());
  if (existingRole) {
    throw new Error(`Role with name "${data.name}" already exists.`);
  }
  const newRole: Role = { ...data, id: generateId(), userCount: 0 };
  mockRoles.push(newRole);
  mockAuditLogs.unshift({ id: generateId(), userId: currentUser.id, username: currentUser.username, action: 'create_role', timestamp: new Date().toISOString(), details: `Created role ${newRole.name}` });
  revalidatePath("/roles");
  return newRole;
}

export async function updateRoleAction(id: string, data: Partial<Omit<Role, "id" | "userCount">>): Promise<Role | null> {
  const currentUser = getCurrentUser();
  const index = mockRoles.findIndex(r => r.id === id);
  if (index === -1) return null;

  if (data.name && data.name.toLowerCase() !== mockRoles[index].name.toLowerCase()) {
    const existingRole = mockRoles.find(r => r.name.toLowerCase() === data.name!.toLowerCase() && r.id !== id);
    if (existingRole) {
      throw new Error(`Another role with name "${data.name}" already exists.`);
    }
  }
  // Retain userCount as it's derived
  mockRoles[index] = { ...mockRoles[index], ...data, userCount: mockRoles[index].userCount };
  mockAuditLogs.unshift({ id: generateId(), userId: currentUser.id, username: currentUser.username, action: 'update_role', timestamp: new Date().toISOString(), details: `Updated role ${mockRoles[index].name}` });
  revalidatePath("/roles");
  revalidatePath("/users"); // User role name might change
  return mockRoles[index];
}

export async function deleteRoleAction(id: string): Promise<{ success: boolean; message?: string }>{
  const currentUser = getCurrentUser();
  const roleToDelete = mockRoles.find(r => r.id === id);
  if (!roleToDelete) {
    return { success: false, message: "Role not found." };
  }

  if (roleToDelete.name.toLowerCase() === 'administrator') {
    throw new Error("The 'Administrator' role cannot be deleted.");
  }
  
  const usersInRole = mockUsers.filter(user => user.roleId === id).length;
  if (usersInRole > 0) {
    throw new Error(`Cannot delete role "${roleToDelete.name}" as it is currently assigned to ${usersInRole} user(s). Please reassign users first.`);
  }

  const initialLength = mockRoles.length;
  const roleIndex = mockRoles.findIndex(r => r.id === id);

  if (roleIndex !== -1) {
    mockRoles.splice(roleIndex, 1);
    mockAuditLogs.unshift({ id: generateId(), userId: currentUser.id, username: currentUser.username, action: 'delete_role', timestamp: new Date().toISOString(), details: `Deleted role ${roleToDelete.name}` });
    revalidatePath("/roles");
    revalidatePath("/users"); 
    return { success: true };
  }
  return { success: false, message: "Failed to delete role." };
}

// --- AI Subnet Suggestion Action ---
export async function suggestSubnetAIAction(input: SuggestSubnetInput): Promise<AISuggestionResponse> {
  const currentUser = getCurrentUser();
  try {
    const result = await suggestSubnet(input);
    mockAuditLogs.unshift({ id: generateId(), userId: currentUser.id, username: currentUser.username, action: 'ai_suggest_subnet', timestamp: new Date().toISOString(), details: `AI suggested subnet for: ${input.newSegmentDescription}` });
    try {
      // The AI flow now directly returns the SuggestSubnetOutputSchema, which includes the nested suggestedSubnet object
      // So, we directly use result.suggestedSubnet.subnetAddress and result.suggestedSubnet.ipRange
      // And the top-level result.justification
      
      // Validate the structure of the AI response, though the flow schema should handle this.
      if (typeof result.suggestedSubnet === 'string') { // Check if it's still the old stringified JSON
        const parsedResult = JSON.parse(result.suggestedSubnet as any);
         return {
            suggestedSubnet: {
              subnetAddress: parsedResult.suggestedSubnet.subnetAddress,
              ipRange: parsedResult.suggestedSubnet.ipRange,
            },
            justification: result.justification,
          };
      }
      // If result.suggestedSubnet is an object as expected by SuggestSubnetOutputSchema
      return {
        suggestedSubnet: { // This structure matches AISuggestionResponse
          subnetAddress: (result.suggestedSubnet as any).subnetAddress, // Cast if necessary if TypeScript complains
          ipRange: (result.suggestedSubnet as any).ipRange,
        },
        justification: result.justification,
      };

    } catch (parseError) {
      console.error("AI Subnet Suggestion - JSON parsing error (or direct object access error):", parseError);
      throw new Error("AI returned an invalid format for the suggested subnet.");
    }
  } catch (error: any) {
    console.error("AI Subnet Suggestion Error:", error);
    throw new Error(error.message || "Failed to get AI subnet suggestion.");
  }
}

// --- Audit Log Actions ---
export async function getAuditLogsAction(): Promise<AuditLog[]> {
  const logsCopy: AuditLog[] = JSON.parse(JSON.stringify(mockAuditLogs));
  return logsCopy.map((log: AuditLog) => {
    if (!log.username && log.userId) { 
      const user = mockUsers.find(u => u.id === log.userId);
      // Use 'System' if user is not found or userId is 'system' (for programmatic actions)
      return { ...log, username: user ? user.username : (log.userId === 'system' ? 'System' : 'Unknown User') };
    }
    return log;
  }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()); // Sort by newest first
}
