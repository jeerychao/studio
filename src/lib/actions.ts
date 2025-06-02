
"use server";

import { revalidatePath } from "next/cache";
import type { Subnet as AppSubnet, VLAN as AppVLAN, IPAddress as AppIPAddress, User as AppUser, Role as AppRole, AuditLog as AppAuditLog, IPAddressStatus as AppIPAddressStatusType, RoleName as AppRoleNameType, PermissionId as AppPermissionIdType, Permission as AppPermission } from '@/types';
import { PERMISSIONS } from '@/types';
import { prisma } from "./prisma";
import { parseAndValidateCIDR, getUsableIpCount, isIpInCidrRange } from "./ip-utils";
import { ADMIN_ROLE_ID, OPERATOR_ROLE_ID, VIEWER_ROLE_ID, mockPermissions } from "./data";
import { Prisma } from '@prisma/client';

// Helper to get current user for audit purposes.
async function getAuditUserInfo(): Promise<{ userId?: string, username: string }> {
  const adminUser = await prisma.user.findFirst({
    where: { role: { name: "Administrator" } }, // Role.name is String
  });
  if (adminUser) {
    return { userId: adminUser.id, username: adminUser.username };
  }
  return { userId: undefined, username: 'System' };
}

// --- Subnet Actions ---
export async function getSubnetsAction(): Promise<AppSubnet[]> {
  const subnetsFromDb = await prisma.subnet.findMany({
    include: {
      vlan: true,
    },
    orderBy: { cidr: 'asc' }
  });

  const appSubnets: AppSubnet[] = await Promise.all(subnetsFromDb.map(async (subnet) => {
    const parsedCidr = parseAndValidateCIDR(subnet.cidr);
    let utilization = 0;
    let networkAddress = subnet.networkAddress;
    let subnetMask = subnet.subnetMask;
    let ipRange = subnet.ipRange;

    if (parsedCidr) {
      const totalUsableIps = getUsableIpCount(parsedCidr.prefix);
      const allocatedIpsCount = await prisma.iPAddress.count({
        where: {
          subnetId: subnet.id,
          status: "allocated", // status is String
        },
      });
      if (totalUsableIps > 0) {
        utilization = Math.round((allocatedIpsCount / totalUsableIps) * 100);
      }
    } else {
      console.error(`Invalid CIDR (${subnet.cidr}) found in DB for subnet ID ${subnet.id}. Calculations might be incorrect.`);
      networkAddress = "N/A (Invalid CIDR)";
      subnetMask = "N/A (Invalid CIDR)";
      ipRange = "N/A (Invalid CIDR)";
      utilization = 0;
    }
    return {
      ...subnet,
      networkAddress,
      subnetMask,
      ipRange: ipRange || undefined,
      vlanId: subnet.vlanId || undefined,
      description: subnet.description || undefined,
      utilization: utilization,
    };
  }));
  return appSubnets;
}

export async function createSubnetAction(data: {
  cidr: string;
  vlanId?: string;
  description?: string;
}): Promise<AppSubnet> {
  const auditUser = await getAuditUserInfo();
  const parsedCidr = parseAndValidateCIDR(data.cidr);

  if (!parsedCidr) {
    throw new Error("Invalid CIDR notation format. Please use X.X.X.X/Y.");
  }
  
  const canonicalCidrToStore = `${parsedCidr.networkAddress}/${parsedCidr.prefix}`;
  if (data.cidr !== canonicalCidrToStore) {
    throw new Error(`Invalid CIDR: The IP address part is not the network address. For input ${data.cidr}, please use ${canonicalCidrToStore}.`);
  }

  const existingSubnetByCidr = await prisma.subnet.findUnique({ where: { cidr: canonicalCidrToStore } });
  if (existingSubnetByCidr) {
    throw new Error(`Subnet with CIDR ${canonicalCidrToStore} already exists.`);
  }
  
  const newSubnet = await prisma.subnet.create({
    data: {
      cidr: canonicalCidrToStore,
      networkAddress: parsedCidr.networkAddress,
      subnetMask: parsedCidr.subnetMask,
      ipRange: parsedCidr.ipRange,
      vlanId: data.vlanId === "" || data.vlanId === undefined ? null : data.vlanId,
      description: data.description || null,
    },
  });

  await prisma.auditLog.create({
    data: { userId: auditUser.userId, username: auditUser.username, action: 'create_subnet', details: `Created subnet ${newSubnet.cidr}` }
  });

  revalidatePath("/subnets");
  revalidatePath("/dashboard");
  revalidatePath("/ip-addresses");
  return { ...newSubnet, vlanId: newSubnet.vlanId || undefined, description: newSubnet.description || undefined, utilization: 0, ipRange: newSubnet.ipRange || undefined };
}

