
"use server";

import { revalidatePath } from "next/cache";
import { suggestSubnet, type SuggestSubnetInput } from "@/ai/flows/suggest-subnet";
import type { Subnet, VLAN, IPAddress, User, Role, AISuggestionResponse, AuditLog, IPAddressStatus, RoleName, PermissionId } from "@/types";
import { PERMISSIONS } from "@/types";
import {
  mockSubnets,
  mockVLANs,
  mockIPAddresses,
  mockUsers,
  mockRoles,
  mockAuditLogs as serverMockAuditLogs, 
  ADMIN_ROLE_ID,
  OPERATOR_ROLE_ID,
  VIEWER_ROLE_ID,
  mockPermissions,
} from "./data";
import { parseAndValidateCIDR, getUsableIpCount, cidrToPrefix, doSubnetsOverlap, isIpInCidrRange, calculateNetworkAddress, prefixToSubnetMask, calculateIpRange } from "./ip-utils";

const generateId = () => Math.random().toString(36).substr(2, 9);

const getCurrentUserForAudit = async (): Promise<{ userId: string, username: string }> => {
  // This is a simplified mock. In a real app, you'd get this from session/auth.
  // For now, let's assume 'admin_user' if not specified otherwise.
  // If the useCurrentUser hook is client-side, we can't directly use it here.
  // A more robust solution would involve passing userId from client or having a server-side session.
  const admin = mockUsers.find(u => u.id === 'user-1'); // Assuming 'user-1' is admin_user
  if (admin) {
    return { userId: admin.id, username: admin.username };
  }
  return { userId: 'system-automated', username: 'System' }; // Fallback for system actions
};

// --- Subnet Actions ---
export async function getSubnetsAction(): Promise<Subnet[]> {
  const subnetsCopy: Subnet[] = JSON.parse(JSON.stringify(mockSubnets));

  subnetsCopy.forEach(subnet => {
    const parsedCidr = parseAndValidateCIDR(subnet.cidr);
    if (parsedCidr) {
        const totalUsableIps = getUsableIpCount(parsedCidr.prefix);
        const allocatedIps = mockIPAddresses.filter(
          ip => ip.subnetId === subnet.id && ip.status === 'allocated'
        ).length;

        let calculatedUtilization = 0;
        if (totalUsableIps > 0) {
          calculatedUtilization = Math.round((allocatedIps / totalUsableIps) * 100);
        }
        subnet.utilization = calculatedUtilization;
    } else {
        subnet.utilization = 0; 
    }
  });
  return subnetsCopy;
}

export async function createSubnetAction(data: {
  cidr: string;
  vlanId?: string;
  description?: string;
}): Promise<Subnet> {
  const auditUser = await getCurrentUserForAudit();
  const parsedCidr = parseAndValidateCIDR(data.cidr);
  if (!parsedCidr) {
    throw new Error("Invalid CIDR notation provided. Please use format X.X.X.X/Y.");
  }
  
  // Use the canonical network address from parsing for consistency
  const canonicalCidrToStore = `${parsedCidr.networkAddress}/${parsedCidr.prefix}`;

  const existingSubnetByCidr = mockSubnets.find(subnet => subnet.cidr === canonicalCidrToStore);
  if (existingSubnetByCidr) {
    throw new Error(`Subnet with CIDR ${canonicalCidrToStore} already exists.`);
  }

  for (const existingSubnet of mockSubnets) {
    const existingParsedCidr = parseAndValidateCIDR(existingSubnet.cidr);
    if (existingParsedCidr && doSubnetsOverlap(parsedCidr, existingParsedCidr)) {
      throw new Error(`The new subnet ${canonicalCidrToStore} overlaps with existing subnet ${existingSubnet.cidr}.`);
    }
  }

  const newSubnet: Subnet = {
    id: generateId(),
    cidr: canonicalCidrToStore,
    networkAddress: parsedCidr.networkAddress,
    subnetMask: parsedCidr.subnetMask,
    ipRange: parsedCidr.ipRange,
    vlanId: data.vlanId === "" ? undefined : data.vlanId,
    description: data.description || undefined,
    utilization: 0,
  };
  mockSubnets.push(newSubnet);
  serverMockAuditLogs.unshift({ id: generateId(), userId: auditUser.userId, username: auditUser.username, action: 'create_subnet', timestamp: new Date().toISOString(), details: `Created subnet ${newSubnet.cidr}` });
  revalidatePath("/subnets");
  revalidatePath("/dashboard");
  revalidatePath("/ip-addresses");
  return newSubnet;
}

