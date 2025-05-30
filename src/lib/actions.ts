
"use server";

import { revalidatePath } from "next/cache";
import type { Subnet, VLAN, IPAddress, User, Role, AuditLog, IPAddressStatus, RoleName, PermissionId, Permission } from '@/types';
import { PERMISSIONS } from '@/types';
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

// In a real app, current user would come from auth session on the server.
// For this mock, we'll simulate this by trying to find an admin user or defaulting.
// In a real app, you'd use a library like next-auth or Clerk to get the session.
const getCurrentUser = async (): Promise<{ userId: string, username: string }> => {
  // This is a simplified mock. In a real app, this would resolve the current user from session.
  // For now, let's assume there's a way to identify a 'system' or a default admin for audit.
  // This could be enhanced if useCurrentUser hook's value could be passed to server actions.
  const adminUser = mockUsers.find(u => u.roleId === ADMIN_ROLE_ID);
  if (adminUser) {
    return { userId: adminUser.id, username: adminUser.username };
  }
  // Fallback for system-initiated actions or if no specific user context is available.
  return { userId: 'system-default-id', username: 'System' };
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
        subnet.utilization = 0; // Should not happen if data is clean
    }
  });
  return subnetsCopy;
}

export async function createSubnetAction(data: {
  cidr: string;
  vlanId?: string;
  description?: string;
}): Promise<Subnet> {
  const auditUser = await getCurrentUser();
  const parsedCidr = parseAndValidateCIDR(data.cidr);

  if (!parsedCidr) {
    throw new Error("Invalid CIDR notation format. Please use X.X.X.X/Y.");
  }
  
  const canonicalCidrToStore = `${parsedCidr.networkAddress}/${parsedCidr.prefix}`;

  // Check if user-provided IP in CIDR is the canonical network address.
  // If not, guide them. e.g., input 192.168.1.10/24 -> suggest 192.168.1.0/24.
  if (data.cidr !== canonicalCidrToStore) {
    throw new Error(`Invalid CIDR: The IP address part is not the network address for the given prefix. For input ${data.cidr}, please use ${canonicalCidrToStore}.`);
  }

  const existingSubnetByCidr = mockSubnets.find(subnet => subnet.cidr === canonicalCidrToStore);
  if (existingSubnetByCidr) {
    throw new Error(`Subnet with CIDR ${canonicalCidrToStore} already exists.`);
  }

  // Check for overlaps with other existing subnets
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

export async function updateSubnetAction(id: string, data: Partial<Omit<Subnet, "id" | "utilization" | "networkAddress" | "subnetMask" | "ipRange">> & { cidr?: string }): Promise<Subnet | null> {
  const auditUser = await getCurrentUser();
  const index = mockSubnets.findIndex(s => s.id === id);
  if (index === -1) {
    throw new Error("Subnet not found for update.");
  }

  let subnetToUpdate = { ...mockSubnets[index] };
  const originalCidrForLog = subnetToUpdate.cidr;
  let newCanonicalCidrForLog = subnetToUpdate.cidr; 

  if (data.cidr && data.cidr !== subnetToUpdate.cidr) {
    const newParsedCidrInfo = parseAndValidateCIDR(data.cidr);
    if (!newParsedCidrInfo) {
      throw new Error("Invalid new CIDR notation provided for update.");
    }
    const newCanonicalCidr = `${newParsedCidrInfo.networkAddress}/${newParsedCidrInfo.prefix}`;
    newCanonicalCidrForLog = newCanonicalCidr;

    if (data.cidr !== newCanonicalCidr) {
        throw new Error(`Invalid CIDR for update: The IP address part is not the network address for the given prefix. For input ${data.cidr}, please use ${newCanonicalCidr}.`);
    }

    const conflictingExistingSubnet = mockSubnets.find(existingSubnet => {
        if (existingSubnet.id === id) return false; 
        const existingParsedCidr = parseAndValidateCIDR(existingSubnet.cidr);
        return existingParsedCidr && doSubnetsOverlap(newParsedCidrInfo, existingParsedCidr);
    });

    if (conflictingExistingSubnet) {
        throw new Error(`The new subnet CIDR ${newCanonicalCidr} overlaps with existing subnet ${conflictingExistingSubnet.cidr}.`);
    }
    
    const allocatedIpsInSubnet = mockIPAddresses.filter(ip => ip.subnetId === id && ip.status === 'allocated');
    const ipsHandledDetails: string[] = [];

    for (const allocatedIp of allocatedIpsInSubnet) {
      if (!isIpInCidrRange(allocatedIp.ipAddress, newParsedCidrInfo)) {
        ipsHandledDetails.push(`${allocatedIp.ipAddress} (was status: ${allocatedIp.status}, allocatedTo: ${allocatedIp.allocatedTo || 'N/A'})`);
        
        const ipIndexToModify = mockIPAddresses.findIndex(ip => ip.id === allocatedIp.id);
        if (ipIndexToModify !== -1) {
          mockIPAddresses[ipIndexToModify].status = 'free';
          mockIPAddresses[ipIndexToModify].allocatedTo = undefined;
          mockIPAddresses[ipIndexToModify].subnetId = undefined; 
          mockIPAddresses[ipIndexToModify].vlanId = undefined; // Also clear direct VLAN assignment if it moves to global pool
        }
      }
    }
    if (ipsHandledDetails.length > 0) {
      serverMockAuditLogs.unshift({
        id: generateId(),
        userId: auditUser.userId,
        username: auditUser.username,
        action: 'auto_handle_ip_on_subnet_resize',
        timestamp: new Date().toISOString(),
        details: `Subnet ${originalCidrForLog} (ID: ${id}) resized to ${newCanonicalCidr}. Automatically de-allocated and disassociated out-of-range IPs: ${ipsHandledDetails.join('; ')}.`
      });
    }

    subnetToUpdate.cidr = newCanonicalCidr;
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
  serverMockAuditLogs.unshift({ id: generateId(), userId: auditUser.userId, username: auditUser.username, action: 'update_subnet', timestamp: new Date().toISOString(), details: `Updated subnet ID ${id} (Old CIDR: ${originalCidrForLog}, New CIDR: ${newCanonicalCidrForLog})` });

  revalidatePath("/subnets");
  revalidatePath("/dashboard");
  revalidatePath("/ip-addresses");
  return mockSubnets[index];
}

export async function deleteSubnetAction(id: string): Promise<{ success: boolean }> {
  const auditUser = await getCurrentUser();
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
    const subnetCountForVlan = mockSubnets.filter(subnet => subnet.vlanId === vlan.id).length;
    const directIpCountForVlan = mockIPAddresses.filter(ip => 
        ip.vlanId === vlan.id && 
        (!ip.subnetId || !mockSubnets.some(s => s.id === ip.subnetId && s.vlanId === vlan.id))
    ).length;
    return { ...vlan, subnetCount: subnetCountForVlan + directIpCountForVlan };
  });
}