export async function updateSubnetAction(id: string, data: Partial<Omit<AppSubnet, "id" | "utilization">> & { cidr?: string }): Promise<AppSubnet | null> {
  const auditUser = await getAuditUserInfo();
  const subnetToUpdate = await prisma.subnet.findUnique({ where: { id } });

  if (!subnetToUpdate) {
    throw new Error("Subnet not found for update.");
  }

  const updateData: Prisma.SubnetUpdateInput = {};
  const originalCidrForLog = subnetToUpdate.cidr;
  let newCanonicalCidrForLog = subnetToUpdate.cidr;

  if (data.cidr && data.cidr !== subnetToUpdate.cidr) {
    const newParsedCidrInfo = parseAndValidateCIDR(data.cidr);
    if (!newParsedCidrInfo) throw new Error("Invalid new CIDR notation provided.");
    
    const newCanonicalCidr = `${newParsedCidrInfo.networkAddress}/${newParsedCidrInfo.prefix}`;
    newCanonicalCidrForLog = newCanonicalCidr;
    if (data.cidr !== newCanonicalCidr) {
      throw new Error(`Invalid CIDR for update: Not the network address. For ${data.cidr}, use ${newCanonicalCidr}.`);
    }
    
    const conflictingSubnet = await prisma.subnet.findFirst({ where: { cidr: newCanonicalCidr, NOT: { id } } });
    if (conflictingSubnet) throw new Error(`Subnet with CIDR ${newCanonicalCidr} already exists.`);

    updateData.cidr = newCanonicalCidr;
    updateData.networkAddress = newParsedCidrInfo.networkAddress;
    updateData.subnetMask = newParsedCidrInfo.subnetMask;
    updateData.ipRange = newParsedCidrInfo.ipRange;

    const allocatedIpsInSubnet = await prisma.iPAddress.findMany({ where: { subnetId: id, status: "allocated" } }); // status is String
    const ipsToDisassociateDetails: string[] = [];
    for (const ip of allocatedIpsInSubnet) {
      if (!isIpInCidrRange(ip.ipAddress, newParsedCidrInfo)) {
        await prisma.iPAddress.update({
          where: { id: ip.id },
          data: { status: "free", allocatedTo: null, subnetId: null, vlanId: null }, // status is String
        });
        ipsToDisassociateDetails.push(`${ip.ipAddress} (was ${ip.status})`);
      }
    }
    if (ipsToDisassociateDetails.length > 0) {
      await prisma.auditLog.create({
        data: { userId: auditUser.userId, username: auditUser.username, action: 'auto_handle_ip_on_subnet_resize', details: `Subnet ${originalCidrForLog} resized to ${newCanonicalCidr}. Disassociated IPs: ${ipsToDisassociateDetails.join('; ')}.` }
      });
    }
  }

  if (data.hasOwnProperty('vlanId')) {
    updateData.vlanId = data.vlanId === "" || data.vlanId === undefined ? null : data.vlanId;
  }
  if (data.hasOwnProperty('description')) {
    updateData.description = data.description || null;
  }

  const updatedSubnet = await prisma.subnet.update({ where: { id }, data: updateData });
  await prisma.auditLog.create({
    data: { userId: auditUser.userId, username: auditUser.username, action: 'update_subnet', details: `Updated subnet ID ${id} (Old CIDR: ${originalCidrForLog}, New CIDR: ${newCanonicalCidrForLog})` }
  });

  revalidatePath("/subnets");
  revalidatePath("/dashboard");
  revalidatePath("/ip-addresses");
  const parsedCidr = parseAndValidateCIDR(updatedSubnet.cidr);
  let utilization = 0;
  if(parsedCidr) {
      const totalUsableIps = getUsableIpCount(parsedCidr.prefix);
      const allocatedIpsCount = await prisma.iPAddress.count({ where: { subnetId: updatedSubnet.id, status: "allocated" }});
      if(totalUsableIps > 0) utilization = Math.round((allocatedIpsCount / totalUsableIps) * 100);
  }
  return { ...updatedSubnet, vlanId: updatedSubnet.vlanId || undefined, description: updatedSubnet.description || undefined, ipRange: updatedSubnet.ipRange || undefined, utilization };
}

