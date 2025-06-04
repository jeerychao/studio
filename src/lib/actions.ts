
"use server";

import { revalidatePath } from "next/cache";
import type { Subnet as AppSubnet, VLAN as AppVLAN, IPAddress as AppIPAddress, User as AppUser, Role as AppRole, AuditLog as AppAuditLog, IPAddressStatus as AppIPAddressStatusType, RoleName as AppRoleNameType, PermissionId as AppPermissionIdType, Permission as AppPermission } from '@/types';
import { PERMISSIONS } from '@/types';
import prisma from "./prisma";
import { parseAndValidateCIDR, getUsableIpCount, isIpInCidrRange, ipToNumber, numberToIp } from "./ip-utils";
import { ADMIN_ROLE_ID, OPERATOR_ROLE_ID, VIEWER_ROLE_ID, mockPermissions } from "./data";
import { Prisma } from '@prisma/client';

async function getAuditUserInfo(performingUserId?: string): Promise<{ userId?: string, username: string }> {
  if (performingUserId) {
    const user = await prisma.user.findUnique({ where: { id: performingUserId } });
    if (user) return { userId: user.id, username: user.username };
  }
  const adminUser = await prisma.user.findFirst({
    where: { role: { name: "Administrator" } },
  });
  if (adminUser) {
    return { userId: adminUser.id, username: adminUser.username };
  }
  return { userId: undefined, username: '系统' };
}


const DEFAULT_PAGE_SIZE = 10;

export interface PaginatedResponse<T> {
  data: T[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  pageSize: number;
}

export interface FetchParams {
  page?: number;
  pageSize?: number;
  subnetId?: string;
  status?: AppIPAddressStatusType | 'all';
}

// Define a specific interface for the return type of user detail fetching actions
// to ensure roleName is not optional and aligns with CurrentUserContextValue.
export interface FetchedUserDetails {
  id: string;
  username: string;
  email: string;
  roleId: string;
  roleName: AppRoleNameType; // Non-optional
  avatar?: string;
  permissions: AppPermissionIdType[];
  lastLogin?: string | undefined;
}

interface LoginPayload {
  email: string;
  password?: string;
}
interface LoginResponse {
  success: boolean;
  user?: FetchedUserDetails; 
  message?: string;
}

export async function loginAction(payload: LoginPayload): Promise<LoginResponse> {
  const { email, password } = payload;

  if (!email || !password) {
    return { success: false, message: "邮箱和密码是必需的。" };
  }

  const userFromDb = await prisma.user.findUnique({
    where: { email },
    include: { role: { include: { permissions: true } } },
  });

  if (!userFromDb) {
    return { success: false, message: "邮箱或密码无效。" };
  }

  if (userFromDb.password !== password) {
    return { success: false, message: "邮箱或密码无效。" };
  }

  if (!userFromDb.role || !userFromDb.role.name) {
      console.error(`User ${userFromDb.id} is missing role or role name in database during login.`);
      return { success: false, message: "用户角色信息不完整。" };
  }

  await prisma.user.update({
    where: { id: userFromDb.id },
    data: { lastLogin: new Date() },
  });

  const loggedInUser: FetchedUserDetails = {
    id: userFromDb.id,
    username: userFromDb.username,
    email: userFromDb.email,
    roleId: userFromDb.roleId,
    roleName: userFromDb.role.name as AppRoleNameType,
    avatar: userFromDb.avatar || '/images/avatars/default_avatar.png',
    permissions: userFromDb.role.permissions.map(p => p.id as AppPermissionIdType),
    lastLogin: userFromDb.lastLogin?.toISOString()
  };

  await prisma.auditLog.create({
    data: {
        userId: userFromDb.id,
        username: userFromDb.username,
        action: 'user_login',
        details: `用户 ${userFromDb.username} 成功登录。`
    }
  });

  return { success: true, user: loggedInUser };
}

export async function fetchCurrentUserDetailsAction(userId: string): Promise<FetchedUserDetails | null> {
  if (!userId) return null;

  const userFromDb = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: { include: { permissions: true } } },
  });

  if (!userFromDb) {
    return null;
  }

  if (!userFromDb.role || !userFromDb.role.name) {
      console.error(`User ${userId} is missing valid role or role name in database.`);
      return null;
  }

  return {
    id: userFromDb.id,
    username: userFromDb.username,
    email: userFromDb.email,
    roleId: userFromDb.roleId,
    roleName: userFromDb.role.name as AppRoleNameType,
    avatar: userFromDb.avatar || '/images/avatars/default_avatar.png',
    permissions: userFromDb.role.permissions.map(p => p.id as AppPermissionIdType),
    lastLogin: userFromDb.lastLogin?.toISOString() || undefined,
  };
}


export async function getSubnetsAction(params?: FetchParams): Promise<PaginatedResponse<AppSubnet>> {
  const page = params?.page || 1;
  const pageSize = params?.pageSize || DEFAULT_PAGE_SIZE;
  const skip = (page - 1) * pageSize;

  const whereClause = {};

  const totalCount = await prisma.subnet.count({ where: whereClause });
  const totalPages = Math.ceil(totalCount / pageSize);

  const subnetsFromDb = params?.page && params?.pageSize ?
    await prisma.subnet.findMany({
        where: whereClause,
        include: { vlan: { select: { vlanNumber: true } } },
        orderBy: { cidr: 'asc' },
        skip,
        take: pageSize,
    }) :
    await prisma.subnet.findMany({
        where: whereClause,
        include: { vlan: { select: { vlanNumber: true } } },
        orderBy: { cidr: 'asc' },
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
        where: { subnetId: subnet.id, status: "allocated" },
      });
      if (totalUsableIps > 0) {
        utilization = Math.round((allocatedIpsCount / totalUsableIps) * 100);
      }
    } else {
      console.error(`Invalid CIDR (${subnet.cidr}) found in DB for subnet ID ${subnet.id}. Calculations might be incorrect.`);
      networkAddress = "N/A (无效的 CIDR)";
      subnetMask = "N/A (无效的 CIDR)";
      ipRange = "N/A (无效的 CIDR)";
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
  return {
    data: appSubnets,
    totalCount: params?.page && params?.pageSize ? totalCount : appSubnets.length,
    currentPage: page,
    totalPages: params?.page && params?.pageSize ? totalPages : 1,
    pageSize
  };
}

