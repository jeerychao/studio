
"use server";

import { revalidatePath } from "next/cache";
import type { Subnet as AppSubnet, VLAN as AppVLAN, IPAddress as AppIPAddress, User as AppUser, Role as AppRole, AuditLog as AppAuditLog, IPAddressStatus as AppIPAddressStatusType, RoleName as AppRoleNameType, PermissionId as AppPermissionIdType, Permission as AppPermission } from '@/types';
import { PERMISSIONS } from '@/types';
import prisma from "./prisma";
import {
  getSubnetPropertiesFromCidr, // For parsing properties from a CIDR string
  getUsableIpCount,
  isIpInCidrRange,
  ipToNumber,
  numberToIp,
  // getPrefixFromCidr // Not strictly needed if getSubnetPropertiesFromCidr provides prefix
} from "./ip-utils";
// validateCidrInput is for validating user input and throws specific errors
import { validateCIDR as validateCidrInput } from "./error-utils";
import { logger } from './logger';
import { AppError, ValidationError, ResourceError, NotFoundError, AuthError, type ActionErrorResponse } from './errors';
import { createActionErrorResponse } from './error-utils';
import { ADMIN_ROLE_ID, OPERATOR_ROLE_ID, VIEWER_ROLE_ID, mockPermissions } from "./data";
import { Prisma } from '@prisma/client';

// Standardized Action Response
export interface ActionResponse<TData = unknown> {
  success: boolean;
  data?: TData;
  error?: ActionErrorResponse;
}

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

export interface FetchParams {
  page?: number;
  pageSize?: number;
  subnetId?: string;
  status?: AppIPAddressStatusType | 'all';
}

export interface FetchedUserDetails {
  id: string;
  username: string;
  email: string;
  roleId: string;
  roleName: AppRoleNameType;
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
  try {
    const userFromDb = await prisma.user.findUnique({
      where: { email },
      include: { role: { include: { permissions: true } } },
    });

    if (!userFromDb) {
      logger.error('Login attempt failed: User not found', new AuthError(`User with email ${email} not found.`), { email });
      return { success: false, message: "邮箱或密码无效。" };
    }

    if (userFromDb.password !== password) {
      logger.warn('Login attempt failed: Invalid password', new AuthError('Invalid password attempt.'), { userId: userFromDb.id });
      return { success: false, message: "邮箱或密码无效。" };
    }

    if (!userFromDb.role || !userFromDb.role.name) {
        logger.error(`User ${userFromDb.id} is missing role or role name in database during login.`, new AppError('User role data incomplete'), { userId: userFromDb.id });
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
  } catch (error) {
    logger.error('Login action unexpected error', error as Error, { email });
    return { success: false, message: "登录过程中发生意外错误。" };
  }
}

export async function fetchCurrentUserDetailsAction(userId: string): Promise<FetchedUserDetails | null> {
  if (!userId) return null;
  const userFromDb = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: { include: { permissions: true } } },
  });
  if (!userFromDb) return null;
  if (!userFromDb.role || !userFromDb.role.name) {
      logger.error(`User ${userId} is missing valid role or role name in database.`, new AppError("User role data invalid"), { userId });
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
  const actionName = 'getSubnetsAction';
  try {
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
      // Use getSubnetPropertiesFromCidr for parsing CIDR from DB to get prefix for utilization
      const subnetProperties = getSubnetPropertiesFromCidr(subnet.cidr);
      let utilization = 0;
      let networkAddress = subnet.networkAddress;
      let subnetMask = subnet.subnetMask;
      let ipRange = subnet.ipRange;

      if (subnetProperties) {
        const totalUsableIps = getUsableIpCount(subnetProperties.prefix);
        const allocatedIpsCount = await prisma.iPAddress.count({
          where: { subnetId: subnet.id, status: "allocated" },
        });
        if (totalUsableIps > 0) {
          utilization = Math.round((allocatedIpsCount / totalUsableIps) * 100);
        }
        // Keep existing db values for address, mask, range, but ensure they are consistent if desired.
        // For now, assume DB values are source of truth unless parsing fails.
        networkAddress = subnetProperties.networkAddress; // Or use subnet.networkAddress
        subnetMask = subnetProperties.subnetMask;     // Or use subnet.subnetMask
        ipRange = subnetProperties.ipRange;           // Or use subnet.ipRange
      } else {
        logger.error(`[${actionName}] Invalid CIDR format in DB: ${subnet.cidr} for subnet ID ${subnet.id}. Cannot calculate properties accurately.`, undefined, { subnetId: subnet.id, cidr: subnet.cidr });
        networkAddress = "N/A (DB CIDR格式错误)";
        subnetMask = "N/A (DB CIDR格式错误)";
        ipRange = "N/A (DB CIDR格式错误)";
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
  } catch (error: unknown) {
    logger.error(`Error in ${actionName}`, error as Error, undefined, actionName);
    if (error instanceof AppError) throw error; // Re-throw known AppErrors
    // For other errors, wrap them to ensure a consistent error structure if this action is awaited directly
    throw new AppError("获取子网数据时发生服务器错误。", 500, "GET_SUBNETS_FAILED", "无法加载子网数据，请稍后重试。");
  }
}


export async function createSubnetAction(
  data: { cidr: string; vlanId?: string; description?: string; },
  performingUserId?: string
): Promise<ActionResponse<AppSubnet>> {
  const actionName = 'createSubnetAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);

    validateCidrInput(data.cidr, 'cidr'); // This will throw ValidationError if CIDR is not network address or bad format

    const subnetProperties = getSubnetPropertiesFromCidr(data.cidr);
    if (!subnetProperties) {
      // This should not be reached if validateCidrInput is robust.
      // But as a safeguard for getSubnetPropertiesFromCidr's own parsing:
      throw new AppError(
        'Failed to parse CIDR properties even after initial validation.',
        500,
        'CIDR_PARSE_UNEXPECTED_ERROR',
        '无法解析有效的 CIDR 属性，这通常表示一个内部错误。'
      );
    }
    // By this point, data.cidr is confirmed to be a valid network address CIDR.
    const canonicalCidrToStore = data.cidr; // or subnetProperties.networkAddress + '/' + subnetProperties.prefix;

    const existingSubnet = await prisma.subnet.findUnique({
      where: { cidr: canonicalCidrToStore }
    });
    if (existingSubnet) {
      throw new ResourceError(
        `子网 ${canonicalCidrToStore} 已存在。`,
        'SUBNET_ALREADY_EXISTS',
        `子网 ${canonicalCidrToStore} 已存在，无法重复创建。`
      );
    }

    if (data.vlanId && data.vlanId !== "") {
        const vlanExists = await prisma.vLAN.findUnique({ where: { id: data.vlanId }});
        if (!vlanExists) {
            throw new NotFoundError(`VLAN ID: ${data.vlanId}`, `选择的 VLAN 不存在。`);
        }
    }

    const newSubnetPrisma = await prisma.subnet.create({
      data: {
        cidr: canonicalCidrToStore,
        networkAddress: subnetProperties.networkAddress,
        subnetMask: subnetProperties.subnetMask,
        ipRange: subnetProperties.ipRange,
        vlanId: data.vlanId === "" || data.vlanId === undefined ? null : data.vlanId,
        description: data.description || null,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: auditUser.userId,
        username: auditUser.username,
        action: 'create_subnet',
        details: `创建了子网 ${newSubnetPrisma.cidr}`
      }
    });

    revalidatePath("/subnets");
    revalidatePath("/dashboard");
    revalidatePath("/ip-addresses");

    const appSubnet: AppSubnet = {
        ...newSubnetPrisma,
        vlanId: newSubnetPrisma.vlanId || undefined,
        description: newSubnetPrisma.description || undefined,
        utilization: 0,
        ipRange: newSubnetPrisma.ipRange || undefined
    };

    logger.info('子网创建成功', { subnetId: appSubnet.id, cidr: appSubnet.cidr }, actionName);
    return { success: true, data: appSubnet };

  } catch (error: unknown) {
    return { success: false, error: createActionErrorResponse(error, actionName) };
  }
}