export async function updateSubnetAction(id: string, data: Partial<Omit<Subnet, "id" | "utilization">> & { cidr?: string }): Promise<Subnet | null> {
  const auditUser = await getCurrentUserForAudit();
  const index = mockSubnets.findIndex(s => s.id === id);
  if (index === -1) {
    throw new Error("Subnet not found for update.");
  }

  let subnetToUpdate = { ...mockSubnets[index] };
  const originalCidrForLog = subnetToUpdate.cidr;
  
  if (data.cidr && data.cidr !== subnetToUpdate.cidr) {
    const newParsedCidrInfo = parseAndValidateCIDR(data.cidr);
    if (!newParsedCidrInfo) {
      throw new Error("Invalid new CIDR notation provided.");
    }
    const newCanonicalCidrToStore = `${newParsedCidrInfo.networkAddress}/${newParsedCidrInfo.prefix}`;

    for (const existingSubnet of mockSubnets) {
      if (existingSubnet.id === id) continue; 
      const existingParsedCidr = parseAndValidateCIDR(existingSubnet.cidr);
      if (existingParsedCidr && doSubnetsOverlap(newParsedCidrInfo, existingParsedCidr)) {
        throw new Error(`The new subnet CIDR ${newCanonicalCidrToStore} overlaps with existing subnet ${existingSubnet.cidr}.`);
      }
    }
    
    const ipsHandledDetails: string[] = [];
    mockIPAddresses.forEach(ip => {
      if (ip.subnetId === id && ip.status === 'allocated') { // Only consider allocated IPs from the current subnet
        if (!isIpInCidrRange(ip.ipAddress, newParsedCidrInfo)) {
          ipsHandledDetails.push(`${ip.ipAddress} (was status: ${ip.status}, allocatedTo: ${ip.allocatedTo || 'N/A'})`);
          ip.status = 'free';
          ip.allocatedTo = undefined;
          ip.subnetId = undefined; // Disassociate from this subnet
        }
      }
    });

     if (ipsHandledDetails.length > 0) {
      serverMockAuditLogs.unshift({
        id: generateId(),
        userId: auditUser.userId,
        username: auditUser.username,
        action: 'auto_handle_ip_on_subnet_resize',
        timestamp: new Date().toISOString(),
        details: `Subnet ${originalCidrForLog} (ID: ${id}) resized to ${newCanonicalCidrToStore}. Automatically handled out-of-range IPs: ${ipsHandledDetails.join('; ')}. These IPs are now 'free' and unassociated from any subnet.`
      });
    }

    subnetToUpdate.cidr = newCanonicalCidrToStore;
    subnetToUpdate.networkAddress = newParsedCidrInfo.networkAddress;
    subnetToUpdate.subnetMask = newParsedCidrInfo.subnetMask;
    subnetToUpdate.ipRange = newParsedCidrInfo.ipRange;
  }

  if (data.hasOwnProperty('vlanId')) {
    subnetToUpdate.vlanId = data.vlanId === "" ? undefined : data.vlanId;
  }
  if (data.hasOwnProperty('description')) {
    subnetToUpdate.description = data.description || undefined;
  }

  mockSubnets[index] = subnetToUpdate;
  serverMockAuditLogs.unshift({ id: generateId(), userId: auditUser.userId, username: auditUser.username, action: 'update_subnet', timestamp: new Date().toISOString(), details: `Updated subnet ID ${id} (Old CIDR: ${originalCidrForLog}, New CIDR: ${subnetToUpdate.cidr})` });
  
  revalidatePath("/subnets");
  revalidatePath("/dashboard");
  revalidatePath("/ip-addresses"); 
  return mockSubnets[index];
}