export async function createSubnetAction(data: {
  cidr: string;
  vlanId?: string;
  description?: string;
}): Promise<AppSubnet> {
  const auditUser = await getAuditUserInfo();
  const parsedCidr = parseAndValidateCIDR(data.cidr);

  if (!parsedCidr) {
    throw new Error("无效的 CIDR 表示法格式。请使用 X.X.X.X/Y。");
  }
  const canonicalCidrToStore = `${parsedCidr.networkAddress}/${parsedCidr.prefix}`;
  if (data.cidr !== canonicalCidrToStore) {
    throw new Error(`无效的 CIDR：IP 地址部分不是网络地址。对于输入 ${data.cidr}，请使用 ${canonicalCidrToStore}。`);
  }

  const existingSubnetByCidr = await prisma.subnet.findUnique({ where: { cidr: canonicalCidrToStore } });
  if (existingSubnetByCidr) {
    throw new Error(`CIDR 为 ${canonicalCidrToStore} 的子网已存在。`);
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
    data: { userId: auditUser.userId, username: auditUser.username, action: 'create_subnet', details: `创建了子网 ${newSubnet.cidr}` }
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
    throw new Error("未找到要更新的子网。");
  }

  const updateData: Prisma.SubnetUpdateInput = {};
  const originalCidrForLog = subnetToUpdate.cidr;
  let newCanonicalCidrForLog = subnetToUpdate.cidr;

  if (data.cidr && data.cidr !== subnetToUpdate.cidr) {
    const newParsedCidrInfo = parseAndValidateCIDR(data.cidr);
    if (!newParsedCidrInfo) throw new Error("提供了无效的新 CIDR 表示法。");

    const newCanonicalCidr = `${newParsedCidrInfo.networkAddress}/${newParsedCidrInfo.prefix}`;
    newCanonicalCidrForLog = newCanonicalCidr;
    if (data.cidr !== newCanonicalCidr) {
      throw new Error(`无效的 CIDR 更新：不是网络地址。对于 ${data.cidr}，请使用 ${newCanonicalCidr}。`);
    }

    const conflictingSubnet = await prisma.subnet.findFirst({ where: { cidr: newCanonicalCidr, NOT: { id } } });
    if (conflictingSubnet) throw new Error(`CIDR 为 ${newCanonicalCidr} 的子网已存在。`);

    updateData.cidr = newCanonicalCidr;
    updateData.networkAddress = newParsedCidrInfo.networkAddress;
    updateData.subnetMask = newParsedCidrInfo.subnetMask;
    updateData.ipRange = newParsedCidrInfo.ipRange;

    const allocatedIpsInSubnet = await prisma.iPAddress.findMany({ where: { subnetId: id, status: "allocated" } });
    const ipsToDisassociateDetails: string[] = [];
    for (const ip of allocatedIpsInSubnet) {
      if (!isIpInCidrRange(ip.ipAddress, newParsedCidrInfo)) {
        await prisma.iPAddress.update({
          where: { id: ip.id },
          data: { status: "free", allocatedTo: null, subnetId: null, vlanId: null },
        });
        ipsToDisassociateDetails.push(`${ip.ipAddress} (原状态: ${ip.status})`);
      }
    }
    if (ipsToDisassociateDetails.length > 0) {
      await prisma.auditLog.create({
        data: { userId: auditUser.userId, username: auditUser.username, action: 'auto_handle_ip_on_subnet_resize', details: `子网 ${originalCidrForLog} 调整大小为 ${newCanonicalCidrForLog}。已解除关联的 IP：${ipsToDisassociateDetails.join('; ')}。` }
      });
    }
  }

  if (data.hasOwnProperty('vlanId')) {
    const newVlanId = data.vlanId === "" || data.vlanId === undefined ? null : data.vlanId;
    if (newVlanId) {
      const vlanExists = await prisma.vLAN.findUnique({ where: { id: newVlanId } });
      if (!vlanExists) {
        throw new Error(`VLAN with ID ${newVlanId} not found.`);
      }
      updateData.vlan = { connect: { id: newVlanId } };
    } else {
      if (subnetToUpdate.vlanId) { // Only disconnect if there was a VLAN associated
        updateData.vlan = { disconnect: true };
      }
    }
  }
  if (data.hasOwnProperty('description')) {
    updateData.description = data.description || null;
  }

  const updatedSubnet = await prisma.subnet.update({ where: { id }, data: updateData });
  await prisma.auditLog.create({
    data: { userId: auditUser.userId, username: auditUser.username, action: 'update_subnet', details: `更新了子网 ID ${id} (旧 CIDR: ${originalCidrForLog}, 新 CIDR: ${newCanonicalCidrForLog})` }
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
      data: { subnetId: null, status: "free", allocatedTo: null, vlanId: null }, // Also nullify vlanId if it was inherited from subnet
    });
    await prisma.auditLog.create({
      data: { userId: auditUser.userId, username: auditUser.username, action: 'auto_disassociate_ip_on_subnet_delete', details: `IP ${ip.ipAddress} 已从子网 ${subnetToDelete.cidr} 解除关联` }
    });
  }

  await prisma.subnet.delete({ where: { id } });
  await prisma.auditLog.create({
    data: { userId: auditUser.userId, username: auditUser.username, action: 'delete_subnet', details: `删除了子网 ${subnetToDelete.cidr}` }
  });

  revalidatePath("/subnets");
  revalidatePath("/ip-addresses");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function getVLANsAction(params?: FetchParams): Promise<PaginatedResponse<AppVLAN>> {
  const page = params?.page || 1;
  const pageSize = params?.pageSize || DEFAULT_PAGE_SIZE;
  const skip = (page - 1) * pageSize;

  const whereClause = {};

  const totalCount = await prisma.vLAN.count({ where: whereClause });
  const totalPages = Math.ceil(totalCount / pageSize);

  const vlansFromDb = params?.page && params?.pageSize ?
    await prisma.vLAN.findMany({
        where: whereClause,
        orderBy: { vlanNumber: 'asc' },
        skip,
        take: pageSize,
    }) :
    await prisma.vLAN.findMany({
        where: whereClause,
        orderBy: { vlanNumber: 'asc' }
    });

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
  return {
    data: appVlans,
    totalCount: params?.page && params?.pageSize ? totalCount : appVlans.length,
    currentPage: page,
    totalPages: params?.page && params?.pageSize ? totalPages : 1,
    pageSize
  };
}