export async function updateSubnetAction(id: string, data: Partial<Omit<AppSubnet, "id" | "utilization">> & { cidr?: string }, performingUserId?: string): Promise<ActionResponse<AppSubnet>> {
  const actionName = 'updateSubnetAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    const subnetToUpdate = await prisma.subnet.findUnique({ where: { id } });

    if (!subnetToUpdate) {
      throw new NotFoundError(`子网 ID: ${id}`, `要更新的子网未找到。`);
    }

    const updateData: Prisma.SubnetUpdateInput = {};
    const originalCidrForLog = subnetToUpdate.cidr;
    let newCanonicalCidrForLog = subnetToUpdate.cidr;

    if (data.cidr && data.cidr !== subnetToUpdate.cidr) {
      validateCidrInput(data.cidr, 'cidr');
      const newSubnetProperties = getSubnetPropertiesFromCidr(data.cidr);
      if (!newSubnetProperties) {
        throw new AppError('Failed to parse new CIDR properties after validation.', 500, 'CIDR_PARSE_UNEXPECTED_ERROR', '无法解析新的有效 CIDR 属性。');
      }

      // data.cidr should be the network address form due to validateCidrInput
      const newCanonicalCidr = data.cidr;
      newCanonicalCidrForLog = newCanonicalCidr;

      const conflictingSubnet = await prisma.subnet.findFirst({ where: { cidr: newCanonicalCidr, NOT: { id } } });
      if (conflictingSubnet) {
        throw new ResourceError(`子网 ${newCanonicalCidr} 已存在。`, 'SUBNET_ALREADY_EXISTS', `新的 CIDR ${newCanonicalCidr} 与现有子网冲突。`);
      }

      updateData.cidr = newCanonicalCidr;
      updateData.networkAddress = newSubnetProperties.networkAddress;
      updateData.subnetMask = newSubnetProperties.subnetMask;
      updateData.ipRange = newSubnetProperties.ipRange;

      const allocatedIpsInSubnet = await prisma.iPAddress.findMany({ where: { subnetId: id, status: "allocated" } });
      const ipsToDisassociateDetails: string[] = [];
      for (const ip of allocatedIpsInSubnet) {
        if (!isIpInCidrRange(ip.ipAddress, newSubnetProperties)) {
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
      const newVlanId = data.vlanId === "" || data.vlanId === undefined || data.vlanId === null ? null : data.vlanId;
      if (newVlanId) {
          const vlanExists = await prisma.vLAN.findUnique({ where: { id: newVlanId }});
          if (!vlanExists) {
              throw new NotFoundError(`VLAN ID: ${newVlanId}`, `选择的 VLAN (ID: ${newVlanId}) 不存在。`);
          }
      }
      updateData.vlanId = newVlanId;
    }
    if (data.hasOwnProperty('description')) {
      updateData.description = data.description === undefined ? null : data.description;
    }

    if (Object.keys(updateData).length === 0) {
      logger.info('No changes detected for subnet update.', { subnetId: id, inputData: data }, actionName);
       const currentAppSubnet: AppSubnet = {
        ...subnetToUpdate,
        vlanId: subnetToUpdate.vlanId || undefined,
        description: subnetToUpdate.description || undefined,
        ipRange: subnetToUpdate.ipRange || undefined,
        utilization: await calculateSubnetUtilization(id)
      };
      return { success: true, data: currentAppSubnet };
    }

    const updatedSubnetPrisma = await prisma.subnet.update({ where: { id }, data: updateData });
    await prisma.auditLog.create({
      data: { userId: auditUser.userId, username: auditUser.username, action: 'update_subnet', details: `更新了子网 ID ${id} (旧 CIDR: ${originalCidrForLog}, 新 CIDR: ${newCanonicalCidrForLog})` }
    });

    revalidatePath("/subnets");
    revalidatePath("/dashboard");
    revalidatePath("/ip-addresses");

    const utilization = await calculateSubnetUtilization(updatedSubnetPrisma.id);
    const appSubnet: AppSubnet = {
        ...updatedSubnetPrisma,
        vlanId: updatedSubnetPrisma.vlanId || undefined,
        description: updatedSubnetPrisma.description || undefined,
        ipRange: updatedSubnetPrisma.ipRange || undefined,
        utilization
    };
    logger.info('子网更新成功', { subnetId: appSubnet.id }, actionName);
    return { success: true, data: appSubnet };

  } catch (error: unknown) {
    return { success: false, error: createActionErrorResponse(error, actionName) };
  }
}

async function calculateSubnetUtilization(subnetId: string): Promise<number> {
    const subnet = await prisma.subnet.findUnique({ where: { id: subnetId } });
    if (!subnet) return 0;
    const subnetProperties = getSubnetPropertiesFromCidr(subnet.cidr); // Use the property parser
    if (!subnetProperties) return 0;
    const totalUsableIps = getUsableIpCount(subnetProperties.prefix);
    if (totalUsableIps === 0) return 0;
    const allocatedIpsCount = await prisma.iPAddress.count({ where: { subnetId: subnetId, status: "allocated" }});
    return Math.round((allocatedIpsCount / totalUsableIps) * 100);
}

export async function deleteSubnetAction(id: string, performingUserId?: string): Promise<ActionResponse> {
  const actionName = 'deleteSubnetAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    const subnetToDelete = await prisma.subnet.findUnique({ where: { id } });

    if (!subnetToDelete) {
      throw new NotFoundError(`子网 ID: ${id}`, `要删除的子网未找到。`);
    }

    const allocatedIpsCount = await prisma.iPAddress.count({ where: { subnetId: id, status: 'allocated' } });
    if (allocatedIpsCount > 0) {
      throw new ResourceError(
        `子网 ${subnetToDelete.cidr} 中仍有 ${allocatedIpsCount} 个已分配的 IP 地址。`,
        'SUBNET_HAS_ALLOCATED_IPS',
        `无法删除子网 ${subnetToDelete.cidr}，因为它仍包含已分配的 IP 地址。请先将这些 IP 释放或移至其他子网。`
      );
    }

    const ipsInSubnet = await prisma.iPAddress.findMany({ where: { subnetId: id } });
    for (const ip of ipsInSubnet) {
      await prisma.iPAddress.update({
        where: { id: ip.id },
        data: { subnetId: null, status: "free", allocatedTo: null, vlanId: null },
      });
      await prisma.auditLog.create({
        data: { userId: auditUser.userId, username: auditUser.username, action: 'auto_disassociate_ip_on_subnet_delete', details: `IP ${ip.ipAddress} 已从子网 ${subnetToDelete.cidr} 解除关联，因为子网被删除。` }
      });
    }

    await prisma.subnet.delete({ where: { id } });
    await prisma.auditLog.create({
      data: { userId: auditUser.userId, username: auditUser.username, action: 'delete_subnet', details: `删除了子网 ${subnetToDelete.cidr}` }
    });

    revalidatePath("/subnets");
    revalidatePath("/ip-addresses");
    revalidatePath("/dashboard");
    logger.info('子网删除成功', { subnetId: id, cidr: subnetToDelete.cidr }, actionName);
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: createActionErrorResponse(error, actionName) };
  }
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