export async function deleteSubnetAction(id: string): Promise<{ success: boolean }> {
  const auditUser = await getCurrentUserForAudit();
  const subnetToDelete = mockSubnets.find(s => s.id === id);

  mockIPAddresses.forEach(ip => {
    if (ip.subnetId === id) {
      ip.subnetId = undefined; 
      ip.status = 'free'; 
      ip.allocatedTo = undefined;
      serverMockAuditLogs.unshift({ id: generateId(), userId: auditUser.userId, username: auditUser.username, action: 'auto_disassociate_ip_on_subnet_delete', timestamp: new Date().toISOString(), details: `IP ${ip.ipAddress} disassociated and set to free due to deletion of subnet ${subnetToDelete?.cidr}` });
    }
  });

  const subnetIndex = mockSubnets.findIndex(s => s.id === id);
  if (subnetIndex !== -1) {
     mockSubnets.splice(subnetIndex, 1);
     if (subnetToDelete) {
        serverMockAuditLogs.unshift({ id: generateId(), userId: auditUser.userId, username: auditUser.username, action: 'delete_subnet', timestamp: new Date().toISOString(), details: `Deleted subnet ${subnetToDelete.cidr}` });
     }
     revalidatePath("/subnets");
     revalidatePath("/ip-addresses");
     revalidatePath("/dashboard");
     return { success: true };
  }
  return { success: false };
}


// --- VLAN Actions ---
export async function getVLANsAction(): Promise<VLAN[]> {
  return mockVLANs.map(vlan => {
    const subnetCount = mockSubnets.filter(subnet => subnet.vlanId === vlan.id).length;
    const directIpCount = mockIPAddresses.filter(ip => ip.vlanId === vlan.id && (!ip.subnetId || !mockSubnets.some(s => s.id === ip.subnetId && s.vlanId === vlan.id))).length;
    return { ...vlan, subnetCount: subnetCount + directIpCount };
  });
}

export async function createVLANAction(data: Omit<VLAN, "id" | "subnetCount">): Promise<VLAN> {
  const auditUser = await getCurrentUserForAudit();
  const existingVLAN = mockVLANs.find(v => v.vlanNumber === data.vlanNumber);
  if (existingVLAN) {
    throw new Error(`VLAN ${data.vlanNumber} already exists.`);
  }
  const newVLAN: VLAN = { ...data, id: generateId(), subnetCount: 0 };
  mockVLANs.push(newVLAN);
  serverMockAuditLogs.unshift({ id: generateId(), userId: auditUser.userId, username: auditUser.username, action: 'create_vlan', timestamp: new Date().toISOString(), details: `Created VLAN ${newVLAN.vlanNumber}` });
  revalidatePath("/vlans");
  return newVLAN;
}

export async function updateVLANAction(id: string, data: Partial<Omit<VLAN, "id" | "subnetCount">>): Promise<VLAN | null> {
  const auditUser = await getCurrentUserForAudit();
  const index = mockVLANs.findIndex(v => v.id === id);
  if (index === -1) return null;

  if (data.vlanNumber && data.vlanNumber !== mockVLANs[index].vlanNumber) {
    const existingVLAN = mockVLANs.find(v => v.vlanNumber === data.vlanNumber && v.id !== id);
    if (existingVLAN) {
      throw new Error(`Another VLAN with number ${data.vlanNumber} already exists.`);
    }
  }
  const currentSubnetCount = mockVLANs[index].subnetCount; // Preserve calculated count or re-calc if necessary
  mockVLANs[index] = { ...mockVLANs[index], ...data, subnetCount: currentSubnetCount };
  serverMockAuditLogs.unshift({ id: generateId(), userId: auditUser.userId, username: auditUser.username, action: 'update_vlan', timestamp: new Date().toISOString(), details: `Updated VLAN ${mockVLANs[index].vlanNumber}` });
  revalidatePath("/vlans");
  revalidatePath("/subnets"); 
  revalidatePath("/ip-addresses");
  return mockVLANs[index];
}

