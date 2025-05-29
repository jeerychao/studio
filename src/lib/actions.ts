
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
    throw new Error("Invalid CIDR notation provided. Please use format X.X.X.X/Y.");
  }
  
  if (parsedCidr.inputIp !== parsedCidr.networkAddress) {
    throw new Error(`The IP address ${parsedCidr.inputIp} is not the network address for the prefix /${parsedCidr.prefix}. Please use ${parsedCidr.networkAddress}/${parsedCidr.prefix}.`);
  }

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
  mockAuditLogs.unshift({ id: generateId(), userId: 'user-1', username: 'admin', action: 'create_subnet', timestamp: new Date().toISOString(), details: `Created subnet ${newSubnet.cidr}` });
  revalidatePath("/subnets");
  revalidatePath("/dashboard");
  return newSubnet;
}

export async function updateSubnetAction(id: string, data: Partial<Omit<Subnet, "id" | "networkAddress" | "subnetMask" | "ipRange" | "utilization">> & { cidr?: string }): Promise<Subnet | null> {
  const index = mockSubnets.findIndex(s => s.id === id);
  if (index === -1) return null;

  let subnetToUpdate = { ...mockSubnets[index] };
  const originalCidrForLog = subnetToUpdate.cidr;

  if (data.cidr && data.cidr !== subnetToUpdate.cidr) {
    const newParsedCidr = parseAndValidateCIDR(data.cidr);
    if (!newParsedCidr) {
      throw new Error("Invalid new CIDR notation provided.");
    }

    if (newParsedCidr.inputIp !== newParsedCidr.networkAddress) {
        throw new Error(`The IP address ${newParsedCidr.inputIp} is not the network address for the prefix /${newParsedCidr.prefix}. Please use ${newParsedCidr.networkAddress}/${newParsedCidr.prefix} for the new CIDR.`);
    }
    
    const newCanonicalCidr = `${newParsedCidr.networkAddress}/${newParsedCidr.prefix}`;

    const conflictingSubnetByCidr = mockSubnets.find(s => s.id !== id && s.cidr === newCanonicalCidr);
    if (conflictingSubnetByCidr) {
      throw new Error(`Another subnet with CIDR ${newCanonicalCidr} already exists.`);
    }

    for (const existingSubnet of mockSubnets) {
      if (existingSubnet.id === id) continue; 
      const existingParsedCidr = parseAndValidateCIDR(existingSubnet.cidr);
      if (existingParsedCidr && doSubnetsOverlap(newParsedCidr, existingParsedCidr)) {
        throw new Error(`The new CIDR ${newCanonicalCidr} overlaps with existing subnet ${existingSubnet.cidr}.`);
      }
    }

    // Handle existing allocated IPs for this subnet if the CIDR changes
    const allocatedIpsInSubnet = mockIPAddresses.filter(ip => ip.subnetId === id && ip.status === 'allocated');
    const ipsDeallocatedDetails: string[] = [];

    for (const allocatedIp of allocatedIpsInSubnet) {
      if (!isIpInCidrRange(allocatedIp.ipAddress, newParsedCidr)) {
        // This IP is no longer in the new range. Deallocate and disassociate.
        const ipIndex = mockIPAddresses.findIndex(ip => ip.id === allocatedIp.id);
        if (ipIndex !== -1) {
          mockIPAddresses[ipIndex].status = 'free';
          mockIPAddresses[ipIndex].allocatedTo = undefined;
          mockIPAddresses[ipIndex].subnetId = undefined; // Disassociate from this subnet
          ipsDeallocatedDetails.push(`${allocatedIp.ipAddress} (was ${allocatedIp.allocatedTo || 'N/A'})`);
        }
      }
    }
    
    if (ipsDeallocatedDetails.length > 0) {
      mockAuditLogs.unshift({ 
        id: generateId(), 
        userId: 'user-1', 
        username: 'admin', 
        action: 'auto_deallocate_ip_on_subnet_resize', 
        timestamp: new Date().toISOString(), 
        details: `Subnet ${originalCidrForLog} (ID: ${id}) resized to ${newCanonicalCidr}. Automatically deallocated and disassociated IPs: ${ipsDeallocatedDetails.join('; ')}.` 
      });
    }

    subnetToUpdate.cidr = newCanonicalCidr;
    subnetToUpdate.networkAddress = newParsedCidr.networkAddress;
    subnetToUpdate.subnetMask = newParsedCidr.subnetMask;
    subnetToUpdate.ipRange = newParsedCidr.ipRange;
  }

  if (data.hasOwnProperty('vlanId')) subnetToUpdate.vlanId = data.vlanId || undefined;
  if (data.hasOwnProperty('description')) subnetToUpdate.description = data.description || undefined;
  
  mockSubnets[index] = subnetToUpdate;
  mockAuditLogs.unshift({ id: generateId(), userId: 'user-1', username: 'admin', action: 'update_subnet', timestamp: new Date().toISOString(), details: `Updated subnet ID ${id} (Old CIDR: ${originalCidrForLog}, New CIDR: ${subnetToUpdate.cidr})` });
  revalidatePath("/subnets");
  revalidatePath("/ip-addresses"); // IPs might have been disassociated
  revalidatePath("/dashboard");
  return mockSubnets[index];
}