export async function createVLANAction(data: Omit<AppVLAN, "id" | "subnetCount">, performingUserId?: string): Promise<ActionResponse<AppVLAN>> {
  const actionName = 'createVLANAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    if (isNaN(data.vlanNumber) || data.vlanNumber < 1 || data.vlanNumber > 4094) {
      throw new ValidationError("VLAN 号码必须是 1 到 4094 之间的整数。", 'vlanNumber', data.vlanNumber);
    }
    const existingVLAN = await prisma.vLAN.findUnique({ where: { vlanNumber: data.vlanNumber } });
    if (existingVLAN) {
      throw new ResourceError(`VLAN ${data.vlanNumber} 已存在。`, 'VLAN_EXISTS', `VLAN ${data.vlanNumber} 已存在，无法重复创建。`);
    }

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
    const appVlan: AppVLAN = { ...newVLAN, description: newVLAN.description || undefined, subnetCount: 0 };
    logger.info('VLAN 创建成功', { vlanId: appVlan.id, vlanNumber: appVlan.vlanNumber }, actionName);
    return { success: true, data: appVlan };
  } catch (error: unknown) {
    return { success: false, error: createActionErrorResponse(error, actionName) };
  }
}

export interface BatchVlanCreationResult {
  successCount: number;
  failureDetails: Array<{
    vlanNumberAttempted: number;
    error: string;
  }>;
}
export async function batchCreateVLANsAction(
  vlansToCreateInput: Array<{ vlanNumber: number; description?: string; }>,
  performingUserId?: string
): Promise<BatchVlanCreationResult> {
  const auditUser = await getAuditUserInfo(performingUserId);
  let successCount = 0;
  const failureDetails: BatchVlanCreationResult['failureDetails'] = [];
  const createdVlanNumbersForAudit: number[] = [];

  for (const vlanInput of vlansToCreateInput) {
    try {
      if (isNaN(vlanInput.vlanNumber) || vlanInput.vlanNumber < 1 || vlanInput.vlanNumber > 4094) {
        throw new ValidationError("VLAN 号码必须是 1 到 4094 之间的整数。", 'vlanNumber', vlanInput.vlanNumber);
      }
      const existingVLAN = await prisma.vLAN.findUnique({ where: { vlanNumber: vlanInput.vlanNumber } });
      if (existingVLAN) {
        throw new ResourceError(`VLAN ${vlanInput.vlanNumber} 已存在。`, 'VLAN_EXISTS', `VLAN ${vlanInput.vlanNumber} 已存在。`);
      }
      await prisma.vLAN.create({
        data: {
          vlanNumber: vlanInput.vlanNumber,
          description: vlanInput.description || null,
        },
      });
      createdVlanNumbersForAudit.push(vlanInput.vlanNumber);
      successCount++;
    } catch (e: unknown) {
      const errorResponse = createActionErrorResponse(e, 'batchCreateVLANsAction_single');
      failureDetails.push({ vlanNumberAttempted: vlanInput.vlanNumber, error: errorResponse.userMessage });
      logger.warn('批量创建 VLAN 失败 - 单个条目', e as Error, { vlanInput, errorContext: errorResponse });
    }
  }

  if (createdVlanNumbersForAudit.length > 0) {
     await prisma.auditLog.create({
        data: { userId: auditUser.userId, username: auditUser.username, action: 'batch_create_vlan', details: `批量创建了 ${createdVlanNumbersForAudit.length} 个 VLAN：${createdVlanNumbersForAudit.join(', ')}。失败：${failureDetails.length} 个。` }
    });
  }
  if (successCount > 0) { revalidatePath("/vlans"); }
  return { successCount, failureDetails };
}

export async function updateVLANAction(id: string, data: Partial<Omit<AppVLAN, "id" | "subnetCount">>, performingUserId?: string): Promise<ActionResponse<AppVLAN>> {
  const actionName = 'updateVLANAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    const vlanToUpdate = await prisma.vLAN.findUnique({ where: { id } });
    if (!vlanToUpdate) {
      throw new NotFoundError(`VLAN ID: ${id}`, `要更新的 VLAN 未找到。`);
    }

    const updatePayload: Prisma.VLANUpdateInput = {};
    if (data.hasOwnProperty('vlanNumber') && data.vlanNumber !== undefined) {
      if (isNaN(data.vlanNumber) || data.vlanNumber < 1 || data.vlanNumber > 4094) {
          throw new ValidationError("VLAN 号码必须是 1 到 4094 之间的整数。", 'vlanNumber', data.vlanNumber);
      }
      if (data.vlanNumber !== vlanToUpdate.vlanNumber) {
        const existingVLAN = await prisma.vLAN.findUnique({ where: { vlanNumber: data.vlanNumber } });
        if (existingVLAN && existingVLAN.id !== id) {
          throw new ResourceError(`已存在另一个 VLAN 号码为 ${data.vlanNumber} 的 VLAN。`, 'VLAN_EXISTS', `VLAN 号码 ${data.vlanNumber} 已被其他 VLAN 使用。`);
        }
      }
      updatePayload.vlanNumber = data.vlanNumber;
    }
    if (data.hasOwnProperty('description')) {
      updatePayload.description = data.description || null;
    }

    if (Object.keys(updatePayload).length === 0) {
      logger.info('No changes detected for VLAN update.', { vlanId: id, inputData: data }, actionName);
      const currentVlanData = await getVLANsAction({page: 1, pageSize: 1});
      const currentVLANApp: AppVLAN = { ...vlanToUpdate, description: vlanToUpdate.description || undefined, subnetCount: currentVlanData.data.find(v=>v.id === id)?.subnetCount || 0 };
      return { success: true, data: currentVLANApp };
    }

    const updatedVLAN = await prisma.vLAN.update({ where: { id }, data: updatePayload });
    await prisma.auditLog.create({
      data: { userId: auditUser.userId, username: auditUser.username, action: 'update_vlan', details: `更新了 VLAN ${updatedVLAN.vlanNumber}` }
    });

    revalidatePath("/vlans");
    revalidatePath("/subnets");
    revalidatePath("/ip-addresses");
    const subnetCount = await prisma.subnet.count({ where: { vlanId: updatedVLAN.id } });
    const directIpCount = await prisma.iPAddress.count({ where: { vlanId: updatedVLAN.id, OR: [{ subnetId: null },{ subnet: { vlanId: { not: updatedVLAN.id }}}]}});
    const appVlan: AppVLAN = { ...updatedVLAN, description: updatedVLAN.description || undefined, subnetCount: subnetCount + directIpCount };
    logger.info('VLAN 更新成功', { vlanId: appVlan.id }, actionName);
    return { success: true, data: appVlan };
  } catch (error: unknown) {
    return { success: false, error: createActionErrorResponse(error, actionName) };
  }
}