export async function createVLANAction(data: Omit<VLAN, "id" | "subnetCount">): Promise<VLAN> {
  const auditUser = await getCurrentUser();
  const existingVLAN = mockVLANs.find(v => v.vlanNumber === data.vlanNumber);
  if (existingVLAN) {
    throw new Error(`VLAN ${data.vlanNumber} already exists.`);
  }
  const newVLAN: VLAN = { ...data, id: generateId(), subnetCount: 0 };
  mockVLANs.push(newVLAN);
  serverMockAuditLogs.unshift({ id: generateId(), userId: auditUser.userId, username: auditUser.username, action: 'create_vlan', timestamp: new Date().toISOString(), details: `Created VLAN ${newVLAN.vlanNumber}` });
  revalidatePath("/vlans");
  revalidatePath("/subnets"); 
  revalidatePath("/ip-addresses"); 
  return newVLAN;
}

export async function updateVLANAction(id: string, data: Partial<Omit<VLAN, "id" | "subnetCount">>): Promise<VLAN | null> {
  const auditUser = await getCurrentUser();
  const index = mockVLANs.findIndex(v => v.id === id);
  if (index === -1) return null;

  if (data.vlanNumber && data.vlanNumber !== mockVLANs[index].vlanNumber) {
    const existingVLAN = mockVLANs.find(v => v.vlanNumber === data.vlanNumber && v.id !== id);
    if (existingVLAN) {
      throw new Error(`Another VLAN with number ${data.vlanNumber} already exists.`);
    }
  }
  const currentSubnetCount = mockVLANs[index].subnetCount; 
  mockVLANs[index] = { ...mockVLANs[index], ...data, subnetCount: currentSubnetCount };
  serverMockAuditLogs.unshift({ id: generateId(), userId: auditUser.userId, username: auditUser.username, action: 'update_vlan', timestamp: new Date().toISOString(), details: `Updated VLAN ${mockVLANs[index].vlanNumber}` });
  revalidatePath("/vlans");
  revalidatePath("/subnets"); 
  revalidatePath("/ip-addresses"); 
  return mockVLANs[index];
}