export async function deleteSubnetAction(id: string): Promise<{ success: boolean }> {
  const auditUser = await getAuditUserInfo();
  const subnetToDelete = await prisma.subnet.findUnique({ where: { id } });

  if (!subnetToDelete) return { success: false };

  const ipsInSubnet = await prisma.iPAddress.findMany({ where: { subnetId: id } });
  for (const ip of ipsInSubnet) {
    await prisma.iPAddress.update({
      where: { id: ip.id },
      data: { subnetId: null, status: "free", allocatedTo: null, vlanId: null }, // status is String
    });
    await prisma.auditLog.create({
      data: { userId: auditUser.userId, username: auditUser.username, action: 'auto_disassociate_ip_on_subnet_delete', details: `IP ${ip.ipAddress} disassociated from subnet ${subnetToDelete.cidr}` }
    });
  }

  await prisma.subnet.delete({ where: { id } });
  await prisma.auditLog.create({
    data: { userId: auditUser.userId, username: auditUser.username, action: 'delete_subnet', details: `Deleted subnet ${subnetToDelete.cidr}` }
  });

  revalidatePath("/subnets");
  revalidatePath("/ip-addresses");
  revalidatePath("/dashboard");
  return { success: true };
}

// --- VLAN Actions ---
export async function getVLANsAction(): Promise<AppVLAN[]> {
  const vlansFromDb = await prisma.vLAN.findMany({ orderBy: { vlanNumber: 'asc' }});
  const appVlans: AppVLAN[] = await Promise.all(vlansFromDb.map(async (vlan) => {
    const subnetCount = await prisma.subnet.count({ where: { vlanId: vlan.id } });
     const directIpCount = await prisma.iPAddress.count({
      where: {
        vlanId: vlan.id,
        OR: [
          { subnetId: null },
          { subnet: { vlanId: { not: vlan.id } } }
        ]
      }
    });
    return {
      ...vlan,
      description: vlan.description || undefined,
      subnetCount: subnetCount + directIpCount,
    };
  }));
  return appVlans;
}

export async function createVLANAction(data: Omit<AppVLAN, "id" | "subnetCount">): Promise<AppVLAN> {
  const auditUser = await getAuditUserInfo();
  const existingVLAN = await prisma.vLAN.findUnique({ where: { vlanNumber: data.vlanNumber } });
  if (existingVLAN) throw new Error(`VLAN ${data.vlanNumber} already exists.`);

  const newVLAN = await prisma.vLAN.create({
    data: {
      vlanNumber: data.vlanNumber,
      description: data.description || null,
    },
  });
  await prisma.auditLog.create({
    data: { userId: auditUser.userId, username: auditUser.username, action: 'create_vlan', details: `Created VLAN ${newVLAN.vlanNumber}` }
  });

  revalidatePath("/vlans");
  revalidatePath("/subnets");
  revalidatePath("/ip-addresses");
  return { ...newVLAN, description: newVLAN.description || undefined, subnetCount: 0 };
}