export async function deleteVLANAction(id: string, performingUserId?: string): Promise<ActionResponse> {
  const actionName = 'deleteVLANAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    const vlanToDelete = await prisma.vLAN.findUnique({ where: { id } });
    if (!vlanToDelete) {
      throw new NotFoundError(`VLAN ID: ${id}`, `要删除的 VLAN 未找到。`);
    }

    const subnetsUsingVlanCount = await prisma.subnet.count({ where: { vlanId: id } });
    if (subnetsUsingVlanCount > 0) {
      throw new ResourceError(`无法删除 VLAN ${vlanToDelete.vlanNumber}。它已分配给 ${subnetsUsingVlanCount} 个子网。请先解除关联。`, 'VLAN_IN_USE_SUBNET', `无法删除 VLAN ${vlanToDelete.vlanNumber}，因为它仍被 ${subnetsUsingVlanCount} 个子网使用。`);
    }
    const ipsUsingVlanDirectlyCount = await prisma.iPAddress.count({ where: { vlanId: id } });
    if (ipsUsingVlanDirectlyCount > 0) {
      throw new ResourceError(`无法删除 VLAN ${vlanToDelete.vlanNumber}。它已直接分配给 ${ipsUsingVlanDirectlyCount} 个 IP 地址。请先移除直接分配。`, 'VLAN_IN_USE_IP', `无法删除 VLAN ${vlanToDelete.vlanNumber}，因为它仍被 ${ipsUsingVlanDirectlyCount} 个 IP 地址直接使用。`);
    }

    await prisma.vLAN.delete({ where: { id } });
    await prisma.auditLog.create({
      data: { userId: auditUser.userId, username: auditUser.username, action: 'delete_vlan', details: `删除了 VLAN ${vlanToDelete.vlanNumber}` }
    });

    revalidatePath("/vlans");
    revalidatePath("/subnets");
    revalidatePath("/ip-addresses");
    logger.info('VLAN 删除成功', { vlanId: id, vlanNumber: vlanToDelete.vlanNumber }, actionName);
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: createActionErrorResponse(error, actionName) };
  }
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

export async function createIPAddressAction(data: Omit<AppIPAddress, "id">, performingUserId?: string): Promise<ActionResponse<AppIPAddress>> {
    const actionName = 'createIPAddressAction';
    try {
        const auditUser = await getAuditUserInfo(performingUserId);
        const prismaStatus = data.status as string;

        const ipParts = data.ipAddress.split('.').map(Number);
        if (ipParts.some(part => isNaN(part) || part < 0 || part > 255) || ipParts.length !== 4) {
            throw new ValidationError(`无效的 IP 地址格式: ${data.ipAddress}`, 'ipAddress', data.ipAddress, `IP 地址 ${data.ipAddress} 格式无效。`);
        }

        if (!data.subnetId && (prismaStatus === 'allocated' || prismaStatus === 'reserved')) {
            throw new ValidationError("对于“已分配”或“预留”状态的 IP，除非设置为空闲，否则必须选择一个子网。", 'subnetId');
        }

        if (data.subnetId) {
            const targetSubnet = await prisma.subnet.findUnique({ where: { id: data.subnetId } });
            if (!targetSubnet) {
              throw new NotFoundError(`子网 ID: ${data.subnetId}`, `选择的子网不存在。`);
            }
            const parsedTargetSubnetCidr = getSubnetPropertiesFromCidr(targetSubnet.cidr);
            if (!parsedTargetSubnetCidr) {
              throw new AppError(`目标子网 ${targetSubnet.cidr} 的 CIDR 无效，无法验证 IP。`, 500, 'SUBNET_CIDR_INVALID_FOR_IP_CHECK');
            }
            if (!isIpInCidrRange(data.ipAddress, parsedTargetSubnetCidr)) {
                throw new ValidationError(`IP ${data.ipAddress} 不在子网 ${targetSubnet.cidr} (${parsedTargetSubnetCidr.networkAddress} - ${parsedTargetSubnetCidr.broadcastAddress}) 的范围内。`, 'ipAddress', data.ipAddress, `IP 地址 ${data.ipAddress} 不在所选子网的有效范围内。`);
            }
            const existingIPInSubnet = await prisma.iPAddress.findFirst({
                where: { ipAddress: data.ipAddress, subnetId: data.subnetId }
            });
            if (existingIPInSubnet) {
              throw new ResourceError(`IP ${data.ipAddress} 已存在于子网 ${targetSubnet.networkAddress} 中。`, 'IP_EXISTS_IN_SUBNET', `IP 地址 ${data.ipAddress} 已存在于所选子网中。`);
            }
        } else {
            const globallyExistingIP = await prisma.iPAddress.findFirst({ where: { ipAddress: data.ipAddress, subnetId: null } });
            if (globallyExistingIP) {
              throw new ResourceError(`IP ${data.ipAddress} 已存在于全局池中 (未分配给任何子网)。`, 'IP_EXISTS_GLOBALLY', `IP 地址 ${data.ipAddress} 已存在于全局池中。`);
            }
        }

        if (data.vlanId && data.vlanId !== "") {
            const vlanExists = await prisma.vLAN.findUnique({ where: { id: data.vlanId }});
            if (!vlanExists) {
              throw new NotFoundError(`VLAN ID: ${data.vlanId}`, `为 IP 地址选择的 VLAN 不存在。`);
            }
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
            data: { userId: auditUser.userId, username: auditUser.username, action: 'create_ip_address', details: `创建了 IP ${newIP.ipAddress}${subnetInfo}${vlanInfo}，状态为 ${data.status}。` }
        });

        revalidatePath("/ip-addresses");
        revalidatePath("/dashboard");
        revalidatePath("/subnets");
        const appIp: AppIPAddress = { ...newIP, subnetId: newIP.subnetId || undefined, vlanId: newIP.vlanId || undefined, allocatedTo: newIP.allocatedTo || undefined, description: newIP.description || undefined, lastSeen: newIP.lastSeen?.toISOString(), status: newIP.status as AppIPAddressStatusType };
        logger.info('IP 地址创建成功', { ipId: appIp.id, ipAddress: appIp.ipAddress }, actionName);
        return { success: true, data: appIp };
    } catch (error: unknown) {
        return { success: false, error: createActionErrorResponse(error, actionName) };
    }
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
}, performingUserId?: string): Promise<BatchIpCreationResult> {
  const auditUser = await getAuditUserInfo(performingUserId);
  let successCount = 0;
  const failureDetails: BatchIpCreationResult['failureDetails'] = [];
  const createdIpAddressesForAudit: string[] = [];

  const { startIp, endIp, subnetId, vlanId, description, status } = payload;

  try {
    const targetSubnet = await prisma.subnet.findUnique({ where: { id: subnetId } });
    if (!targetSubnet) {
      throw new NotFoundError(`子网 ID: ${subnetId}`, "未找到批量创建的目标子网。");
    }
    const parsedTargetSubnetCidr = getSubnetPropertiesFromCidr(targetSubnet.cidr);
    if (!parsedTargetSubnetCidr) {
      throw new AppError(`目标子网 ${targetSubnet.cidr} 的 CIDR 配置无效。`, 500, 'SUBNET_CIDR_INVALID_FOR_BATCH');
    }

    if (vlanId && vlanId !== "") {
      const vlanExists = await prisma.vLAN.findUnique({ where: { id: vlanId } });
      if (!vlanExists) {
        throw new NotFoundError(`VLAN ID: ${vlanId}`, "为批量 IP 创建选择的 VLAN 不存在。");
      }
    }

    let currentIpNum = ipToNumber(startIp);
    let endIpNum = ipToNumber(endIp);

    if (currentIpNum > endIpNum) {
      throw new ValidationError("起始 IP 必须小于或等于结束 IP。", 'endIp');
    }

    for (; currentIpNum <= endIpNum; currentIpNum++) {
      const currentIpStr = numberToIp(currentIpNum);
      try {
        if (!isIpInCidrRange(currentIpStr, parsedTargetSubnetCidr)) {
          throw new ValidationError(`IP ${currentIpStr} 不在子网 ${targetSubnet.cidr} 的范围内。`, 'startIp/endIp', currentIpStr);
        }

        const existingIPInSubnet = await prisma.iPAddress.findFirst({
            where: { ipAddress: currentIpStr, subnetId: subnetId }
        });
        if (existingIPInSubnet) {
          throw new ResourceError(`IP ${currentIpStr} 已存在于子网 ${targetSubnet.networkAddress} 中。`, 'IP_EXISTS_IN_SUBNET');
        }

        await prisma.iPAddress.create({
          data: {
            ipAddress: currentIpStr,
            status: status,
            allocatedTo: status === 'allocated' ? (description || '批量分配') : null,
            description: description || null,
            subnetId: subnetId,
            vlanId: vlanId === "" || vlanId === undefined ? null : vlanId,
          },
        });
        createdIpAddressesForAudit.push(currentIpStr);
        successCount++;
      } catch (e: unknown) {
        const errorResponse = createActionErrorResponse(e, 'batchCreateIPAddressesAction_single');
        failureDetails.push({ ipAttempted: currentIpStr, error: errorResponse.userMessage });
      }
    }
  } catch (e: unknown) {
      const errorResponse = createActionErrorResponse(e, 'batchCreateIPAddressesAction_setup');
      return {
        successCount: 0,
        failureDetails: [{ ipAttempted: `${startIp}-${endIp}`, error: errorResponse.userMessage }]
      };
  }

  if (createdIpAddressesForAudit.length > 0) {
     await prisma.auditLog.create({
        data: { userId: auditUser.userId, username: auditUser.username, action: 'batch_create_ip_address', details: `批量创建了 ${createdIpAddressesForAudit.length} 个 IP 到子网 ${payload.subnetId}：${createdIpAddressesForAudit.join(', ')}。状态: ${status}。失败：${failureDetails.length} 个。` }
    });
  }
  if (successCount > 0) {
    revalidatePath("/ip-addresses");
    revalidatePath("/dashboard");
    revalidatePath("/subnets");
  }
  return { successCount, failureDetails };
}