export async function deleteSubnetAction(id: string): Promise<{ success: boolean }> {
  const initialLength = mockSubnets.length;
  const subnetToDelete = mockSubnets.find(s => s.id === id);

  // Disassociate IP addresses rather than deleting them, set status to free
  mockIPAddresses.forEach(ip => {
    if (ip.subnetId === id) {
      ip.subnetId = undefined;
      ip.status = 'free';
      ip.allocatedTo = undefined;
      // Consider adding an audit log entry for each IP disassociated/freed here
      mockAuditLogs.unshift({ id: generateId(), userId: 'user-1', username: 'admin', action: 'auto_disassociate_ip_on_subnet_delete', timestamp: new Date().toISOString(), details: `IP ${ip.ipAddress} disassociated and set to free due to deletion of subnet ${subnetToDelete?.cidr}` });
    }
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
  return mockIPAddresses; // Returns all IPs if no subnetId is provided
}

export async function createIPAddressAction(data: Omit<IPAddress, "id">): Promise<IPAddress> {
  // Ensure subnetId is provided, as per type and form validation
  if (!data.subnetId) {
    throw new Error("Subnet ID is required to create an IP address.");
  }
  const targetSubnet = mockSubnets.find(s => s.id === data.subnetId);
  if (!targetSubnet) {
    throw new Error("Target subnet not found.");
  }
  const parsedTargetSubnetCidr = parseAndValidateCIDR(targetSubnet.cidr);
  if (!parsedTargetSubnetCidr) {
    throw new Error("Target subnet has an invalid CIDR configuration."); // Should not happen with valid data
  }
  if (!isIpInCidrRange(data.ipAddress, parsedTargetSubnetCidr)) {
    throw new Error(`IP address ${data.ipAddress} is not within the range of subnet ${targetSubnet.cidr}.`);
  }

  const existingIP = mockIPAddresses.find(ip => ip.ipAddress === data.ipAddress && ip.subnetId === data.subnetId);
  if (existingIP) {
    throw new Error(`IP address ${data.ipAddress} already exists in subnet ${targetSubnet.networkAddress}.`);
  }
  
  // Check for global IP uniqueness if not associated with a subnet (though current logic requires subnetId)
  // or if we want to enforce global IP uniqueness regardless of subnet.
  // For now, scoped to subnet. If global uniqueness is desired:
  // const globallyExistingIP = mockIPAddresses.find(ip => ip.ipAddress === data.ipAddress);
  // if (globallyExistingIP) {
  //   throw new Error(`IP address ${data.ipAddress} already exists in the system (possibly in another subnet).`);
  // }


  const newIP: IPAddress = { ...data, id: generateId() };
  mockIPAddresses.push(newIP);
  mockAuditLogs.unshift({ id: generateId(), userId: 'user-1', username: 'admin', action: 'create_ip_address', timestamp: new Date().toISOString(), details: `Created IP ${newIP.ipAddress} in subnet ${targetSubnet.networkAddress}` });
  revalidatePath("/ip-addresses");
  revalidatePath("/dashboard"); 
  return newIP;
}

export async function updateIPAddressAction(id: string, data: Partial<Omit<IPAddress, "id">>): Promise<IPAddress | null> {
  const index = mockIPAddresses.findIndex(ip => ip.id === id);
  if (index === -1) return null;

  const originalIPData = mockIPAddresses[index];
  const updatedIPData = { ...originalIPData, ...data };

  // If subnetId or ipAddress changes, validate the new combination
  if (data.subnetId || data.ipAddress) {
    const targetSubnetId = updatedIPData.subnetId;
    const targetIpAddress = updatedIPData.ipAddress;

    if (!targetSubnetId) { // IP is being disassociated or subnetId removed
        // Check if globally this IP exists (if we enforce global uniqueness for IPs not in subnets)
        // For now, we allow IPs to exist without subnetId after de-association.
    } else {
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
    }
  }
  
  mockIPAddresses[index] = updatedIPData;
  mockAuditLogs.unshift({ id: generateId(), userId: 'user-1', username: 'admin', action: 'update_ip_address', timestamp: new Date().toISOString(), details: `Updated IP ${updatedIPData.ipAddress}` });
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
    const adminRole = mockRoles.find(role => role.name.toLowerCase() === 'administrator');
    if (adminRole && mockUsers[userIndex].roleId === adminRole.id) {
        const otherAdmins = mockUsers.filter(u => u.id !== id && u.roleId === adminRole.id);
        if (otherAdmins.length === 0) {
            throw new Error("Cannot delete the last administrator user.");
        }
    }
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

export async function deleteRoleAction(id: string): Promise<{ success: boolean; message?: string }>{
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
    mockAuditLogs.unshift({ id: generateId(), userId: 'user-1', username: 'admin', action: 'delete_role', timestamp: new Date().toISOString(), details: `Deleted role ${roleToDelete.name}` });
    revalidatePath("/roles");
    revalidatePath("/users"); 
    return { success: true };
  }
  return { success: false, message: "Failed to delete role." };
}

// --- AI Subnet Suggestion Action ---
export async function suggestSubnetAIAction(input: SuggestSubnetInput): Promise<AISuggestionResponse> {
  try {
    const result = await suggestSubnet(input);
    mockAuditLogs.unshift({ id: generateId(), userId: 'user-1', username: 'admin', action: 'ai_suggest_subnet', timestamp: new Date().toISOString(), details: `AI suggested subnet for: ${input.newSegmentDescription}` });
    return result; 
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
      return { ...log, username: user ? user.username : 'System' };
    }
    return log;
  });
}