export async function createVLANAction(data: Omit<AppVLAN, "id" | "subnetCount">): Promise<AppVLAN> {
  const auditUser = await getAuditUserInfo();

  if (isNaN(data.vlanNumber) || data.vlanNumber < 1 || data.vlanNumber > 4094) {
    throw new Error("VLAN 号码必须是 1 到 4094 之间的整数。");
  }
  const existingVLAN = await prisma.vLAN.findUnique({ where: { vlanNumber: data.vlanNumber } });
  if (existingVLAN) throw new Error(`VLAN ${data.vlanNumber} 已存在。`);


  const newVLAN = await prisma.vLAN.create({
    data: {
      vlanNumber: data.vlanNumber,
      description: data.description || null,
    },
  });
  await prisma.auditLog.create({
    data: { userId: auditUser.userId, username: auditUser.username, action: 'create_vlan', details: `创建了 VLAN ${newVLAN.vlanNumber}` }
  });

  revalidatePath("/vlans");
  revalidatePath("/subnets");
  revalidatePath("/ip-addresses");
  return { ...newVLAN, description: newVLAN.description || undefined, subnetCount: 0 };
}

export interface BatchVlanCreationResult {
  successCount: number;
  failureDetails: Array<{
    vlanNumberAttempted: number;
    error: string;
  }>;
}

export async function batchCreateVLANsAction(
  vlansToCreateInput: Array<{ vlanNumber: number; description?: string; }>
): Promise<BatchVlanCreationResult> {
  const auditUser = await getAuditUserInfo();
  let successCount = 0;
  const failureDetails: BatchVlanCreationResult['failureDetails'] = [];
  const createdVlanNumbersForAudit: number[] = [];

  for (const vlanInput of vlansToCreateInput) {
    try {
      if (isNaN(vlanInput.vlanNumber) || vlanInput.vlanNumber < 1 || vlanInput.vlanNumber > 4094) {
        throw new Error("VLAN 号码必须是 1 到 4094 之间的整数。");
      }
      const existingVLAN = await prisma.vLAN.findUnique({ where: { vlanNumber: vlanInput.vlanNumber } });
      if (existingVLAN) {
        throw new Error(`VLAN ${vlanInput.vlanNumber} 已存在。`);
      }

      await prisma.vLAN.create({
        data: {
          vlanNumber: vlanInput.vlanNumber,
          description: vlanInput.description || null,
        },
      });
      createdVlanNumbersForAudit.push(vlanInput.vlanNumber);
      successCount++;
    } catch (e: any) {
      failureDetails.push({
        vlanNumberAttempted: vlanInput.vlanNumber,
        error: e.message || "未知错误",
      });
    }
  }

  if (createdVlanNumbersForAudit.length > 0) {
     await prisma.auditLog.create({
        data: {
            userId: auditUser.userId,
            username: auditUser.username,
            action: 'batch_create_vlan',
            details: `批量创建了 ${createdVlanNumbersForAudit.length} 个 VLAN：${createdVlanNumbersForAudit.join(', ')}。失败：${failureDetails.length} 个。`
        }
    });
  } else if (failureDetails.length > 0 && vlansToCreateInput.length > 0) {
     await prisma.auditLog.create({
        data: {
            userId: auditUser.userId,
            username: auditUser.username,
            action: 'batch_create_vlan_failed',
            details: `批量创建 ${vlansToCreateInput.length} 个 VLAN 的尝试导致 ${failureDetails.length} 个失败。`
        }
    });
  }


  if (successCount > 0) {
    revalidatePath("/vlans");
    revalidatePath("/subnets");
    revalidatePath("/ip-addresses");
  }

  return { successCount, failureDetails };
}