export async function updateIPAddressAction(id: string, data: Partial<Omit<AppIPAddress, "id">>, performingUserId?: string): Promise<ActionResponse<AppIPAddress>> {
  const actionName = 'updateIPAddressAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    const ipToUpdate = await prisma.iPAddress.findUnique({ where: { id } });
    if (!ipToUpdate) {
      throw new NotFoundError(`IP 地址 ID: ${id}`, `要更新的 IP 地址未找到。`);
    }

    const updateData: Prisma.IPAddressUpdateInput = {};
    let finalIpAddress = ipToUpdate.ipAddress;

    if (data.hasOwnProperty('ipAddress') && data.ipAddress !== undefined && data.ipAddress !== ipToUpdate.ipAddress) {
      const ipParts = data.ipAddress.split('.').map(Number);
      if (ipParts.some(part => isNaN(part) || part < 0 || part > 255) || ipParts.length !== 4) {
          throw new ValidationError(`无效的 IP 地址格式更新: ${data.ipAddress}`, 'ipAddress', data.ipAddress);
      }
      updateData.ipAddress = data.ipAddress;
      finalIpAddress = data.ipAddress;
    }
    if (data.hasOwnProperty('status') && data.status !== undefined) updateData.status = data.status as string;
    if (data.hasOwnProperty('allocatedTo')) updateData.allocatedTo = data.allocatedTo || null;
    if (data.hasOwnProperty('description')) updateData.description = data.description || null;
    if (data.hasOwnProperty('lastSeen')) updateData.lastSeen = data.lastSeen ? new Date(data.lastSeen) : null;

    if (data.hasOwnProperty('vlanId')) {
      const vlanIdToSet = data.vlanId === "" || data.vlanId === undefined ? null : data.vlanId;
      if (vlanIdToSet && !(await prisma.vLAN.findUnique({where: {id: vlanIdToSet}}))) {
          throw new NotFoundError(`VLAN ID: ${vlanIdToSet}`, `为 IP 地址选择的 VLAN 不存在。`);
      }
      updateData.vlanId = vlanIdToSet;
    }

    const newSubnetId = data.hasOwnProperty('subnetId') ? (data.subnetId || null) : ipToUpdate.subnetId;
    const finalStatus = data.status ? data.status as string : ipToUpdate.status;

    if (newSubnetId) {
      const targetSubnet = await prisma.subnet.findUnique({ where: { id: newSubnetId } });
      if (!targetSubnet) throw new NotFoundError(`子网 ID: ${newSubnetId}`, "目标子网不存在。");
      const parsedTargetSubnetCidr = getSubnetPropertiesFromCidr(targetSubnet.cidr);
      if (!parsedTargetSubnetCidr) throw new AppError(`目标子网 ${targetSubnet.cidr} 的 CIDR 无效。`, 500, 'SUBNET_CIDR_INVALID_FOR_IP_CHECK');
      if (!isIpInCidrRange(finalIpAddress, parsedTargetSubnetCidr)) {
        throw new ValidationError(`IP ${finalIpAddress} 不在子网 ${targetSubnet.cidr} 的范围内。`, 'ipAddress/subnetId', finalIpAddress);
      }
      if (finalIpAddress !== ipToUpdate.ipAddress || newSubnetId !== ipToUpdate.subnetId) {
          const conflictingIP = await prisma.iPAddress.findFirst({ where: { ipAddress: finalIpAddress, subnetId: newSubnetId, NOT: { id } } });
          if (conflictingIP) throw new ResourceError(`IP ${finalIpAddress} 已存在于子网 ${targetSubnet.networkAddress} 中。`, 'IP_EXISTS_IN_SUBNET');
      }
    } else {
       if (finalStatus === 'allocated' || finalStatus === 'reserved') {
          throw new ValidationError("对于“已分配”或“预留”状态的 IP，必须选择一个子网。", 'subnetId', finalStatus);
      }
      if (finalIpAddress !== ipToUpdate.ipAddress || newSubnetId !== ipToUpdate.subnetId) {
          const globallyConflictingIP = await prisma.iPAddress.findFirst({ where: { ipAddress: finalIpAddress, subnetId: null, NOT: { id } } });
          if (globallyConflictingIP) throw new ResourceError(`IP ${finalIpAddress} 已存在于全局池中。`, 'IP_EXISTS_GLOBALLY');
      }
    }
    updateData.subnetId = newSubnetId;

    const updatedIP = await prisma.iPAddress.update({ where: { id }, data: updateData });
    await prisma.auditLog.create({
      data: { userId: auditUser.userId, username: auditUser.username, action: 'update_ip_address', details: `更新了 IP ${updatedIP.ipAddress}` }
    });

    revalidatePath("/ip-addresses");
    revalidatePath("/dashboard");
    revalidatePath("/subnets");
    const appIp: AppIPAddress = { ...updatedIP, subnetId: updatedIP.subnetId || undefined, vlanId: updatedIP.vlanId || undefined, allocatedTo: updatedIP.allocatedTo || undefined, description: updatedIP.description || undefined, lastSeen: updatedIP.lastSeen?.toISOString(), status: updatedIP.status as AppIPAddressStatusType };
    logger.info('IP 地址更新成功', { ipId: appIp.id }, actionName);
    return { success: true, data: appIp };
  } catch (error: unknown) {
    return { success: false, error: createActionErrorResponse(error, actionName) };
  }
}