export async function deleteVLANAction(id: string): Promise<{ success: boolean; message?: string }> {
  const auditUser = await getCurrentUserForAudit();
  const vlanToDelete = mockVLANs.find(v => v.id === id);
  if (!vlanToDelete) {
    return { success: false, message: "VLAN not found." };
  }

  const subnetsUsingVlan = mockSubnets.filter(subnet => subnet.vlanId === id);
  if (subnetsUsingVlan.length > 0) {
    throw new Error(`Cannot delete VLAN ${vlanToDelete.vlanNumber} as it is currently assigned to ${subnetsUsingVlan.length} subnet(s): ${subnetsUsingVlan.map(s=>s.cidr).join(', ')}. Please disassociate it from subnets first.`);
  }
  
  const ipsUsingVlanDirectly = mockIPAddresses.filter(ip => ip.vlanId === id);
  if (ipsUsingVlanDirectly.length > 0) {
    throw new Error(`Cannot delete VLAN ${vlanToDelete.vlanNumber} as it is directly assigned to ${ipsUsingVlanDirectly.length} IP address(es): ${ipsUsingVlanDirectly.map(ip=>ip.ipAddress).join(', ')}. Please remove direct VLAN assignment from these IPs first.`);
  }

  const vlanIndex = mockVLANs.findIndex(v => v.id === id);
  if (vlanIndex !== -1) {
    mockVLANs.splice(vlanIndex, 1);
    serverMockAuditLogs.unshift({ id: generateId(), userId: auditUser.userId, username: auditUser.username, action: 'delete_vlan', timestamp: new Date().toISOString(), details: `Deleted VLAN ${vlanToDelete.vlanNumber}` });
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
  const auditUser = await getCurrentUserForAudit();
  if (!data.subnetId && (data.status === 'allocated' || data.status === 'reserved')) {
      throw new Error("Subnet ID is required to create an 'allocated' or 'reserved' IP address that is not in the global pool.");
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
  
  if (data.vlanId && !mockVLANs.find(v => v.id === data.vlanId)) {
    throw new Error("Selected VLAN for IP address does not exist.");
  }

  const newIP: IPAddress = { ...data, id: generateId(), vlanId: data.vlanId === "" ? undefined : data.vlanId };
  mockIPAddresses.push(newIP);
  serverMockAuditLogs.unshift({
    id: generateId(),
    userId: auditUser.userId,
    username: auditUser.username,
    action: 'create_ip_address',
    timestamp: new Date().toISOString(),
    details: `Created IP ${newIP.ipAddress}${data.subnetId ? ` in subnet ${mockSubnets.find(s=>s.id===data.subnetId)?.networkAddress}` : ' in global pool'}${data.vlanId ? ` with VLAN ${mockVLANs.find(v=>v.id===data.vlanId)?.vlanNumber}` : ''}`
  });
  revalidatePath("/ip-addresses");
  revalidatePath("/dashboard");
  revalidatePath("/subnets");
  return newIP;
}

export async function updateIPAddressAction(id: string, data: Partial<Omit<IPAddress, "id">>): Promise<IPAddress | null> {
  const auditUser = await getCurrentUserForAudit();
  const index = mockIPAddresses.findIndex(ip => ip.id === id);
  if (index === -1) return null;

  const originalIPData = { ...mockIPAddresses[index] };
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
  
  if (data.hasOwnProperty('vlanId') && data.vlanId && !mockVLANs.find(v => v.id === data.vlanId)) {
    throw new Error("Selected VLAN for IP address does not exist.");
  }
  if (data.hasOwnProperty('vlanId') && data.vlanId === "") {
    updatedIPData.vlanId = undefined;
  }

  mockIPAddresses[index] = updatedIPData;
  serverMockAuditLogs.unshift({
    id: generateId(),
    userId: auditUser.userId,
    username: auditUser.username,
    action: 'update_ip_address',
    timestamp: new Date().toISOString(),
    details: `Updated IP ${updatedIPData.ipAddress}`
  });
  revalidatePath("/ip-addresses");
  revalidatePath("/dashboard");
  revalidatePath("/subnets");
  return mockIPAddresses[index];
}

export async function deleteIPAddressAction(id: string): Promise<{ success: boolean }> {
  const auditUser = await getCurrentUserForAudit();
  const ipToDelete = mockIPAddresses.find(ip => ip.id === id);
  const ipIndex = mockIPAddresses.findIndex(ip => ip.id === id);

  if (ipIndex !== -1) {
    mockIPAddresses.splice(ipIndex, 1);
    if (ipToDelete) {
       serverMockAuditLogs.unshift({ id: generateId(), userId: auditUser.userId, username: auditUser.username, action: 'delete_ip_address', timestamp: new Date().toISOString(), details: `Deleted IP ${ipToDelete.ipAddress}` });
    }
    revalidatePath("/ip-addresses");
    revalidatePath("/dashboard");
    revalidatePath("/subnets");
    return { success: true };
  }
  return { success: false };
}


// --- User Actions ---
export async function getUsersAction(): Promise<User[]> {
  return mockUsers.map(user => {
    const role = mockRoles.find(r => r.id === user.roleId);
    return { ...user, roleName: role?.name };
  });
}

export async function createUserAction(data: Omit<User, "id" | "avatar" | "lastLogin" | "roleName"> & { password?: string }): Promise<User> {
  const auditUser = await getCurrentUserForAudit();
  const existingUserByEmail = mockUsers.find(u => u.email === data.email);
  if (existingUserByEmail) {
    throw new Error(`User with email ${data.email} already exists.`);
  }
  const existingUserByUsername = mockUsers.find(u => u.username === data.username);
  if (existingUserByUsername) {
    throw new Error(`User with username ${data.username} already exists.`);
  }
  if (!mockRoles.find(r => r.id === data.roleId)) {
    throw new Error(`Invalid Role ID: ${data.roleId}. Role does not exist.`);
  }

  const newUser: User = { 
    id: generateId(), 
    username: data.username,
    email: data.email,
    roleId: data.roleId,
    avatar: `https://placehold.co/100x100.png?text=${data.username.substring(0,1).toUpperCase()}`, 
    lastLogin: new Date().toISOString() 
  };
  mockUsers.push(newUser);
  serverMockAuditLogs.unshift({ id: generateId(), userId: auditUser.userId, username: auditUser.username, action: 'create_user', timestamp: new Date().toISOString(), details: `Created user ${newUser.username}${data.password ? ' (password set)' : ''}` });
  revalidatePath("/users");
  revalidatePath("/roles"); 
  return newUser;
}

export async function updateUserAction(id: string, data: Partial<Omit<User, "id" | "roleName">> & { password?: string }): Promise<User | null> {
  const auditUser = await getCurrentUserForAudit();
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
  if (data.roleId && !mockRoles.find(r => r.id === data.roleId)) {
    throw new Error(`Invalid Role ID: ${data.roleId}. Role does not exist.`);
  }


  const { password, ...userDataToUpdate } = data; 
  mockUsers[index] = { ...mockUsers[index], ...userDataToUpdate };
  
  let auditDetails = `Updated user ${mockUsers[index].username}`;
  if (password && password.length > 0) {
    auditDetails += ' (password changed)';
  }
  serverMockAuditLogs.unshift({ id: generateId(), userId: auditUser.userId, username: auditUser.username, action: 'update_user', timestamp: new Date().toISOString(), details: auditDetails });
  revalidatePath("/users");
  revalidatePath("/roles"); 
  return mockUsers[index];
}

export async function deleteUserAction(id: string): Promise<{ success: boolean; message?: string }> {
  const auditUser = await getCurrentUserForAudit();
  const userToDelete = mockUsers.find(u => u.id === id);
  if (!userToDelete) {
    return { success: false, message: "User not found."};
  }

  if (userToDelete.roleId === ADMIN_ROLE_ID) {
      const otherAdmins = mockUsers.filter(u => u.id !== id && u.roleId === ADMIN_ROLE_ID);
      if (otherAdmins.length === 0) {
          throw new Error("Cannot delete the last Administrator user.");
      }
  }
  
  const userIndex = mockUsers.findIndex(u => u.id === id);
  if (userIndex !== -1) {
    mockUsers.splice(userIndex, 1);
    serverMockAuditLogs.unshift({ id: generateId(), userId: auditUser.userId, username: auditUser.username, action: 'delete_user', timestamp: new Date().toISOString(), details: `Deleted user ${userToDelete.username}` });
    revalidatePath("/users");
    revalidatePath("/roles"); 
    return { success: true };
  }
  return { success: false, message: "User deletion failed." };
}

// --- Role Actions ---
export async function getRolesAction(): Promise<Role[]> {
  return mockRoles.map(role => ({
    ...role,
    userCount: mockUsers.filter(user => user.roleId === role.id).length,
  }));
}

export async function createRoleAction(data: Omit<Role, "id" | "userCount" | "permissions"> & {permissions: PermissionId[]}): Promise<Role> {
  throw new Error("Creating new roles is not allowed. Roles are fixed. You can edit permissions of existing roles.");
}

export async function updateRoleAction(id: string, data: Partial<Omit<Role, "id" | "userCount" | "name">> & {permissions?: PermissionId[]} ): Promise<Role | null> {
  const auditUser = await getCurrentUserForAudit();
  const index = mockRoles.findIndex(r => r.id === id);
  if (index === -1) return null;

  if (data.hasOwnProperty('name') && data.name !== mockRoles[index].name) {
    throw new Error("Changing the name of fixed roles (Administrator, Operator, Viewer) is not allowed.");
  }

  const updatedRole = { ...mockRoles[index] };
  if (data.hasOwnProperty('description')) {
    updatedRole.description = data.description || mockRoles[index].description;
  }
  if (data.hasOwnProperty('permissions')) {
    updatedRole.permissions = data.permissions || [];
  }
  
  mockRoles[index] = updatedRole;
  
  serverMockAuditLogs.unshift({ 
    id: generateId(), 
    userId: auditUser.userId, 
    username: auditUser.username, 
    action: 'update_role', 
    timestamp: new Date().toISOString(), 
    details: `Updated role ${mockRoles[index].name}. Description: ${data.description !== undefined ? 'changed' : 'unchanged'}. Permissions: ${data.permissions !== undefined ? 'changed' : 'unchanged'}.` 
  });
  revalidatePath("/roles");
  revalidatePath("/users"); 
  return mockRoles[index];
}

export async function deleteRoleAction(id: string): Promise<{ success: boolean; message?: string }>{
  throw new Error("Deleting fixed roles (Administrator, Operator, Viewer) is not allowed.");
}

// --- AI Subnet Suggestion Action ---
export async function suggestSubnetAIAction(input: SuggestSubnetInput): Promise<AISuggestionResponse> {
  const auditUser = await getCurrentUserForAudit();
  try {
    const result = await suggestSubnet(input); 
    serverMockAuditLogs.unshift({ id: generateId(), userId: auditUser.userId, username: auditUser.username, action: 'ai_suggest_subnet', timestamp: new Date().toISOString(), details: `AI suggested subnet for: ${input.newSegmentDescription}` });
    
    // The AI flow's outputSchema is already an object, so no need to parse JSON from result.suggestedSubnet
    // Ensure result.suggestedSubnet directly matches the AISuggestion type
    const suggestedSubnetObject = result.suggestedSubnet as any; 

    if (typeof suggestedSubnetObject.subnetAddress !== 'string' || typeof suggestedSubnetObject.ipRange !== 'string') {
        console.error("AI returned an invalid format for suggested subnet details:", suggestedSubnetObject);
        throw new Error("AI returned an invalid format for the suggested subnet details. Expected object with subnetAddress and ipRange strings.");
    }

    return {
        suggestedSubnet: { // This should be an object, not a string
            subnetAddress: suggestedSubnetObject.subnetAddress,
            ipRange: suggestedSubnetObject.ipRange,
        },
        justification: result.justification,
    };

  } catch (error: any) {
    console.error("AI Subnet Suggestion Error:", error);
    serverMockAuditLogs.unshift({ id: generateId(), userId: auditUser.userId, username: auditUser.username, action: 'ai_suggest_subnet_error', timestamp: new Date().toISOString(), details: `Error during AI suggestion: ${error.message}` });
    throw new Error(error.message || "Failed to get AI subnet suggestion.");
  }
}

// --- Audit Log Actions ---
export async function getAuditLogsAction(): Promise<AuditLog[]> {
  const logsCopy: AuditLog[] = JSON.parse(JSON.stringify(serverMockAuditLogs)); 
  return logsCopy.map((log: AuditLog) => {
    if (!log.username && log.userId) {
      const user = mockUsers.find(u => u.id === log.userId);
      return { ...log, username: user ? user.username : (log.userId.startsWith('system-') ? 'System' : 'Unknown User') };
    }
    return log;
  }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

// --- Permission Actions ---
export async function getAllPermissionsAction(): Promise<Permission[]> {
    return mockPermissions;
}