export async function updateVLANAction(id: string, data: Partial<Omit<AppVLAN, "id" | "subnetCount">>): Promise<AppVLAN | null> {
  const auditUser = await getAuditUserInfo();
  const vlanToUpdate = await prisma.vLAN.findUnique({ where: { id } });
  if (!vlanToUpdate) return null;

  if (data.vlanNumber && data.vlanNumber !== vlanToUpdate.vlanNumber) {
    const existingVLAN = await prisma.vLAN.findUnique({ where: { vlanNumber: data.vlanNumber } });
    if (existingVLAN && existingVLAN.id !== id) {
      throw new Error(`Another VLAN with number ${data.vlanNumber} already exists.`);
    }
  }
  
  const updatePayload: Prisma.VLANUpdateInput = {};
  if (data.hasOwnProperty('vlanNumber')) updatePayload.vlanNumber = data.vlanNumber;
  if (data.hasOwnProperty('description')) updatePayload.description = data.description || null;

  const updatedVLAN = await prisma.vLAN.update({
    where: { id },
    data: updatePayload,
  });
  await prisma.auditLog.create({
    data: { userId: auditUser.userId, username: auditUser.username, action: 'update_vlan', details: `Updated VLAN ${updatedVLAN.vlanNumber}` }
  });

  revalidatePath("/vlans");
  revalidatePath("/subnets");
  revalidatePath("/ip-addresses");
  const subnetCount = await prisma.subnet.count({ where: { vlanId: updatedVLAN.id } });
  const directIpCount = await prisma.iPAddress.count({ where: { vlanId: updatedVLAN.id, OR: [{ subnetId: null },{ subnet: { vlanId: { not: updatedVLAN.id }}}]}});
  return { ...updatedVLAN, description: updatedVLAN.description || undefined, subnetCount: subnetCount + directIpCount };
}

export async function deleteVLANAction(id: string): Promise<{ success: boolean; message?: string }> {
  const auditUser = await getAuditUserInfo();
  const vlanToDelete = await prisma.vLAN.findUnique({ where: { id } });
  if (!vlanToDelete) return { success: false, message: "VLAN not found." };

  const subnetsUsingVlanCount = await prisma.subnet.count({ where: { vlanId: id } });
  if (subnetsUsingVlanCount > 0) {
    throw new Error(`Cannot delete VLAN ${vlanToDelete.vlanNumber}. It's assigned to ${subnetsUsingVlanCount} subnet(s). Disassociate first.`);
  }
  const ipsUsingVlanDirectlyCount = await prisma.iPAddress.count({ where: { vlanId: id } });
   if (ipsUsingVlanDirectlyCount > 0) {
    throw new Error(`Cannot delete VLAN ${vlanToDelete.vlanNumber}. It's directly assigned to ${ipsUsingVlanDirectlyCount} IP address(es). Remove direct assignments first.`);
  }

  await prisma.vLAN.delete({ where: { id } });
  await prisma.auditLog.create({
    data: { userId: auditUser.userId, username: auditUser.username, action: 'delete_vlan', details: `Deleted VLAN ${vlanToDelete.vlanNumber}` }
  });

  revalidatePath("/vlans");
  revalidatePath("/subnets");
  revalidatePath("/ip-addresses");
  return { success: true };
}

// --- IP Address Actions ---
export async function getIPAddressesAction(subnetIdParam?: string): Promise<AppIPAddress[]> {
  const ipsFromDb = await prisma.iPAddress.findMany({
    where: subnetIdParam ? { subnetId: subnetIdParam } : {},
    include: { subnet: { select: { cidr: true, networkAddress: true } }, vlan: { select: { vlanNumber: true }} },
    orderBy: { ipAddress: 'asc' }
  });

  return ipsFromDb.map(ip => ({
    ...ip,
    subnetId: ip.subnetId || undefined,
    vlanId: ip.vlanId || undefined,
    allocatedTo: ip.allocatedTo || undefined,
    description: ip.description || undefined,
    lastSeen: ip.lastSeen?.toISOString() || undefined,
    status: ip.status as AppIPAddressStatusType, // Prisma 'status' is String, cast to AppType
  }));
}