export async function updateVLANAction(id: string, data: Partial<Omit<AppVLAN, "id" | "subnetCount">>): Promise<AppVLAN | null> {
  const auditUser = await getAuditUserInfo();
  const vlanToUpdate = await prisma.vLAN.findUnique({ where: { id } });
  if (!vlanToUpdate) return null;

  if (data.vlanNumber && data.vlanNumber !== vlanToUpdate.vlanNumber) {
    if (isNaN(data.vlanNumber) || data.vlanNumber < 1 || data.vlanNumber > 4094) {
        throw new Error("VLAN 号码必须是 1 到 4094 之间的整数。");
    }
    const existingVLAN = await prisma.vLAN.findUnique({ where: { vlanNumber: data.vlanNumber } });
    if (existingVLAN && existingVLAN.id !== id) {
      throw new Error(`已存在另一个 VLAN 号码为 ${data.vlanNumber} 的 VLAN。`);
    }
  }

  const updatePayload: Prisma.VLANUpdateInput = {};
  if (data.hasOwnProperty('vlanNumber') && data.vlanNumber !== undefined) updatePayload.vlanNumber = data.vlanNumber;
  if (data.hasOwnProperty('description')) updatePayload.description = data.description || null;

  const updatedVLAN = await prisma.vLAN.update({
    where: { id },
    data: updatePayload,
  });
  await prisma.auditLog.create({
    data: { userId: auditUser.userId, username: auditUser.username, action: 'update_vlan', details: `更新了 VLAN ${updatedVLAN.vlanNumber}` }
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
  if (!vlanToDelete) return { success: false, message: "未找到 VLAN。" };

  const subnetsUsingVlanCount = await prisma.subnet.count({ where: { vlanId: id } });
  if (subnetsUsingVlanCount > 0) {
    throw new Error(`无法删除 VLAN ${vlanToDelete.vlanNumber}。它已分配给 ${subnetsUsingVlanCount} 个子网。请先解除关联。`);
  }
  const ipsUsingVlanDirectlyCount = await prisma.iPAddress.count({
     where: { vlanId: id }
   });
   if (ipsUsingVlanDirectlyCount > 0) {
    throw new Error(`无法删除 VLAN ${vlanToDelete.vlanNumber}。它已直接分配给 ${ipsUsingVlanDirectlyCount} 个 IP 地址。请先移除直接分配。`);
  }

  await prisma.vLAN.delete({ where: { id } });
  await prisma.auditLog.create({
    data: { userId: auditUser.userId, username: auditUser.username, action: 'delete_vlan', details: `删除了 VLAN ${vlanToDelete.vlanNumber}` }
  });

  revalidatePath("/vlans");
  revalidatePath("/subnets");
  revalidatePath("/ip-addresses");
  return { success: true };
}

export async function getIPAddressesAction(params?: FetchParams): Promise<PaginatedResponse<AppIPAddress & { subnet?: { cidr: string; networkAddress: string; vlan?: { vlanNumber: number } | null } | null; vlan?: { vlanNumber: number } | null }>> {
  const page = params?.page || 1;
  const pageSize = params?.pageSize || DEFAULT_PAGE_SIZE;
  const skip = (page - 1) * pageSize;

  const whereClause: Prisma.IPAddressWhereInput = {};
  if (params?.subnetId) {
    whereClause.subnetId = params.subnetId;
  }
  if (params?.status && params.status !== 'all') {
    whereClause.status = params.status as AppIPAddressStatusType;
  }

  const totalCount = await prisma.iPAddress.count({ where: whereClause });
  const totalPages = Math.ceil(totalCount / pageSize);

  const ipsFromDb = params?.page && params?.pageSize ?
    await prisma.iPAddress.findMany({
        where: whereClause,
        include: {
            subnet: {
                select: {
                    cidr: true,
                    networkAddress: true,
                    vlan: { select: { vlanNumber: true } }
                }
            },
            vlan: { select: { vlanNumber: true }}
        },
        orderBy: { ipAddress: 'asc' },
        skip,
        take: pageSize,
    }) :
    await prisma.iPAddress.findMany({
        where: whereClause,
        include: {
            subnet: {
                select: {
                    cidr: true,
                    networkAddress: true,
                    vlan: { select: { vlanNumber: true } }
                }
            },
            vlan: { select: { vlanNumber: true }}
        },
        orderBy: { ipAddress: 'asc' }
    });

  const appIps = ipsFromDb.map(ip => ({
    ...ip,
    subnetId: ip.subnetId || undefined,
    vlanId: ip.vlanId || undefined,
    allocatedTo: ip.allocatedTo || undefined,
    description: ip.description || undefined,
    lastSeen: ip.lastSeen?.toISOString() || undefined,
    status: ip.status as AppIPAddressStatusType,
  }));
  return {
    data: appIps,
    totalCount: params?.page && params?.pageSize ? totalCount : appIps.length,
    currentPage: page,
    totalPages: params?.page && params?.pageSize ? totalPages : 1,
    pageSize
  };
}

export async function createIPAddressAction(data: Omit<AppIPAddress, "id">): Promise<AppIPAddress> {
  const auditUser = await getAuditUserInfo();
  const prismaStatus = data.status as string;

  const ipParts = data.ipAddress.split('.').map(Number);
  if (ipParts.some(part => isNaN(part) || part < 0 || part > 255) || ipParts.length !== 4) {
    throw new Error(`无效的 IP 地址格式: ${data.ipAddress}`);
  }


  if (!data.subnetId && (prismaStatus === 'allocated' || prismaStatus === 'reserved')) {
    throw new Error("对于“已分配”或“预留”且不在全局池中的 IP，子网 ID 是必需的。");
  }

  if (data.subnetId) {
    const targetSubnet = await prisma.subnet.findUnique({ where: { id: data.subnetId } });
    if (!targetSubnet) throw new Error("未找到目标子网。");
    const parsedTargetSubnetCidr = parseAndValidateCIDR(targetSubnet.cidr);
    if (!parsedTargetSubnetCidr) throw new Error(`目标子网 ${targetSubnet.cidr} 的 CIDR 无效。`);
    if (!isIpInCidrRange(data.ipAddress, parsedTargetSubnetCidr)) {
      throw new Error(`IP ${data.ipAddress} 不在子网 ${targetSubnet.cidr} 的范围内。`);
    }
    const existingIPInSubnet = await prisma.iPAddress.findFirst({
        where: { ipAddress: data.ipAddress, subnetId: data.subnetId }
    });
    if (existingIPInSubnet) throw new Error(`IP ${data.ipAddress} 已存在于子网 ${targetSubnet.networkAddress} 中。`);
  } else {
    const globallyExistingIP = await prisma.iPAddress.findFirst({ where: { ipAddress: data.ipAddress, subnetId: null } });
    if (globallyExistingIP) throw new Error(`IP ${data.ipAddress} 已存在于全局池中 (未分配给任何子网)。`);
  }

  if (data.vlanId && data.vlanId !== "") {
      const vlanExists = await prisma.vLAN.findUnique({ where: { id: data.vlanId }});
      if (!vlanExists) throw new Error("为 IP 地址选择的 VLAN 不存在。");
  }

  const newIP = await prisma.iPAddress.create({
    data: {
      ipAddress: data.ipAddress,
      status: prismaStatus,
      allocatedTo: data.allocatedTo || null,
      description: data.description || null,
      subnetId: data.subnetId || null,
      vlanId: data.vlanId === "" || data.vlanId === undefined ? null : data.vlanId,
      lastSeen: data.lastSeen ? new Date(data.lastSeen) : null,
    },
  });

  const subnetCidr = data.subnetId ? (await prisma.subnet.findUnique({where: {id: data.subnetId}}))?.cidr : null;
  const subnetInfo = subnetCidr ? ` 在子网 ${subnetCidr} 中` : ' 在全局池中';
  const vlanInfo = data.vlanId ? ` 使用 VLAN ${(await prisma.vLAN.findUnique({where: {id:data.vlanId}}))?.vlanNumber}`: '';

  await prisma.auditLog.create({
    data: { userId: auditUser.userId, username: auditUser.username, action: 'create_ip_address', details: `创建了 IP ${newIP.ipAddress}${subnetInfo}${vlanInfo}` }
  });

  revalidatePath("/ip-addresses");
  revalidatePath("/dashboard");
  revalidatePath("/subnets");
  return { ...newIP, subnetId: newIP.subnetId || undefined, vlanId: newIP.vlanId || undefined, allocatedTo: newIP.allocatedTo || undefined, description: newIP.description || undefined, lastSeen: newIP.lastSeen?.toISOString(), status: newIP.status as AppIPAddressStatusType };
}

export interface BatchIpCreationResult {
  successCount: number;
  failureDetails: Array<{
    ipAttempted: string;
    error: string;
  }>;
}

export async function batchCreateIPAddressesAction(payload: {
  startIp: string;
  endIp: string;
  subnetId: string;
  vlanId?: string;
  description?: string;
  status: AppIPAddressStatusType;
}): Promise<BatchIpCreationResult> {
  const auditUser = await getAuditUserInfo();
  let successCount = 0;
  const failureDetails: BatchIpCreationResult['failureDetails'] = [];
  const createdIpAddressesForAudit: string[] = [];

  const { startIp, endIp, subnetId, vlanId, description, status } = payload;

  const targetSubnet = await prisma.subnet.findUnique({ where: { id: subnetId } });
  if (!targetSubnet) {
    throw new Error("未找到批量创建的目标子网。");
  }
  const parsedTargetSubnetCidr = parseAndValidateCIDR(targetSubnet.cidr);
  if (!parsedTargetSubnetCidr) {
    throw new Error(`目标子网 ${targetSubnet.cidr} 的 CIDR 配置无效。`);
  }

  if (vlanId) {
    const vlanExists = await prisma.vLAN.findUnique({ where: { id: vlanId } });
    if (!vlanExists) {
      throw new Error("为批量 IP 创建选择的 VLAN 不存在。");
    }
  }

  let currentIpNum: number;
  let endIpNum: number;
  try {
    currentIpNum = ipToNumber(startIp);
    endIpNum = ipToNumber(endIp);
  } catch (e) {
     throw new Error("批量创建的起始或结束 IP 地址格式无效。");
  }


  if (currentIpNum > endIpNum) {
    throw new Error("批量创建的起始 IP 必须小于或等于结束 IP。");
  }

  for (; currentIpNum <= endIpNum; currentIpNum++) {
    const currentIpStr = numberToIp(currentIpNum);
    try {
      if (!isIpInCidrRange(currentIpStr, parsedTargetSubnetCidr)) {
        throw new Error(`IP ${currentIpStr} 不在子网 ${targetSubnet.cidr} 的范围内。`);
      }

      const existingIPInSubnet = await prisma.iPAddress.findFirst({
          where: { ipAddress: currentIpStr, subnetId: subnetId }
      });
      if (existingIPInSubnet) {
        throw new Error(`IP ${currentIpStr} 已存在于子网 ${targetSubnet.networkAddress} 中。`);
      }

      await prisma.iPAddress.create({
        data: {
          ipAddress: currentIpStr,
          status: status,
          allocatedTo: status === 'allocated' ? (description || '批量分配') : null,
          description: description || null,
          subnetId: subnetId,
          vlanId: vlanId || null,
        },
      });
      createdIpAddressesForAudit.push(currentIpStr);
      successCount++;
    } catch (e: any) {
      failureDetails.push({
        ipAttempted: currentIpStr,
        error: e.message || "未知错误",
      });
    }
  }

  if (createdIpAddressesForAudit.length > 0) {
     await prisma.auditLog.create({
        data: {
            userId: auditUser.userId,
            username: auditUser.username,
            action: 'batch_create_ip_address',
            details: `批量创建了 ${createdIpAddressesForAudit.length} 个 IP 到子网 ${targetSubnet.cidr}：${createdIpAddressesForAudit.join(', ')}。失败：${failureDetails.length} 个。`
        }
    });
  } else if (failureDetails.length > 0 && (endIpNum - ipToNumber(startIp) +1) > 0) {
     await prisma.auditLog.create({
        data: {
            userId: auditUser.userId,
            username: auditUser.username,
            action: 'batch_create_ip_address_failed',
            details: `在子网 ${targetSubnet.cidr} 中批量创建 ${endIpNum - ipToNumber(startIp) + 1} 个 IP 的尝试导致 ${failureDetails.length} 个失败。`
        }
    });
  }

  if (successCount > 0) {
    revalidatePath("/ip-addresses");
    revalidatePath("/dashboard");
    revalidatePath("/subnets");
  }

  return { successCount, failureDetails };
}


export async function updateIPAddressAction(id: string, data: Partial<Omit<AppIPAddress, "id">>): Promise<AppIPAddress | null> {
  const auditUser = await getAuditUserInfo();
  const ipToUpdate = await prisma.iPAddress.findUnique({ where: { id } });
  if (!ipToUpdate) return null;

  const updateData: Prisma.IPAddressUpdateInput = {};

  if (data.hasOwnProperty('ipAddress') && data.ipAddress !== undefined) {
    const ipParts = data.ipAddress.split('.').map(Number);
    if (ipParts.some(part => isNaN(part) || part < 0 || part > 255) || ipParts.length !== 4) {
        throw new Error(`无效的 IP 地址格式更新: ${data.ipAddress}`);
    }
    updateData.ipAddress = data.ipAddress;
  }
  if (data.hasOwnProperty('status') && data.status !== undefined) updateData.status = data.status as string;
  if (data.hasOwnProperty('allocatedTo')) updateData.allocatedTo = data.allocatedTo || null;
  if (data.hasOwnProperty('description')) updateData.description = data.description || null;
  if (data.hasOwnProperty('lastSeen')) updateData.lastSeen = data.lastSeen ? new Date(data.lastSeen) : null;

  if (data.hasOwnProperty('vlanId')) {
    const vlanIdToSet = data.vlanId === "" || data.vlanId === undefined ? null : data.vlanId;
    if (vlanIdToSet) {
      const vlanExists = await prisma.vLAN.findUnique({ where: { id: vlanIdToSet } });
      if (!vlanExists) {
        throw new Error("为 IP 选择的 VLAN 不存在。");
      }
      updateData.vlan = { connect: { id: vlanIdToSet } };
    } else {
      if (ipToUpdate.vlanId) { // Only disconnect if there was a VLAN associated
         updateData.vlan = { disconnect: true };
      }
    }
  }

  const newSubnetId = data.hasOwnProperty('subnetId') ? (data.subnetId || null) : ipToUpdate.subnetId;
  const finalIpAddress = data.ipAddress || ipToUpdate.ipAddress;
  const finalStatus = data.status ? data.status as string : ipToUpdate.status;

  if (newSubnetId) {
    const targetSubnet = await prisma.subnet.findUnique({ where: { id: newSubnetId } });
    if (!targetSubnet) throw new Error("未找到目标子网。");
    const parsedTargetSubnetCidr = parseAndValidateCIDR(targetSubnet.cidr);
    if (!parsedTargetSubnetCidr) throw new Error(`目标子网 ${targetSubnet.cidr} 的 CIDR 无效。`);
    if (!isIpInCidrRange(finalIpAddress, parsedTargetSubnetCidr)) {
      throw new Error(`IP ${finalIpAddress} 不在子网 ${targetSubnet.cidr} 的范围内。`);
    }
    if (finalIpAddress !== ipToUpdate.ipAddress || newSubnetId !== ipToUpdate.subnetId) {
        const conflictingIP = await prisma.iPAddress.findFirst({ where: { ipAddress: finalIpAddress, subnetId: newSubnetId, NOT: { id } } });
        if (conflictingIP) throw new Error(`IP ${finalIpAddress} 已存在于子网 ${targetSubnet.networkAddress} 中。`);
    }
    if (newSubnetId !== ipToUpdate.subnetId) {
      updateData.subnet = { connect: { id: newSubnetId } };
    }
  } else {
     if (finalStatus === 'allocated' || finalStatus === 'reserved') {
        throw new Error("对于“已分配”或“预留”的 IP，除非设置为空闲，否则子网 ID 是必需的。");
    }
    if (finalIpAddress !== ipToUpdate.ipAddress || newSubnetId !== ipToUpdate.subnetId) {
        const globallyConflictingIP = await prisma.iPAddress.findFirst({ where: { ipAddress: finalIpAddress, subnetId: null, NOT: { id } } });
        if (globallyConflictingIP) throw new Error(`IP ${finalIpAddress} 已存在于全局池中。`);
    }
    if (ipToUpdate.subnetId && newSubnetId === null) { // Disconnecting from a subnet
        updateData.subnet = { disconnect: true };
    }
  }


  const updatedIP = await prisma.iPAddress.update({ where: { id }, data: updateData });
  await prisma.auditLog.create({
    data: { userId: auditUser.userId, username: auditUser.username, action: 'update_ip_address', details: `更新了 IP ${updatedIP.ipAddress}` }
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
    data: { userId: auditUser.userId, username: auditUser.username, action: 'delete_ip_address', details: `删除了 IP ${ipToDelete.ipAddress}` }
  });

  revalidatePath("/ip-addresses");
  revalidatePath("/dashboard");
  revalidatePath("/subnets");
  return { success: true };
}

export async function getUsersAction(params?: FetchParams): Promise<PaginatedResponse<FetchedUserDetails>> {
  const page = params?.page || 1;
  const pageSize = params?.pageSize || DEFAULT_PAGE_SIZE;
  const skip = (page - 1) * pageSize;

  const whereClause = {};

  const totalCount = await prisma.user.count({ where: whereClause });
  const totalPages = Math.ceil(totalCount / pageSize);

  const usersFromDb = params?.page && params?.pageSize ?
    await prisma.user.findMany({
        where: whereClause,
        include: { role: { include: { permissions: true } } },
        orderBy: { username: 'asc'},
        skip,
        take: pageSize,
    }) :
    await prisma.user.findMany({
        where: whereClause,
        include: { role: { include: { permissions: true } } },
        orderBy: { username: 'asc'}
    });

  const appUsers: FetchedUserDetails[] = usersFromDb.map(user => {
    if (!user.role || !user.role.name) {
        console.error(`User ${user.id} has missing role or role name in getUsersAction. Assigning fallback.`);
        return {
            id: user.id,
            username: user.username,
            email: user.email,
            roleId: user.roleId,
            roleName: 'Viewer' as AppRoleNameType,
            avatar: user.avatar || '/images/avatars/default_avatar.png',
            lastLogin: user.lastLogin?.toISOString() || undefined,
            permissions: [],
        };
    }
    return {
        id: user.id,
        username: user.username,
        email: user.email,
        roleId: user.roleId,
        roleName: user.role.name as AppRoleNameType,
        avatar: user.avatar || '/images/avatars/default_avatar.png',
        lastLogin: user.lastLogin?.toISOString() || undefined,
        permissions: user.role.permissions.map(p => p.id as AppPermissionIdType),
    };
  });

  return {
    data: appUsers,
    totalCount: params?.page && params?.pageSize ? totalCount : appUsers.length,
    currentPage: page,
    totalPages: params?.page && params?.pageSize ? totalPages : 1,
    pageSize
  };
}

// Ensure createUserAction returns FetchedUserDetails
export async function createUserAction(data: Omit<AppUser, "id" | "avatar" | "lastLogin" | "roleName"> & { password: string, avatar?: string }): Promise<FetchedUserDetails> {
  const auditUser = await getAuditUserInfo();
  if (await prisma.user.findUnique({ where: { email: data.email } })) throw new Error(`邮箱 ${data.email} 已存在。`);
  if (await prisma.user.findUnique({ where: { username: data.username } })) throw new Error(`用户名 ${data.username} 已存在。`);

  const roleExists = await prisma.role.findUnique({ where: { id: data.roleId }, include: {permissions: true} });
  if (!roleExists || !roleExists.name) {
      throw new Error(`角色 ID ${data.roleId} 不存在或角色名称无效。`);
  }

  const newUser = await prisma.user.create({
    data: {
      username: data.username,
      email: data.email,
      password: data.password,
      roleId: data.roleId,
      avatar: data.avatar || '/images/avatars/default_avatar.png',
      lastLogin: new Date(),
    },
    include: { role: { include: { permissions: true } } }
  });
  await prisma.auditLog.create({
    data: { userId: auditUser.userId, username: auditUser.username, action: 'create_user', details: `创建了用户 ${newUser.username}` }
  });
  revalidatePath("/users");
  revalidatePath("/roles");

  if (!newUser.role || !newUser.role.name) {
    throw new Error("新创建的用户角色信息不完整。");
  }

  return {
    id: newUser.id,
    username: newUser.username,
    email: newUser.email,
    roleId: newUser.roleId,
    roleName: newUser.role.name as AppRoleNameType,
    avatar: newUser.avatar || '/images/avatars/default_avatar.png',
    lastLogin: newUser.lastLogin?.toISOString(),
    permissions: newUser.role.permissions.map(p => p.id as AppPermissionIdType)
  };
}

// Ensure updateUserAction returns FetchedUserDetails | null
export async function updateUserAction(id: string, data: Partial<Omit<AppUser, "id" | "roleName">> & { password?: string }): Promise<FetchedUserDetails | null> {
  const auditUser = await getAuditUserInfo(id);
  const userToUpdate = await prisma.user.findUnique({ where: { id } });
  if (!userToUpdate) return null;

  const updateData: Prisma.UserUpdateInput = {};
  if (data.hasOwnProperty('username') && data.username !== undefined) updateData.username = data.username;
  if (data.hasOwnProperty('email') && data.email !== undefined) updateData.email = data.email;

  if (data.hasOwnProperty('roleId') && data.roleId !== undefined) {
    const roleExists = await prisma.role.findUnique({ where: { id: data.roleId } });
    if (!roleExists || !roleExists.name) {
      throw new Error(`角色 ID ${data.roleId} 不存在或角色名称无效。`);
    }
    updateData.roleId = data.roleId;
  }

  if (data.hasOwnProperty('avatar')) {
    updateData.avatar = data.avatar || '/images/avatars/default_avatar.png';
  }

  if (data.password && data.password.length > 0) {
    updateData.password = data.password;
  }

  if (data.email && data.email !== userToUpdate.email) {
    if (await prisma.user.findFirst({ where: { email: data.email, NOT: { id } } })) throw new Error(`邮箱 ${data.email} 已被使用。`);
  }
  if (data.username && data.username !== userToUpdate.username) {
    if (await prisma.user.findFirst({ where: { username: data.username, NOT: { id } } })) throw new Error(`用户名 ${data.username} 已被使用。`);
  }

  const updatedUser = await prisma.user.update({
    where: { id },
    data: updateData,
    include: { role: { include: {permissions: true} } }
  });

  if (!updatedUser.role || !updatedUser.role.name) {
      console.error(`User ${updatedUser.id} updated but resulting role or role name is missing.`);
      throw new Error("更新用户后，角色信息无效。");
  }

  let auditDetails = `用户 ${updatedUser.username} 的详细信息已由 ${auditUser.username} 更新。`;
  if (data.password && data.password.length > 0) auditDetails = `用户 ${updatedUser.username} 的密码已由 ${auditUser.username} 更改。`;
  await prisma.auditLog.create({
    data: { userId: auditUser.userId, username: auditUser.username, action: 'update_user_details', details: auditDetails }
  });

  revalidatePath("/users");
  revalidatePath("/roles");
  return {
    id: updatedUser.id,
    username: updatedUser.username,
    email: updatedUser.email,
    roleId: updatedUser.roleId,
    roleName: updatedUser.role.name as AppRoleNameType,
    avatar: updatedUser.avatar || '/images/avatars/default_avatar.png',
    lastLogin: updatedUser.lastLogin?.toISOString(),
    permissions: updatedUser.role.permissions.map(p => p.id as AppPermissionIdType)
  };
}

interface UpdateOwnPasswordPayload { currentPassword?: string; newPassword?: string; }
export async function updateOwnPasswordAction(userId: string, payload: UpdateOwnPasswordPayload): Promise<{ success: boolean; message?: string }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { success: false, message: "未找到用户。" };

  if (payload.currentPassword && user.password && payload.currentPassword !== user.password) {
    return { success: false, message: "当前密码不匹配。" };
  }
  if (!payload.newPassword) return { success: false, message: "新密码不能为空。" };

  await prisma.user.update({
    where: { id: userId },
    data: { password: payload.newPassword },
  });
  await prisma.auditLog.create({
    data: { userId: user.id, username: user.username, action: 'update_own_password', details: `用户 ${user.username} 更改了他们的密码。` }
  });
  revalidatePath("/settings");
  return { success: true, message: "密码更新成功。" };
}

export async function deleteUserAction(id: string): Promise<{ success: boolean; message?: string }> {
  const auditUser = await getAuditUserInfo();
  const userToDelete = await prisma.user.findUnique({ where: { id }, include: {role: true} });
  if (!userToDelete) return { success: false, message: "未找到用户。" };
  if (!userToDelete.role || !userToDelete.role.name) {
    throw new Error("无法删除用户：关联的角色信息无效。");
  }

  if (userToDelete.role.name === "Administrator") {
    const adminCount = await prisma.user.count({ where: { role: { name: "Administrator" } } });
    if (adminCount <= 1) throw new Error("无法删除最后一个管理员用户。");
  }

  await prisma.auditLog.updateMany({
    where: { userId: id },
    data: { userId: null }
  });

  await prisma.user.delete({ where: { id } });
  await prisma.auditLog.create({
    data: { userId: auditUser.userId, username: auditUser.username, action: 'delete_user', details: `删除了用户 ${userToDelete.username}` }
  });
  revalidatePath("/users");
  revalidatePath("/roles");
  return { success: true };
}

export async function getRolesAction(params?: FetchParams): Promise<PaginatedResponse<AppRole>> {
  const page = params?.page || 1;
  const pageSize = params?.pageSize || DEFAULT_PAGE_SIZE;
  const skip = (page - 1) * pageSize;

  const whereClause = {};

  const totalCount = await prisma.role.count({ where: whereClause });
  const totalPages = Math.ceil(totalCount / pageSize);

  const rolesFromDb = params?.page && params?.pageSize ?
    await prisma.role.findMany({
        where: whereClause,
        include: {
        _count: { select: { users: true } },
        permissions: { orderBy: { id: 'asc' } },
        },
        orderBy: { name: 'asc'},
        skip,
        take: pageSize,
    }) :
    await prisma.role.findMany({
        where: whereClause,
        include: {
        _count: { select: { users: true } },
        permissions: { orderBy: { id: 'asc' } },
        },
        orderBy: { name: 'asc'}
    });

  const appRoles = rolesFromDb.map(role => {
    if (!role.name) {
        console.error(`Role ${role.id} has a missing name in getRolesAction.`);
        return {
            id: role.id,
            name: 'Viewer' as AppRoleNameType,
            description: role.description || undefined,
            userCount: role._count.users,
            permissions: role.permissions.map(p => p.id as AppPermissionIdType),
        };
    }
    return {
        id: role.id,
        name: role.name as AppRoleNameType,
        description: role.description || undefined,
        userCount: role._count.users,
        permissions: role.permissions.map(p => p.id as AppPermissionIdType),
    };
  });

  return {
    data: appRoles,
    totalCount: params?.page && params?.pageSize ? totalCount : appRoles.length,
    currentPage: page,
    totalPages: params?.page && params?.pageSize ? totalPages : 1,
    pageSize
  };
}

export async function updateRoleAction(id: string, data: Partial<Omit<AppRole, "id" | "userCount" | "name">> & { permissions?: AppPermissionIdType[] }): Promise<AppRole | null> {
  const auditUser = await getAuditUserInfo();
  const roleToUpdate = await prisma.role.findUnique({ where: { id } });
  if (!roleToUpdate || !roleToUpdate.name) return null;

  const updateData: Prisma.RoleUpdateInput = {};
  if (data.hasOwnProperty('description')) updateData.description = data.description || null;

  if (data.permissions) {
    const prismaPermissions = data.permissions.map(appPermId => ({ id: appPermId as string }));
    updateData.permissions = { set: prismaPermissions };
  }

  const updatedRole = await prisma.role.update({
    where: { id },
    data: updateData,
    include: { permissions: true, _count: { select: { users: true } } }
  });

  if (!updatedRole.name) {
      console.error(`Role ${updatedRole.id} updated but resulting name is missing.`);
      throw new Error("更新角色后，角色名称信息无效。");
  }

  let details = `更新了角色 ${updatedRole.name}。`;
  if (data.hasOwnProperty('description')) details += ` 描述 ${data.description ? '已更改' : '已清除/未更改'}。`;
  if (data.permissions) details += ` 权限 ${data.permissions.length > 0 ? '已更改' : '已清除/未更改'}。`;

  await prisma.auditLog.create({
    data: { userId: auditUser.userId, username: auditUser.username, action: 'update_role', details: details }
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
  throw new Error("不允许创建新角色。角色是固定的 (Administrator, Operator, Viewer)。");
}
export async function deleteRoleAction(id: string): Promise<{ success: boolean; message?: string }>{
  const role = await prisma.role.findUnique({where: {id}});
   if (role && (role.name === "Administrator" || role.name === "Operator" || role.name === "Viewer" )) {
     throw new Error("不允许删除固定角色 (Administrator, Operator, Viewer)。");
   }
  throw new Error("未找到角色或不允许删除。");
}

export async function getAuditLogsAction(params?: FetchParams): Promise<PaginatedResponse<AppAuditLog>> {
  const page = params?.page || 1;
  const pageSize = params?.pageSize || DEFAULT_PAGE_SIZE;
  const skip = (page - 1) * pageSize;

  const whereClause = {};

  const totalCount = await prisma.auditLog.count({ where: whereClause });
  const totalPages = Math.ceil(totalCount / pageSize);

  const logsFromDb = params?.page && params?.pageSize ?
    await prisma.auditLog.findMany({
        where: whereClause,
        orderBy: { timestamp: 'desc' },
        include: { user: { select: { username: true } } },
        skip,
        take: pageSize,
    }) :
    await prisma.auditLog.findMany({
        where: whereClause,
        orderBy: { timestamp: 'desc' },
        include: { user: { select: { username: true } } }
    });

  const appLogs = logsFromDb.map(log => ({
    id: log.id,
    userId: log.userId || "system",
    username: log.username || (log.user ? log.user.username : (log.userId ? '未知用户' : '系统')),
    action: log.action,
    timestamp: log.timestamp.toISOString(),
    details: log.details || undefined,
  }));
  return {
    data: appLogs,
    totalCount: params?.page && params?.pageSize ? totalCount : appLogs.length,
    currentPage: page,
    totalPages: params?.page && params?.pageSize ? totalPages : 1,
    pageSize
  };
}

export async function deleteAuditLogAction(id: string): Promise<{ success: boolean; message?: string }> {
  const auditUser = await getAuditUserInfo();
  const logToDelete = await prisma.auditLog.findUnique({ where: { id } });

  if (!logToDelete) {
    return { success: false, message: "未找到审计日志条目。" };
  }

  await prisma.auditLog.delete({ where: { id } });

  await prisma.auditLog.create({
    data: {
      userId: auditUser.userId,
      username: auditUser.username,
      action: 'delete_audit_log_entry',
      details: `删除了审计日志条目 ID ${id} (操作: ${logToDelete.action}, 用户: ${logToDelete.username || 'N/A'}, 时间戳: ${logToDelete.timestamp.toISOString()})`
    }
  });

  revalidatePath("/audit-logs");
  return { success: true };
}

export async function getAllPermissionsAction(): Promise<AppPermission[]> {
    const permissionsFromDb = await prisma.permission.findMany({ orderBy: { id: 'asc' }});
    return permissionsFromDb.map(p => ({
        ...p,
        id: p.id as AppPermissionIdType,
        description: p.description || undefined,
    }));
}
    