export async function deleteIPAddressAction(id: string, performingUserId?: string): Promise<ActionResponse> {
  const actionName = 'deleteIPAddressAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    const ipToDelete = await prisma.iPAddress.findUnique({ where: { id } });
    if (!ipToDelete) {
      throw new NotFoundError(`IP 地址 ID: ${id}`, `要删除的 IP 地址未找到。`);
    }

    await prisma.iPAddress.delete({ where: { id } });
    await prisma.auditLog.create({
      data: { userId: auditUser.userId, username: auditUser.username, action: 'delete_ip_address', details: `删除了 IP ${ipToDelete.ipAddress}` }
    });

    revalidatePath("/ip-addresses");
    revalidatePath("/dashboard");
    revalidatePath("/subnets");
    logger.info('IP 地址删除成功', { ipId: id, ipAddress: ipToDelete.ipAddress }, actionName);
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: createActionErrorResponse(error, actionName) };
  }
}

export async function getUsersAction(params?: FetchParams): Promise<PaginatedResponse<FetchedUserDetails>> {
  const page = params?.page || 1;
  const pageSize = params?.pageSize || DEFAULT_PAGE_SIZE;
  const skip = (page - 1) * pageSize;
  const whereClause = {};
  const totalCount = await prisma.user.count({ where: whereClause });
  const totalPages = Math.ceil(totalCount / pageSize);
  const usersFromDb = params?.page && params?.pageSize ?
    await prisma.user.findMany({ where: whereClause, include: { role: { include: { permissions: true } } }, orderBy: { username: 'asc'}, skip, take: pageSize }) :
    await prisma.user.findMany({ where: whereClause, include: { role: { include: { permissions: true } } }, orderBy: { username: 'asc'} });

  const appUsers: FetchedUserDetails[] = usersFromDb.map(user => {
    if (!user.role || !user.role.name) {
        logger.error(`User ${user.id} has missing role or role name in getUsersAction.`, new AppError("User role data invalid"), {userId: user.id});
        return { id: user.id, username: user.username, email: user.email, roleId: user.roleId, roleName: 'Viewer' as AppRoleNameType, avatar: user.avatar || '/images/avatars/default_avatar.png', lastLogin: user.lastLogin?.toISOString() || undefined, permissions: [] };
    }
    return { id: user.id, username: user.username, email: user.email, roleId: user.roleId, roleName: user.role.name as AppRoleNameType, avatar: user.avatar || '/images/avatars/default_avatar.png', lastLogin: user.lastLogin?.toISOString() || undefined, permissions: user.role.permissions.map(p => p.id as AppPermissionIdType) };
  });
  return { data: appUsers, totalCount: params?.page && params?.pageSize ? totalCount : appUsers.length, currentPage: page, totalPages: params?.page && params?.pageSize ? totalPages : 1, pageSize };
}

export async function createUserAction(data: Omit<AppUser, "id" | "lastLogin" | "roleName"> & { password: string, avatar?: string }, performingUserId?: string): Promise<ActionResponse<FetchedUserDetails>> {
  const actionName = 'createUserAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    if (await prisma.user.findUnique({ where: { email: data.email } })) {
      throw new ResourceError(`邮箱 ${data.email} 已存在。`, 'USER_EMAIL_EXISTS', `邮箱 ${data.email} 已被其他用户使用。`, 'email');
    }
    if (await prisma.user.findUnique({ where: { username: data.username } })) {
      throw new ResourceError(`用户名 ${data.username} 已存在。`, 'USER_USERNAME_EXISTS', `用户名 ${data.username} 已被其他用户使用。`, 'username');
    }
    const roleExists = await prisma.role.findUnique({ where: { id: data.roleId }, include: {permissions: true} });
    if (!roleExists || !roleExists.name) {
      throw new NotFoundError(`角色 ID: ${data.roleId}`, `选择的角色不存在或无效。`, 'roleId');
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
      data: { userId: auditUser.userId, username: auditUser.username, action: 'create_user', details: `创建了用户 ${newUser.username}，角色为 ${roleExists.name}。` }
    });
    revalidatePath("/users");
    revalidatePath("/roles");

    const appUser: FetchedUserDetails = {
      ...newUser,
      roleName: newUser.role.name as AppRoleNameType,
      avatar: newUser.avatar || undefined,
      lastLogin: newUser.lastLogin?.toISOString(),
      permissions: newUser.role.permissions.map(p => p.id as AppPermissionIdType)
    };
    logger.info('用户创建成功', { userId: appUser.id, username: appUser.username }, actionName);
    return { success: true, data: appUser };
  } catch (error: unknown) {
    return { success: false, error: createActionErrorResponse(error, actionName) };
  }
}