export async function createIPAddressAction(data: Omit<AppIPAddress, "id">): Promise<AppIPAddress> {
  const auditUser = await getAuditUserInfo();
  const prismaStatus = data.status as string; // AppIPAddressStatusType to string

  if (!data.subnetId && (prismaStatus === 'allocated' || prismaStatus === 'reserved')) {
    throw new Error("Subnet ID is required for 'allocated' or 'reserved' IP not in global pool.");
  }

  if (data.subnetId) {
    const targetSubnet = await prisma.subnet.findUnique({ where: { id: data.subnetId } });
    if (!targetSubnet) throw new Error("Target subnet not found.");
    const parsedTargetSubnetCidr = parseAndValidateCIDR(targetSubnet.cidr);
    if (!parsedTargetSubnetCidr) throw new Error("Target subnet has invalid CIDR.");
    if (!isIpInCidrRange(data.ipAddress, parsedTargetSubnetCidr)) {
      throw new Error(`IP ${data.ipAddress} is not in subnet ${targetSubnet.cidr}.`);
    }
    const existingIPInSubnet = await prisma.iPAddress.findUnique({ where: { ipAddress_subnetId: { ipAddress: data.ipAddress, subnetId: data.subnetId } } });
    if (existingIPInSubnet) throw new Error(`IP ${data.ipAddress} already exists in subnet ${targetSubnet.networkAddress}.`);
  } else {
    const globallyExistingIP = await prisma.iPAddress.findFirst({ where: { ipAddress: data.ipAddress, subnetId: null } });
    if (globallyExistingIP) throw new Error(`IP ${data.ipAddress} already exists in global pool.`);
  }

  if (data.vlanId && data.vlanId !== "") {
      const vlanExists = await prisma.vLAN.findUnique({ where: { id: data.vlanId }});
      if (!vlanExists) throw new Error("Selected VLAN for IP address does not exist.");
  }

  const newIP = await prisma.iPAddress.create({
    data: {
      ipAddress: data.ipAddress,
      status: prismaStatus, // status is String
      allocatedTo: data.allocatedTo || null,
      description: data.description || null,
      subnetId: data.subnetId || null,
      vlanId: data.vlanId === "" || data.vlanId === undefined ? null : data.vlanId,
      lastSeen: data.lastSeen ? new Date(data.lastSeen) : null,
    },
  });
  
  const subnetCidr = data.subnetId ? (await prisma.subnet.findUnique({where: {id: data.subnetId}}))?.cidr : null;
  const subnetInfo = subnetCidr ? ` in subnet ${subnetCidr}` : ' in global pool';
  const vlanInfo = data.vlanId ? ` with VLAN ${(await prisma.vLAN.findUnique({where: {id:data.vlanId}}))?.vlanNumber}`: '';

  await prisma.auditLog.create({
    data: { userId: auditUser.userId, username: auditUser.username, action: 'create_ip_address', details: `Created IP ${newIP.ipAddress}${subnetInfo}${vlanInfo}` }
  });
  
  revalidatePath("/ip-addresses");
  revalidatePath("/dashboard");
  revalidatePath("/subnets");
  return { ...newIP, subnetId: newIP.subnetId || undefined, vlanId: newIP.vlanId || undefined, allocatedTo: newIP.allocatedTo || undefined, description: newIP.description || undefined, lastSeen: newIP.lastSeen?.toISOString(), status: newIP.status as AppIPAddressStatusType };
}