export async function deleteVLANAction(id: string): Promise<{ success: boolean; message?: string }> {
  const auditUser = await getCurrentUser();
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
  const auditUser = await getCurrentUser();
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
  const auditUser = await getCurrentUser();
  const index = mockIPAddresses.findIndex(ip => ip.id === id);
  if (index === -1) return null;

  const originalIPData = { ...mockIPAddresses[index] };
  const updatedIPData = { ...originalIPData, ...data }; 

  if (updatedIPData.subnetId) { 
    const targetSubnet = mockSubnets.find(s => s.id === updatedIPData.subnetId);
    if (!targetSubnet) {
      throw new Error("Target subnet not found.");
    }
    const parsedTargetSubnetCidr = parseAndValidateCIDR(targetSubnet.cidr);
    if (!parsedTargetSubnetCidr) {
      throw new Error("Target subnet has an invalid CIDR configuration.");
    }
    if (!isIpInCidrRange(updatedIPData.ipAddress, parsedTargetSubnetCidr)) {
      throw new Error(`IP address ${updatedIPData.ipAddress} is not within the range of subnet ${targetSubnet.cidr}.`);
    }
    const conflictingIP = mockIPAddresses.find(ip =>
        ip.id !== id && 
        ip.ipAddress === updatedIPData.ipAddress &&
        ip.subnetId === updatedIPData.subnetId
    );
    if (conflictingIP) {
        throw new Error(`IP address ${updatedIPData.ipAddress} already exists in subnet ${targetSubnet.networkAddress}.`);
    }
  } else { 
    const globallyConflictingIP = mockIPAddresses.find(ip =>
        ip.id !== id && 
        ip.ipAddress === updatedIPData.ipAddress &&
        !ip.subnetId 
    );
    if (globallyConflictingIP) {
        throw new Error(`IP address ${updatedIPData.ipAddress} already exists in the global pool.`);
    }
  }

  if (!updatedIPData.subnetId && (updatedIPData.status === 'allocated' || updatedIPData.status === 'reserved')) {
      throw new Error("Subnet ID is required for an 'allocated' or 'reserved' IP address unless it is being set to 'free'.");
  }

  if (data.hasOwnProperty('vlanId')) { 
    if (data.vlanId && data.vlanId !== "" && !mockVLANs.find(v => v.id === data.vlanId)) {
      throw new Error("Selected VLAN for IP address does not exist.");
    }
    updatedIPData.vlanId = data.vlanId === "" ? undefined : data.vlanId; 
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
  const auditUser = await getCurrentUser();
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
    return { ...user, roleName: role?.name as RoleName || 'Unknown Role' };
  });
}

export async function createUserAction(data: Omit<User, "id" | "avatar" | "lastLogin" | "roleName"> & { password?: string }): Promise<User> {
  const auditUser = await getCurrentUser();
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
  const auditUser = await getCurrentUser();
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
  const auditUser = await getCurrentUser();
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

interface UpdateOwnPasswordPayload {
  currentPassword?: string; 
  newPassword?: string;
}

export async function updateOwnPasswordAction(userId: string, payload: UpdateOwnPasswordPayload): Promise<{ success: boolean; message?: string }> {
  const userIndex = mockUsers.findIndex(u => u.id === userId);

  if (userIndex === -1) {
    return { success: false, message: "User not found." };
  }

  if (!payload.newPassword) { 
      return { success: false, message: "New password cannot be empty."};
  }

  serverMockAuditLogs.unshift({
    id: generateId(),
    userId: userId, 
    username: mockUsers[userIndex].username,
    action: 'update_own_password',
    timestamp: new Date().toISOString(),
    details: `User ${mockUsers[userIndex].username} changed their password.`
  });

  revalidatePath("/settings"); 
  return { success: true, message: "Password updated successfully." };
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
  const auditUser = await getCurrentUser();
  const index = mockRoles.findIndex(r => r.id === id);
  if (index === -1) return null;

  const updatedRole = { ...mockRoles[index] };
  if (data.hasOwnProperty('description')) {
    updatedRole.description = data.description || mockRoles[index].description; 
  }
  if (data.hasOwnProperty('permissions')) {
    // Correctly update the permissions on the updatedRole object
    updatedRole.permissions = data.permissions || [];
  }

  mockRoles[index] = updatedRole;

  let details = `Updated role ${mockRoles[index].name}.`;
  if (data.hasOwnProperty('description')) details += ` Description ${data.description ? 'changed' : 'cleared/unchanged'}.`;
  if (data.hasOwnProperty('permissions')) details += ` Permissions ${data.permissions && data.permissions.length > 0 ? 'changed' : 'cleared/unchanged'}.`;
  
  serverMockAuditLogs.unshift({
    id: generateId(),
    userId: auditUser.userId,
    username: auditUser.username,
    action: 'update_role',
    timestamp: new Date().toISOString(),
    details: details
  });
  revalidatePath("/roles");
  revalidatePath("/users"); 
  return mockRoles[index];
}


export async function deleteRoleAction(id: string): Promise<{ success: boolean; message?: string }>{
  if (id === ADMIN_ROLE_ID || id === OPERATOR_ROLE_ID || id === VIEWER_ROLE_ID) {
    throw new Error("Deleting fixed roles (Administrator, Operator, Viewer) is not allowed.");
  }
  return { success: false, message: "Role not found or deletion not allowed." };
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
    

    