export async function updateUserAction(id: string, data: Partial<Omit<AppUser, "id" | "roleName">> & { password?: string }, performingUserId?: string): Promise<ActionResponse<FetchedUserDetails>> {
  const actionName = 'updateUserAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    const userToUpdate = await prisma.user.findUnique({ where: { id } });
    if (!userToUpdate) {
      throw new NotFoundError(`用户 ID: ${id}`, `要更新的用户未找到。`);
    }

    const updateData: Prisma.UserUpdateInput = {};
    if (data.hasOwnProperty('username') && data.username !== undefined && data.username !== userToUpdate.username) {
      if (await prisma.user.findFirst({ where: { username: data.username, NOT: { id } } })) {
        throw new ResourceError(`用户名 ${data.username} 已被使用。`, 'USER_USERNAME_EXISTS', undefined, 'username');
      }
      updateData.username = data.username;
    }
    if (data.hasOwnProperty('email') && data.email !== undefined && data.email !== userToUpdate.email) {
      if (await prisma.user.findFirst({ where: { email: data.email, NOT: { id } } })) {
        throw new ResourceError(`邮箱 ${data.email} 已被使用。`, 'USER_EMAIL_EXISTS', undefined, 'email');
      }
      updateData.email = data.email;
    }
    if (data.hasOwnProperty('roleId') && data.roleId !== undefined) {
      const roleExists = await prisma.role.findUnique({ where: { id: data.roleId } });
      if (!roleExists || !roleExists.name) {
        throw new NotFoundError(`角色 ID: ${data.roleId}`, `选择的角色不存在或无效。`, 'roleId');
      }
      updateData.roleId = data.roleId;
    }
    if (data.hasOwnProperty('avatar')) {
      updateData.avatar = data.avatar || '/images/avatars/default_avatar.png';
    }
    if (data.password && data.password.length > 0) {
      updateData.password = data.password;
    }

    if (Object.keys(updateData).length === 0) {
        logger.info('No changes detected for user update.', { userId: id, inputData: data }, actionName);
        const currentUserDetails = await fetchCurrentUserDetailsAction(id);
        if (!currentUserDetails) throw new AppError("Failed to fetch current user details after no-op update.");
        return { success: true, data: currentUserDetails };
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData,
      include: { role: { include: {permissions: true} } }
    });

    if (!updatedUser.role || !updatedUser.role.name) {
        throw new AppError("更新用户后，角色信息无效。", 500, 'USER_ROLE_INVALID_POST_UPDATE');
    }

    let auditDetails = `用户 ${updatedUser.username} 的详细信息已由 ${auditUser.username || '系统'} 更新。`;
    if (data.password && data.password.length > 0) auditDetails = `用户 ${updatedUser.username} 的密码已由 ${auditUser.username || '系统'} 更改。`;
    await prisma.auditLog.create({
      data: { userId: auditUser.userId, username: auditUser.username, action: 'update_user_details', details: auditDetails }
    });

    revalidatePath("/users");
    revalidatePath("/roles");
    const appUser: FetchedUserDetails = {
      ...updatedUser,
      roleName: updatedUser.role.name as AppRoleNameType,
      avatar: updatedUser.avatar || undefined,
      lastLogin: updatedUser.lastLogin?.toISOString(),
      permissions: updatedUser.role.permissions.map(p => p.id as AppPermissionIdType)
    };
    logger.info('用户更新成功', { userId: appUser.id }, actionName);
    return { success: true, data: appUser };
  } catch (error: unknown) {
    return { success: false, error: createActionErrorResponse(error, actionName) };
  }
}

interface UpdateOwnPasswordPayload { currentPassword?: string; newPassword?: string; }
export async function updateOwnPasswordAction(userId: string, payload: UpdateOwnPasswordPayload): Promise<ActionResponse<{ message: string }>> {
  const actionName = 'updateOwnPasswordAction';
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundError(`用户 ID: ${userId}`, "执行操作的用户未找到。");
    }

    if (!payload.currentPassword) {
      throw new ValidationError("当前密码是必需的。", "currentPassword");
    }
    if (user.password !== payload.currentPassword) {
      throw new AuthError("当前密码不匹配。", "当前密码不正确。", "currentPassword");
    }
    if (!payload.newPassword) {
      throw new ValidationError("新密码是必需的。", "newPassword");
    }

    await prisma.user.update({
      where: { id: userId },
      data: { password: payload.newPassword },
    });
    await prisma.auditLog.create({
      data: { userId: user.id, username: user.username, action: 'update_own_password', details: `用户 ${user.username} 更改了自己的密码。` }
    });
    revalidatePath("/settings");
    logger.info('用户密码更新成功', { userId }, actionName);
    return { success: true, data: { message: "密码已成功更新。" } };
  } catch (error: unknown) {
    return { success: false, error: createActionErrorResponse(error, actionName) };
  }
}

export async function deleteUserAction(id: string, performingUserId?: string): Promise<ActionResponse> {
  const actionName = 'deleteUserAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    const userToDelete = await prisma.user.findUnique({ where: { id }, include: {role: true} });
    if (!userToDelete) {
      throw new NotFoundError(`用户 ID: ${id}`, "要删除的用户未找到。");
    }
    if (!userToDelete.role || !userToDelete.role.name) {
      throw new AppError("无法删除用户：关联的角色信息无效。", 500, 'USER_ROLE_INVALID_PRE_DELETE');
    }

    if (performingUserId && id === performingUserId) {
        throw new ResourceError("无法删除当前登录的用户。", "DELETE_SELF_NOT_ALLOWED", "您不能删除自己的账户。");
    }

    if (userToDelete.role.name === "Administrator") {
      const adminCount = await prisma.user.count({ where: { role: { name: "Administrator" } } });
      if (adminCount <= 1) {
        throw new ResourceError("无法删除最后一个管理员用户。", "LAST_ADMIN_DELETE_NOT_ALLOWED", "系统中必须至少保留一个管理员用户。");
      }
    }

    await prisma.auditLog.updateMany({
      where: { userId: id },
      data: { userId: null, username: `已删除用户 (${userToDelete.username})` }
    });

    await prisma.user.delete({ where: { id } });
    await prisma.auditLog.create({
      data: { userId: auditUser.userId, username: auditUser.username, action: 'delete_user', details: `删除了用户 ${userToDelete.username} (ID: ${id})。` }
    });
    revalidatePath("/users");
    revalidatePath("/roles");
    logger.info('用户删除成功', { userId: id, username: userToDelete.username }, actionName);
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: createActionErrorResponse(error, actionName) };
  }
}