export async function updateIPAddressAction(id: string, data: Partial<Omit<AppIPAddress, "id">>): Promise<AppIPAddress | null> {
  const auditUser = await getAuditUserInfo();
  const ipToUpdate = await prisma.iPAddress.findUnique({ where: { id } });
  if (!ipToUpdate) return null;

  const updateData: Prisma.IPAddressUpdateInput = {};

  if (data.hasOwnProperty('ipAddress')) updateData.ipAddress = data.ipAddress;
  if (data.hasOwnProperty('status')) updateData.status = data.status as string; // AppIPAddressStatusType to string
  if (data.hasOwnProperty('allocatedTo')) updateData.allocatedTo = data.allocatedTo || null;
  if (data.hasOwnProperty('description')) updateData.description = data.description || null;
  if (data.hasOwnProperty('lastSeen')) updateData.lastSeen = data.lastSeen ? new Date(data.lastSeen) : null;
  if (data.hasOwnProperty('vlanId')) {
    if (data.vlanId && data.vlanId !== "" && !(await prisma.vLAN.findUnique({where: {id: data.vlanId}}))) {
        throw new Error("Selected VLAN for IP does not exist.");
    }
    updateData.vlanId = data.vlanId === "" || data.vlanId === undefined ? null : data.vlanId;
  }

  const newSubnetId = data.hasOwnProperty('subnetId') ? (data.subnetId || null) : ipToUpdate.subnetId;
  const finalIpAddress = data.ipAddress || ipToUpdate.ipAddress;
  const finalStatus = data.status ? data.status as string : ipToUpdate.status; // status is String

  if (newSubnetId) {
    const targetSubnet = await prisma.subnet.findUnique({ where: { id: newSubnetId } });
    if (!targetSubnet) throw new Error("Target subnet not found.");
    const parsedTargetSubnetCidr = parseAndValidateCIDR(targetSubnet.cidr);
    if (!parsedTargetSubnetCidr) throw new Error("Target subnet has invalid CIDR.");
    if (!isIpInCidrRange(finalIpAddress, parsedTargetSubnetCidr)) {
      throw new Error(`IP ${finalIpAddress} is not in subnet ${targetSubnet.cidr}.`);
    }
    const conflictingIP = await prisma.iPAddress.findFirst({ where: { ipAddress: finalIpAddress, subnetId: newSubnetId, NOT: { id } } });
    if (conflictingIP) throw new Error(`IP ${finalIpAddress} already exists in subnet ${targetSubnet.networkAddress}.`);
  } else {
     if (finalStatus === 'allocated' || finalStatus === 'reserved') { // status is String
        throw new Error("Subnet ID is required for 'allocated' or 'reserved' IP unless setting to 'free'.");
    }
    const globallyConflictingIP = await prisma.iPAddress.findFirst({ where: { ipAddress: finalIpAddress, subnetId: null, NOT: { id } } });
    if (globallyConflictingIP) throw new Error(`IP ${finalIpAddress} already exists in global pool.`);
  }
  updateData.subnetId = newSubnetId;

  const updatedIP = await prisma.iPAddress.update({ where: { id }, data: updateData });
  await prisma.auditLog.create({
    data: { userId: auditUser.userId, username: auditUser.username, action: 'update_ip_address', details: `Updated IP ${updatedIP.ipAddress}` }
  });

  revalidatePath("/ip-addresses");
  revalidatePath("/dashboard");
  revalidatePath("/subnets");
  return { ...updatedIP, subnetId: updatedIP.subnetId || undefined, vlanId: updatedIP.vlanId || undefined, allocatedTo: updatedIP.allocatedTo || undefined, description: updatedIP.description || undefined, lastSeen: updatedIP.lastSeen?.toISOString(), status: updatedIP.status as AppIPAddressStatusType };
}

export async function deleteIPAddressAction(id: string): Promise<{ success: boolean }> {
  const auditUser = await getAuditUserInfo();
  const ipToDelete = await prisma.iPAddress.findUnique({ where: { id } });
  if (!ipToDelete) return { success: false };

  await prisma.iPAddress.delete({ where: { id } });
  await prisma.auditLog.create({
    data: { userId: auditUser.userId, username: auditUser.username, action: 'delete_ip_address', details: `Deleted IP ${ipToDelete.ipAddress}` }
  });

  revalidatePath("/ip-addresses");
  revalidatePath("/dashboard");
  revalidatePath("/subnets");
  return { success: true };
}

// --- User Actions ---
export async function getUsersAction(): Promise<AppUser[]> {
  const usersFromDb = await prisma.user.findMany({
    include: { role: true },
    orderBy: { username: 'asc'}
  });
  return usersFromDb.map(user => ({
    id: user.id,
    username: user.username,
    email: user.email,
    roleId: user.roleId,
    roleName: user.role.name as AppRoleNameType, // Role.name is String, cast to AppType
    avatar: user.avatar || undefined,
    lastLogin: user.lastLogin?.toISOString() || undefined,
  }));
}

export async function createUserAction(data: Omit<AppUser, "id" | "avatar" | "lastLogin" | "roleName"> & { password?: string }): Promise<AppUser> {
  const auditUser = await getAuditUserInfo();
  if (await prisma.user.findUnique({ where: { email: data.email } })) throw new Error(`Email ${data.email} already exists.`);
  if (await prisma.user.findUnique({ where: { username: data.username } })) throw new Error(`Username ${data.username} already exists.`);
  if (!(await prisma.role.findUnique({ where: { id: data.roleId } }))) throw new Error(`Role ID ${data.roleId} does not exist.`);

  const newUser = await prisma.user.create({
    data: {
      username: data.username,
      email: data.email,
      password: data.password || "default_password_please_change",
      roleId: data.roleId,
      avatar: `https://placehold.co/100x100.png?text=${data.username.substring(0,1).toUpperCase()}`,
      lastLogin: new Date(),
    },
    include: { role: true }
  });
  await prisma.auditLog.create({
    data: { userId: auditUser.userId, username: auditUser.username, action: 'create_user', details: `Created user ${newUser.username}${data.password ? ' (password set)' : ''}` }
  });
  revalidatePath("/users");
  revalidatePath("/roles");
  return { ...newUser, roleName: newUser.role.name as AppRoleNameType, avatar: newUser.avatar || undefined, lastLogin: newUser.lastLogin?.toISOString() };
}

export async function updateUserAction(id: string, data: Partial<Omit<AppUser, "id" | "roleName">> & { password?: string }): Promise<AppUser | null> {
  const auditUser = await getAuditUserInfo();
  const userToUpdate = await prisma.user.findUnique({ where: { id } });
  if (!userToUpdate) return null;

  const updateData: Prisma.UserUpdateInput = {};
  if (data.hasOwnProperty('username')) updateData.username = data.username;
  if (data.hasOwnProperty('email')) updateData.email = data.email;
  if (data.hasOwnProperty('roleId')) updateData.roleId = data.roleId;
  if (data.hasOwnProperty('avatar')) updateData.avatar = data.avatar;
  if (data.hasOwnProperty('lastLogin')) updateData.lastLogin = data.lastLogin ? new Date(data.lastLogin) : undefined;
  
  if (data.password && data.password.length > 0) {
    updateData.password = data.password;
  }

  if (data.email && data.email !== userToUpdate.email) {
    if (await prisma.user.findFirst({ where: { email: data.email, NOT: { id } } })) throw new Error(`Email ${data.email} already used.`);
  }
  if (data.username && data.username !== userToUpdate.username) {
    if (await prisma.user.findFirst({ where: { username: data.username, NOT: { id } } })) throw new Error(`Username ${data.username} already used.`);
  }
  if (data.roleId && !(await prisma.role.findUnique({ where: { id: data.roleId } }))) throw new Error(`Role ID ${data.roleId} does not exist.`);

  const updatedUser = await prisma.user.update({
    where: { id },
    data: updateData,
    include: { role: true }
  });
  
  let auditDetails = `Updated user ${updatedUser.username}`;
  if (data.password && data.password.length > 0) auditDetails += ' (password changed)';
  await prisma.auditLog.create({
    data: { userId: auditUser.userId, username: auditUser.username, action: 'update_user', details: auditDetails }
  });
  
  revalidatePath("/users");
  revalidatePath("/roles");
  return { ...updatedUser, roleName: updatedUser.role.name as AppRoleNameType, avatar: updatedUser.avatar || undefined, lastLogin: updatedUser.lastLogin?.toISOString() };
}

interface UpdateOwnPasswordPayload { currentPassword?: string; newPassword?: string; }
export async function updateOwnPasswordAction(userId: string, payload: UpdateOwnPasswordPayload): Promise<{ success: boolean; message?: string }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { success: false, message: "User not found." };

  if (payload.currentPassword && user.password && payload.currentPassword !== user.password) {
    return { success: false, message: "Current password does not match." };
  }
  if (!payload.newPassword) return { success: false, message: "New password cannot be empty." };

  await prisma.user.update({
    where: { id: userId },
    data: { password: payload.newPassword },
  });
  await prisma.auditLog.create({
    data: { userId: user.id, username: user.username, action: 'update_own_password', details: `User ${user.username} changed their password.` }
  });
  revalidatePath("/settings");
  return { success: true, message: "Password updated successfully." };
}

export async function deleteUserAction(id: string): Promise<{ success: boolean; message?: string }> {
  const auditUser = await getAuditUserInfo();
  const userToDelete = await prisma.user.findUnique({ where: { id }, include: {role: true} });
  if (!userToDelete) return { success: false, message: "User not found." };

  if (userToDelete.role.name === "Administrator") { // Role.name is String
    const adminCount = await prisma.user.count({ where: { role: { name: "Administrator" } } }); // Role.name is String
    if (adminCount <= 1) throw new Error("Cannot delete the last Administrator user.");
  }

  await prisma.auditLog.updateMany({
    where: { userId: id },
    data: { userId: null } 
  });

  await prisma.user.delete({ where: { id } });
  await prisma.auditLog.create({
    data: { userId: auditUser.userId, username: auditUser.username, action: 'delete_user', details: `Deleted user ${userToDelete.username}` }
  });
  revalidatePath("/users");
  revalidatePath("/roles");
  return { success: true };
}