export async function getRolesAction(params?: FetchParams): Promise<PaginatedResponse<AppRole>> {
  const page = params?.page || 1;
  const pageSize = params?.pageSize || DEFAULT_PAGE_SIZE;
  const skip = (page - 1) * pageSize;
  const whereClause = {};
  const totalCount = await prisma.role.count({ where: whereClause });
  const totalPages = Math.ceil(totalCount / pageSize);
  const rolesFromDb = params?.page && params?.pageSize ?
    await prisma.role.findMany({ where: whereClause, include: { _count: { select: { users: true } }, permissions: { orderBy: { id: 'asc' } } }, orderBy: { name: 'asc'}, skip, take: pageSize }) :
    await prisma.role.findMany({ where: whereClause, include: { _count: { select: { users: true } }, permissions: { orderBy: { id: 'asc' } } }, orderBy: { name: 'asc'} });

  const appRoles = rolesFromDb.map(role => {
    if (!role.name) {
        logger.error(`Role ${role.id} has a missing name in getRolesAction.`, new AppError("Role name missing"), {roleId: role.id});
        return { id: role.id, name: 'Viewer' as AppRoleNameType, description: role.description || undefined, userCount: role._count.users, permissions: role.permissions.map(p => p.id as AppPermissionIdType) };
    }
    return { id: role.id, name: role.name as AppRoleNameType, description: role.description || undefined, userCount: role._count.users, permissions: role.permissions.map(p => p.id as AppPermissionIdType) };
  });
  return { data: appRoles, totalCount: params?.page && params?.pageSize ? totalCount : appRoles.length, currentPage: page, totalPages: params?.page && params?.pageSize ? totalPages : 1, pageSize };
}

export async function updateRoleAction(id: string, data: Partial<Omit<AppRole, "id" | "userCount" | "name">> & { permissions?: AppPermissionIdType[] }, performingUserId?: string): Promise<ActionResponse<AppRole>> {
  const actionName = 'updateRoleAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    const roleToUpdate = await prisma.role.findUnique({ where: { id } });
    if (!roleToUpdate || !roleToUpdate.name) {
      throw new NotFoundError(`角色 ID: ${id}`, `要更新的角色未找到或名称无效。`);
    }

    const updateData: Prisma.RoleUpdateInput = {};
    if (data.hasOwnProperty('description')) {
      updateData.description = data.description === undefined ? null : data.description;
    }

    if (data.permissions) {
      const prismaPermissions = data.permissions.map(appPermId => ({ id: appPermId as string }));
      updateData.permissions = { set: prismaPermissions };
    }

    if (Object.keys(updateData).length === 0) {
        logger.info('No changes detected for role update.', { roleId: id, inputData: data }, actionName);
        const currentRoleWithCounts = await getRolesAction();
        const currentRoleApp = currentRoleWithCounts.data.find(r => r.id === id);
        if (!currentRoleApp) throw new AppError("Failed to fetch current role details after no-op update.");
        return { success: true, data: currentRoleApp };
    }

    const updatedRole = await prisma.role.update({
      where: { id },
      data: updateData,
      include: { permissions: true, _count: { select: { users: true } } }
    });

    if (!updatedRole.name) {
        throw new AppError("更新角色后，角色名称信息无效。", 500, 'ROLE_NAME_INVALID_POST_UPDATE');
    }

    let auditDetails = `更新了角色 ${updatedRole.name}。`;
    if (data.hasOwnProperty('description')) auditDetails += ` 描述 ${data.description ? '已更改' : '已清除/未更改'}。`;
    if (data.permissions) auditDetails += ` 权限 ${data.permissions.length > 0 ? '已更改' : '已清除/未更改'}。`;

    await prisma.auditLog.create({
      data: { userId: auditUser.userId, username: auditUser.username, action: 'update_role', details: auditDetails }
    });
    revalidatePath("/roles");
    revalidatePath("/users");
    const appRole: AppRole = {
      id: updatedRole.id,
      name: updatedRole.name as AppRoleNameType,
      description: updatedRole.description || undefined,
      userCount: updatedRole._count.users,
      permissions: updatedRole.permissions.map(p => p.id as AppPermissionIdType),
    };
    logger.info('角色更新成功', { roleId: appRole.id }, actionName);
    return { success: true, data: appRole };
  } catch (error: unknown) {
    return { success: false, error: createActionErrorResponse(error, actionName) };
  }
}

export async function createRoleAction(data: any): Promise<ActionResponse<AppRole>> {
  throw new AppError("不允许创建新角色。角色是固定的 (Administrator, Operator, Viewer)。", 403, 'ROLE_CREATION_NOT_ALLOWED');
}
export async function deleteRoleAction(id: string): Promise<ActionResponse> {
  const role = await prisma.role.findUnique({where: {id}});
   if (role && (role.name === "Administrator" || role.name === "Operator" || role.name === "Viewer" )) {
     throw new AppError("不允许删除固定角色 (Administrator, Operator, Viewer)。", 403, 'FIXED_ROLE_DELETION_NOT_ALLOWED');
   }
  throw new NotFoundError(`角色 ID: ${id}`, "未找到角色或不允许删除。");
}

export async function getAuditLogsAction(params?: FetchParams): Promise<PaginatedResponse<AppAuditLog>> {
  const page = params?.page || 1;
  const pageSize = params?.pageSize || DEFAULT_PAGE_SIZE;
  const skip = (page - 1) * pageSize;
  const whereClause = {};
  const totalCount = await prisma.auditLog.count({ where: whereClause });
  const totalPages = Math.ceil(totalCount / pageSize);
  const logsFromDb = params?.page && params?.pageSize ?
    await prisma.auditLog.findMany({ where: whereClause, orderBy: { timestamp: 'desc' }, include: { user: { select: { username: true } } }, skip, take: pageSize }) :
    await prisma.auditLog.findMany({ where: whereClause, orderBy: { timestamp: 'desc' }, include: { user: { select: { username: true } } } });

  const appLogs = logsFromDb.map(log => ({
    id: log.id, userId: log.userId || "system", username: log.username || (log.user ? log.user.username : (log.userId ? '未知用户' : '系统')),
    action: log.action, timestamp: log.timestamp.toISOString(), details: log.details || undefined,
  }));
  return { data: appLogs, totalCount: params?.page && params?.pageSize ? totalCount : appLogs.length, currentPage: page, totalPages: params?.page && params?.pageSize ? totalPages : 1, pageSize };
}

export async function deleteAuditLogAction(id: string, performingUserId?: string): Promise<ActionResponse> {
  const actionName = 'deleteAuditLogAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    const logToDelete = await prisma.auditLog.findUnique({ where: { id } });

    if (!logToDelete) {
      throw new NotFoundError(`审计日志 ID: ${id}`, `要删除的审计日志条目未找到。`);
    }

    await prisma.auditLog.delete({ where: { id } });

    try {
      await prisma.auditLog.create({
        data: {
          userId: auditUser.userId,
          username: auditUser.username,
          action: 'delete_audit_log_entry',
          details: `删除了审计日志条目 ID ${id} (原操作: ${logToDelete.action}, 原用户: ${logToDelete.username || 'N/A'}, 原时间戳: ${logToDelete.timestamp.toISOString()})`
        }
      });
    } catch (logError) {
      logger.error('Failed to create audit log for audit log deletion', logError as Error, { originalLogId: id }, actionName);
    }

    revalidatePath("/audit-logs");
    logger.info('审计日志条目删除成功', { logId: id }, actionName);
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: createActionErrorResponse(error, actionName) };
  }
}

export async function getAllPermissionsAction(): Promise<AppPermission[]> {
    const permissionsFromDb = await prisma.permission.findMany({ orderBy: { id: 'asc' }});
    return permissionsFromDb.map(p => ({
        ...p,
        id: p.id as AppPermissionIdType,
        description: p.description || undefined,
    }));
}