// --- Role Actions ---
export async function getRolesAction(): Promise<AppRole[]> {
  const rolesFromDb = await prisma.role.findMany({
    include: {
      _count: { select: { users: true } },
      permissions: { orderBy: { id: 'asc' } },
    },
     orderBy: { name: 'asc'}
  });
  return rolesFromDb.map(role => ({
    id: role.id,
    name: role.name as AppRoleNameType, // Role.name is String, cast to AppType
    description: role.description || undefined,
    userCount: role._count.users,
    permissions: role.permissions.map(p => p.id as AppPermissionIdType), // Permission.id is String, cast to AppType
  }));
}

export async function updateRoleAction(id: string, data: Partial<Omit<AppRole, "id" | "userCount" | "name">> & { permissions?: AppPermissionIdType[] }): Promise<AppRole | null> {
  const auditUser = await getAuditUserInfo();
  const roleToUpdate = await prisma.role.findUnique({ where: { id } });
  if (!roleToUpdate) return null;
  
  const updateData: Prisma.RoleUpdateInput = {};
  if (data.hasOwnProperty('description')) updateData.description = data.description || null;
  
  if (data.permissions) {
    const prismaPermissions = data.permissions.map(appPermId => ({ id: appPermId as string })); // AppPermissionId to string
    updateData.permissions = { set: prismaPermissions };
  }
  
  const updatedRole = await prisma.role.update({
    where: { id },
    data: updateData,
    include: { permissions: true, _count: { select: { users: true } } }
  });
  
  let details = `Updated role ${updatedRole.name}.`;
  if (data.hasOwnProperty('description')) details += ` Description ${data.description ? 'changed' : 'cleared/unchanged'}.`;
  if (data.permissions) details += ` Permissions ${data.permissions.length > 0 ? 'changed' : 'cleared/unchanged'}.`;

  await prisma.auditLog.create({
    data: { userId: auditUser.userId, username: auditUser.username, action: 'update_role', details }
  });
  revalidatePath("/roles");
  revalidatePath("/users");
  return {
    id: updatedRole.id,
    name: updatedRole.name as AppRoleNameType,
    description: updatedRole.description || undefined,
    userCount: updatedRole._count.users,
    permissions: updatedRole.permissions.map(p => p.id as AppPermissionIdType),
  };
}

export async function createRoleAction(data: any): Promise<AppRole> {
  throw new Error("Creating new roles is not allowed. Roles are fixed (Administrator, Operator, Viewer).");
}
export async function deleteRoleAction(id: string): Promise<{ success: boolean; message?: string }>{
  const role = await prisma.role.findUnique({where: {id}});
   if (role && (role.name === "Administrator" || role.name === "Operator" || role.name === "Viewer" )) { // Role.name is String
     throw new Error("Deleting fixed roles (Administrator, Operator, Viewer) is not allowed.");
   }
  throw new Error("Role not found or deletion not allowed.");
}

// --- Audit Log Actions ---
export async function getAuditLogsAction(): Promise<AppAuditLog[]> {
  const logsFromDb = await prisma.auditLog.findMany({
    orderBy: { timestamp: 'desc' },
    include: { user: { select: { username: true } } }
  });
  return logsFromDb.map(log => ({
    id: log.id,
    userId: log.userId || "system",
    username: log.username || (log.user ? log.user.username : (log.userId ? 'Unknown User' : 'System')),
    action: log.action,
    timestamp: log.timestamp.toISOString(),
    details: log.details || undefined,
  }));
}

// --- Permission Actions ---
export async function getAllPermissionsAction(): Promise<AppPermission[]> {
    const permissionsFromDb = await prisma.permission.findMany({ orderBy: { id: 'asc' }});
    return permissionsFromDb.map(p => ({
        ...p,
        id: p.id as AppPermissionIdType, // Permission.id is String, cast to AppType
        description: p.description || undefined,
    }));
}
