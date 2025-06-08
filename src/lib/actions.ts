
"use server";

import { revalidatePath } from "next/cache";
import type { Subnet as AppSubnet, VLAN as AppVLAN, IPAddress as AppIPAddress, User as AppUser, Role as AppRole, AuditLog as AppAuditLog, IPAddressStatus as AppIPAddressStatusType, RoleName as AppRoleNameType, PermissionId as AppPermissionIdType, Permission as AppPermission, SubnetQueryResult, VlanQueryResult, BatchDeleteResult, BatchOperationFailure, SubnetFreeIpDetails, PaginatedResponse } from '@/types';
import { PERMISSIONS } from '@/types';
import prisma from "./prisma";
import {
  getSubnetPropertiesFromCidr,
  getUsableIpCount,
  isIpInCidrRange,
  ipToNumber,
  numberToIp,
  doSubnetsOverlap,
  compareIpStrings,
  groupConsecutiveIpsToRanges,
} from "./ip-utils";
import { validateCIDR as validateCidrInput } from "./error-utils";
import { logger } from './logger';
import { AppError, ValidationError, ResourceError, NotFoundError, AuthError, type ActionErrorResponse } from './errors';
import { createActionErrorResponse } from './error-utils';
import { ADMIN_ROLE_ID, OPERATOR_ROLE_ID, VIEWER_ROLE_ID, mockPermissions } from "./data";
import { Prisma, type IPAddress as PrismaIPAddress, type Subnet as PrismaSubnet, type VLAN as PrismaVLAN } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';

// Standardized Action Response
export interface ActionResponse<TData = unknown> {
  success: boolean;
  data?: TData;
  error?: ActionErrorResponse;
}

// PaginatedResponse is now imported from '@/types'

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
const DEFAULT_QUERY_PAGE_SIZE = 10; // For query tool specific pagination

interface FetchParams {
  page?: number;
  pageSize?: number;
  subnetId?: string;
  status?: AppIPAddressStatusType | 'all'; // Used by getIPAddressesAction
}

export interface FetchedUserDetails {
  id: string;
  username: string;
  email: string;
  roleId: string;
  roleName: AppRoleNameType; // Explicitly non-optional
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
      const subnetProperties = getSubnetPropertiesFromCidr(subnet.cidr);
      let utilization = 0;
      let networkAddress = subnet.networkAddress;
      let subnetMask = subnet.subnetMask;
      let ipRange: string | null = subnet.ipRange;

      if (subnetProperties && typeof subnetProperties.prefix === 'number') {
        const totalUsableIps = getUsableIpCount(subnetProperties.prefix);
        const allocatedIpsCount = await prisma.iPAddress.count({
          where: { subnetId: subnet.id, status: "allocated" },
        });
        if (totalUsableIps > 0) {
          utilization = Math.round((allocatedIpsCount / totalUsableIps) * 100);
        }
        networkAddress = subnetProperties.networkAddress;
        subnetMask = subnetProperties.subnetMask;
        ipRange = subnetProperties.ipRange !== undefined ? subnetProperties.ipRange : null;
      } else {
        logger.warn(`[${actionName}] Could not parse CIDR properties for '${subnet.cidr}' from DB for subnet ID ${subnet.id}. Using DB values or defaults.`, undefined, { subnetId: subnet.id, cidr: subnet.cidr });
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
    if (error instanceof AppError) throw error;
    throw new AppError("获取子网数据时发生服务器错误。", 500, "GET_SUBNETS_FAILED", "无法加载子网数据，请稍后重试。");
  }
}

export interface CreateSubnetData {
  cidr: string;
  vlanId?: string | null | undefined;
  description?: string | null | undefined;
}
export async function createSubnetAction(
  data: CreateSubnetData,
  performingUserId?: string
): Promise<ActionResponse<AppSubnet>> {
  const actionName = 'createSubnetAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);

    validateCidrInput(data.cidr, 'cidr');

    const newSubnetProperties = getSubnetPropertiesFromCidr(data.cidr);
    if (!newSubnetProperties) {
      throw new AppError(
        'Failed to parse CIDR properties even after initial validation.',
        500,
        'CIDR_PARSE_UNEXPECTED_ERROR',
        '无法解析有效的 CIDR 属性，这通常表示一个内部错误。'
      );
    }
    const canonicalCidrToStore = data.cidr;

    const existingSubnetByCidr = await prisma.subnet.findUnique({
      where: { cidr: canonicalCidrToStore }
    });
    if (existingSubnetByCidr) {
      throw new ResourceError(
        `子网 ${canonicalCidrToStore} 已存在。`,
        'SUBNET_ALREADY_EXISTS',
        `子网 ${canonicalCidrToStore} 已存在，无法重复创建。`,
        'cidr'
      );
    }

    const allExistingSubnets = await prisma.subnet.findMany();
    for (const existingSub of allExistingSubnets) {
      const existingSubProps = getSubnetPropertiesFromCidr(existingSub.cidr);
      if (existingSubProps && newSubnetProperties && doSubnetsOverlap(newSubnetProperties, existingSubProps)) {
        throw new ResourceError(
          `提供的子网 ${canonicalCidrToStore} 与现有子网 ${existingSub.cidr} 重叠。`,
          'SUBNET_OVERLAP_ERROR',
          `提供的子网 ${canonicalCidrToStore} 与现有子网 ${existingSub.cidr} 重叠。请选择一个不冲突的范围。`,
          'cidr'
        );
      }
    }

    const createPayload: Prisma.SubnetCreateInput = {
      cidr: canonicalCidrToStore,
      networkAddress: newSubnetProperties.networkAddress,
      subnetMask: newSubnetProperties.subnetMask,
      ipRange: newSubnetProperties.ipRange || null,
      description: (data.description === undefined || data.description === "") ? null : data.description,
    };

    if (data.vlanId) {
        const vlanExists = await prisma.vLAN.findUnique({ where: { id: data.vlanId }});
        if (!vlanExists) {
            throw new NotFoundError(`VLAN ID: ${data.vlanId}`, `选择的 VLAN 不存在。`, 'vlanId');
        }
        createPayload.vlan = { connect: { id: data.vlanId } };
    }

    const newSubnetPrisma = await prisma.subnet.create({ data: createPayload });

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
    revalidatePath("/query");

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

export interface UpdateSubnetData {
  cidr?: string;
  vlanId?: string | null | undefined;
  description?: string | null | undefined;
}

export async function updateSubnetAction(
  id: string,
  data: UpdateSubnetData,
  performingUserId?: string
): Promise<ActionResponse<AppSubnet>> {
  const actionName = 'updateSubnetAction';
  logger.debug(`[${actionName}] Initiated for subnet ID: ${id}. Received data:`, data);

  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    const subnetToUpdate = await prisma.subnet.findUnique({ where: { id } });

    if (!subnetToUpdate) {
      throw new NotFoundError(`子网 ID: ${id}`, `要更新的子网未找到。`);
    }
    logger.debug(`[${actionName}] Found subnet to update:`, subnetToUpdate);

    const updateData: Prisma.SubnetUpdateInput = {};
    const originalCidrForLog = subnetToUpdate.cidr;
    let newCanonicalCidrForLog = subnetToUpdate.cidr;
    let newSubnetPropertiesForOverlapCheck = getSubnetPropertiesFromCidr(subnetToUpdate.cidr);

    if (data.cidr && data.cidr !== subnetToUpdate.cidr) {
      logger.debug(`[${actionName}] CIDR change detected from '${subnetToUpdate.cidr}' to '${data.cidr}'.`);
      validateCidrInput(data.cidr, 'cidr');
      const newSubnetProperties = getSubnetPropertiesFromCidr(data.cidr);
      if (!newSubnetProperties) {
        throw new AppError('Failed to parse new CIDR properties after validation.', 500, 'CIDR_PARSE_UNEXPECTED_ERROR', '无法解析新的有效 CIDR 属性。');
      }
      newSubnetPropertiesForOverlapCheck = newSubnetProperties;
      const newCanonicalCidr = data.cidr;
      newCanonicalCidrForLog = newCanonicalCidr;

      const conflictingSubnetByCidr = await prisma.subnet.findFirst({
        where: { cidr: newCanonicalCidr, NOT: { id } }
      });
      if (conflictingSubnetByCidr) {
        throw new ResourceError(
          `子网 ${newCanonicalCidr} 已存在。`,
          'SUBNET_ALREADY_EXISTS',
          `新的 CIDR ${newCanonicalCidr} 与现有子网冲突。`,
          'cidr'
        );
      }

      const otherExistingSubnets = await prisma.subnet.findMany({ where: { NOT: { id } } });
      for (const existingSub of otherExistingSubnets) {
        const existingSubProps = getSubnetPropertiesFromCidr(existingSub.cidr);
        if (existingSubProps && newSubnetPropertiesForOverlapCheck && doSubnetsOverlap(newSubnetPropertiesForOverlapCheck, existingSubProps)) {
          throw new ResourceError(
            `更新后的子网 ${newCanonicalCidr} 与现有子网 ${existingSub.cidr} 重叠。`,
            'SUBNET_OVERLAP_ERROR',
            `更新后的子网 ${newCanonicalCidr} 与现有子网 ${existingSub.cidr} 重叠。请选择一个不冲突的范围。`,
            'cidr'
          );
        }
      }

      updateData.cidr = newCanonicalCidr;
      updateData.networkAddress = newSubnetProperties.networkAddress;
      updateData.subnetMask = newSubnetProperties.subnetMask;
      updateData.ipRange = newSubnetProperties.ipRange || null;

      const allocatedIpsInSubnet = await prisma.iPAddress.findMany({
        where: { subnetId: id, status: "allocated" },
      });
      const ipsToDisassociateDetails: string[] = [];
      for (const ip of allocatedIpsInSubnet) {
        if (!isIpInCidrRange(ip.ipAddress, newSubnetProperties)) {
          await prisma.iPAddress.update({
            where: { id: ip.id },
            data: { status: "free", allocatedTo: null, subnet: { disconnect: true }, vlan: { disconnect: true } },
          });
          ipsToDisassociateDetails.push(`${ip.ipAddress} (原状态: ${ip.status})`);
        }
      }
      if (ipsToDisassociateDetails.length > 0) {
        await prisma.auditLog.create({
          data: {
            userId: auditUser.userId,
            username: auditUser.username,
            action: 'auto_handle_ip_on_subnet_resize',
            details: `子网 ${originalCidrForLog} 调整大小为 ${newCanonicalCidrForLog}。已解除关联的 IP：${ipsToDisassociateDetails.join('; ')}。`
          }
        });
      }
    }

    if (data.hasOwnProperty('vlanId')) {
      const newVlanId = data.vlanId;
      const oldVlanId = subnetToUpdate.vlanId;

      if (newVlanId === null) {
        if (oldVlanId !== null) {
            const ipsDirectlyOnOldVlanCount = await prisma.iPAddress.count({ where: { subnetId: id, vlanId: oldVlanId }});
            if (ipsDirectlyOnOldVlanCount > 0) {
                const oldVlanDetails = await prisma.vLAN.findUnique({ where: { id: oldVlanId! } });
                const oldVlanNumberForMessage = oldVlanDetails ? `VLAN ${oldVlanDetails.vlanNumber}` : `旧VLAN (ID: ${oldVlanId})`;
                throw new ResourceError(`无法移除子网的 ${oldVlanNumberForMessage}。`, 'SUBNET_VLAN_REMOVE_CONFLICT_IPS', `子网 ${subnetToUpdate.cidr} 中仍有 ${ipsDirectlyOnOldVlanCount} 个 IP 地址直接分配给了 ${oldVlanNumberForMessage}。请先修改这些 IP 地址的 VLAN 配置。`, 'vlanId');
            }
            updateData.vlan = { disconnect: true };
            logger.debug(`[${actionName}] Disconnecting subnet ${id} from VLAN ${oldVlanId}.`);
        } else {
             logger.debug(`[${actionName}] Subnet ${id} was not connected to any VLAN, newVlanId is null, no change.`);
        }
      } else if (newVlanId) { // newVlanId is a string (ID)
        if (newVlanId !== oldVlanId) {
            const vlanExists = await prisma.vLAN.findUnique({ where: { id: newVlanId }});
            if (!vlanExists) {
                throw new NotFoundError(`VLAN ID: ${newVlanId}`, `选择的 VLAN (ID: ${newVlanId}) 不存在。`, 'vlanId');
            }
            updateData.vlan = { connect: { id: newVlanId } };
            logger.debug(`[${actionName}] Connecting subnet ${id} to new VLAN ${newVlanId}.`);
        } else {
            logger.debug(`[${actionName}] New VLAN ID ${newVlanId} is same as old VLAN ID ${oldVlanId}. No change to subnet's VLAN connection.`);
        }
      }
      // If data.vlanId is undefined, no change is made to the vlan connection
    }

    if (data.hasOwnProperty('description')) {
      updateData.description = (data.description === undefined || data.description === "") ? null : data.description;
      logger.debug(`[${actionName}] Description update for subnet ${id}. New description: '${updateData.description}'`);
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

    logger.debug(`[${actionName}] Final update payload for subnet ${id}:`, updateData);
    const updatedSubnetPrisma = await prisma.subnet.update({ where: { id }, data: updateData });
    await prisma.auditLog.create({
      data: { userId: auditUser.userId, username: auditUser.username, action: 'update_subnet', details: `更新了子网 ID ${id} (旧 CIDR: ${originalCidrForLog}, 新 CIDR: ${newCanonicalCidrForLog})` }
    });

    revalidatePath("/subnets");
    revalidatePath("/dashboard");
    revalidatePath("/ip-addresses");
    revalidatePath("/query");

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
    logger.error(`Error in ${actionName} for subnet ${id}`, error as Error, { inputData: data });
    return { success: false, error: createActionErrorResponse(error, actionName) };
  }
}

async function calculateSubnetUtilization(subnetId: string): Promise<number> {
    const subnet = await prisma.subnet.findUnique({ where: { id: subnetId } });
    if (!subnet) return 0;
    const subnetProperties = getSubnetPropertiesFromCidr(subnet.cidr);
    if (!subnetProperties || typeof subnetProperties.prefix !== 'number') return 0;
    const totalUsableIps = getUsableIpCount(subnetProperties.prefix);
    if (totalUsableIps === 0) return 0;
    const allocatedIpsCount = await prisma.iPAddress.count({ where: { subnetId: subnetId, status: "allocated" }});
    return Math.round((allocatedIpsCount / totalUsableIps) * 100);
}

export async function deleteSubnetAction(id: string, performingUserId?: string): Promise<ActionResponse> {
  const actionName = 'deleteSubnetAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    const subnetToDelete = await prisma.subnet.findUnique({ where: { id }, include: { vlan: true } });

    if (!subnetToDelete) {
      throw new NotFoundError(`子网 ID: ${id}`, `要删除的子网未找到。`);
    }

    if (subnetToDelete.vlanId && subnetToDelete.vlanId.trim() !== "") {
      const vlanNumberForMessage = subnetToDelete.vlan ? `VLAN ${subnetToDelete.vlan.vlanNumber}` : `VLAN (ID: ${subnetToDelete.vlanId})`;
      throw new ResourceError(
        `子网 ${subnetToDelete.cidr} 已关联到 ${vlanNumberForMessage}。`,
        'SUBNET_HAS_VLAN_ASSOCIATION',
        `无法删除子网 ${subnetToDelete.cidr}，因为它已关联到 ${vlanNumberForMessage}。请先解除其 VLAN 关联。`
      );
    }

    const allocatedIpsCount = await prisma.iPAddress.count({ where: { subnetId: id, status: 'allocated' } });
    if (allocatedIpsCount > 0) {
      throw new ResourceError(
        `子网 ${subnetToDelete.cidr} 中仍有 ${allocatedIpsCount} 个已分配的 IP 地址。`,
        'SUBNET_HAS_ALLOCATED_IPS',
        `无法删除子网 ${subnetToDelete.cidr}，因为它仍包含已分配的 IP 地址。请先将这些 IP 释放或移至其他子网。`
      );
    }

    const reservedIpsCount = await prisma.iPAddress.count({ where: { subnetId: id, status: 'reserved' } });
    if (reservedIpsCount > 0) {
        throw new ResourceError(
        `子网 ${subnetToDelete.cidr} 中仍有 ${reservedIpsCount} 个预留状态的 IP 地址。`,
        'SUBNET_HAS_RESERVED_IPS',
        `无法删除子网 ${subnetToDelete.cidr}，因为它仍包含预留状态的 IP 地址。请将这些 IP 状态改为空闲或移至其他子网。`
      );
    }

    const freeIpsInSubnet = await prisma.iPAddress.findMany({ where: { subnetId: id, status: 'free' } });
    for (const ip of freeIpsInSubnet) {
      await prisma.iPAddress.update({
        where: { id: ip.id },
        data: { subnet: { disconnect: true }, vlan: { disconnect: true } }, // Also disconnect direct VLAN if any, though not expected for 'free' IPs
      });
      await prisma.auditLog.create({
        data: { userId: auditUser.userId, username: auditUser.username, action: 'auto_disassociate_ip_on_subnet_delete', details: `IP ${ip.ipAddress} 已从子网 ${subnetToDelete.cidr} 解除关联（变为全局空闲），因为子网被删除。` }
      });
    }

    await prisma.subnet.delete({ where: { id } });
    await prisma.auditLog.create({
      data: { userId: auditUser.userId, username: auditUser.username, action: 'delete_subnet', details: `删除了子网 ${subnetToDelete.cidr}` }
    });

    revalidatePath("/subnets");
    revalidatePath("/ip-addresses");
    revalidatePath("/dashboard");
    revalidatePath("/query");
    logger.info('子网删除成功', { subnetId: id, cidr: subnetToDelete.cidr }, actionName);
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: createActionErrorResponse(error, actionName) };
  }
}

export async function batchDeleteSubnetsAction(ids: string[], performingUserId?: string): Promise<BatchDeleteResult> {
  const actionName = 'batchDeleteSubnetsAction';
  const auditUser = await getAuditUserInfo(performingUserId);
  let successCount = 0;
  const failureDetails: BatchOperationFailure[] = [];
  const deletedSubnetCidrs: string[] = [];

  for (const id of ids) {
    try {
      const subnetToDelete = await prisma.subnet.findUnique({ where: { id }, include: { vlan: true } });
      if (!subnetToDelete) {
        failureDetails.push({ id, itemIdentifier: `ID ${id}`, error: '子网未找到。' });
        continue;
      }
      if (subnetToDelete.vlanId && subnetToDelete.vlanId.trim() !== "") {
        const vlanNumberForMessage = subnetToDelete.vlan ? `VLAN ${subnetToDelete.vlan.vlanNumber}` : `VLAN (ID: ${subnetToDelete.vlanId})`;
        throw new ResourceError(
          `子网 ${subnetToDelete.cidr} 已关联到 ${vlanNumberForMessage}，无法删除。`,
          'SUBNET_HAS_VLAN_ASSOCIATION_BATCH',
          `子网 ${subnetToDelete.cidr} 已关联到 ${vlanNumberForMessage}。请先解除其 VLAN 关联。`
        );
      }
      const allocatedIpsCount = await prisma.iPAddress.count({ where: { subnetId: id, status: 'allocated' } });
      if (allocatedIpsCount > 0) {
        throw new ResourceError(
          `子网 ${subnetToDelete.cidr} 中仍有 ${allocatedIpsCount} 个已分配的 IP 地址，无法删除。`,
          'SUBNET_HAS_ALLOCATED_IPS_BATCH',
          `子网 ${subnetToDelete.cidr} 仍包含已分配的 IP 地址。`
        );
      }
      const reservedIpsCount = await prisma.iPAddress.count({ where: { subnetId: id, status: 'reserved' } });
      if (reservedIpsCount > 0) {
        throw new ResourceError(
          `子网 ${subnetToDelete.cidr} 中仍有 ${reservedIpsCount} 个预留的 IP 地址，无法删除。`,
          'SUBNET_HAS_RESERVED_IPS_BATCH',
          `子网 ${subnetToDelete.cidr} 仍包含预留的 IP 地址。`
        );
      }
      const freeIpsInSubnet = await prisma.iPAddress.findMany({ where: { subnetId: id, status: 'free' } });
      for (const ip of freeIpsInSubnet) {
        await prisma.iPAddress.update({
          where: { id: ip.id },
          data: { subnet: { disconnect: true }, vlan: { disconnect: true } },
        });
      }
      await prisma.subnet.delete({ where: { id } });
      deletedSubnetCidrs.push(subnetToDelete.cidr);
      successCount++;
    } catch (error: unknown) {
      const errorResponse = createActionErrorResponse(error, `${actionName}_single`);
      const itemIdentifier = (await prisma.subnet.findUnique({ where: { id } }))?.cidr || `ID ${id}`;
      failureDetails.push({ id, itemIdentifier, error: errorResponse.userMessage });
    }
  }

  if (deletedSubnetCidrs.length > 0) {
    await prisma.auditLog.create({
      data: {
        userId: auditUser.userId,
        username: auditUser.username,
        action: 'batch_delete_subnet',
        details: `批量删除了 ${deletedSubnetCidrs.length} 个子网: ${deletedSubnetCidrs.join(', ')}。失败 ${failureDetails.length} 个。`
      }
    });
    revalidatePath("/subnets");
    revalidatePath("/ip-addresses");
    revalidatePath("/dashboard");
    revalidatePath("/query");
  }
  logger.info(`批量删除子网完成：成功 ${successCount}，失败 ${failureDetails.length}`, { successCount, failureCount: failureDetails.length }, actionName);
  return { successCount, failureCount: failureDetails.length, failureDetails };
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
      throw new ResourceError(`VLAN ${data.vlanNumber} 已存在。`, 'VLAN_EXISTS', `VLAN ${data.vlanNumber} 已存在，无法重复创建。`, 'vlanNumber');
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
    revalidatePath("/query");
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
        throw new ResourceError(`VLAN ${vlanInput.vlanNumber} 已存在。`, 'VLAN_EXISTS', undefined, 'vlanNumber');
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
  if (successCount > 0) { revalidatePath("/vlans"); revalidatePath("/query"); }
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
          throw new ResourceError(`已存在另一个 VLAN 号码为 ${data.vlanNumber} 的 VLAN。`, 'VLAN_EXISTS', `VLAN 号码 ${data.vlanNumber} 已被其他 VLAN 使用。`, 'vlanNumber');
        }
      }
      updatePayload.vlanNumber = data.vlanNumber;
    }
    if (data.hasOwnProperty('description')) {
      updatePayload.description = (data.description === "" || data.description === undefined) ? null : data.description;
    }

    if (Object.keys(updatePayload).length === 0) {
        logger.info('No changes detected for VLAN update.', { vlanId: id, inputData: data }, actionName);
        const subnetCount = await prisma.subnet.count({ where: { vlanId: id } });
        const directIpCount = await prisma.iPAddress.count({ where: { vlanId: id }});
        const currentVLANApp: AppVLAN = { ...vlanToUpdate, description: vlanToUpdate.description || undefined, subnetCount: subnetCount + directIpCount };
        return { success: true, data: currentVLANApp };
    }

    const updatedVLAN = await prisma.vLAN.update({ where: { id }, data: updatePayload });
    await prisma.auditLog.create({
      data: { userId: auditUser.userId, username: auditUser.username, action: 'update_vlan', details: `更新了 VLAN ${updatedVLAN.vlanNumber}` }
    });

    revalidatePath("/vlans");
    revalidatePath("/subnets");
    revalidatePath("/ip-addresses");
    revalidatePath("/query");
    const subnetCount = await prisma.subnet.count({ where: { vlanId: updatedVLAN.id } });
    const directIpCount = await prisma.iPAddress.count({ where: { vlanId: updatedVLAN.id }});
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
    revalidatePath("/query");
    logger.info('VLAN 删除成功', { vlanId: id, vlanNumber: vlanToDelete.vlanNumber }, actionName);
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: createActionErrorResponse(error, actionName) };
  }
}

export async function batchDeleteVLANsAction(ids: string[], performingUserId?: string): Promise<BatchDeleteResult> {
  const actionName = 'batchDeleteVLANsAction';
  const auditUser = await getAuditUserInfo(performingUserId);
  let successCount = 0;
  const failureDetails: BatchOperationFailure[] = [];
  const deletedVlanNumbers: number[] = [];

  for (const id of ids) {
    try {
      const vlanToDelete = await prisma.vLAN.findUnique({ where: { id } });
      if (!vlanToDelete) {
        failureDetails.push({ id, itemIdentifier: `ID ${id}`, error: 'VLAN 未找到。' });
        continue;
      }
      const subnetsUsingVlanCount = await prisma.subnet.count({ where: { vlanId: id } });
      if (subnetsUsingVlanCount > 0) {
        throw new ResourceError(
          `VLAN ${vlanToDelete.vlanNumber} 已分配给 ${subnetsUsingVlanCount} 个子网。`,
          'VLAN_IN_USE_SUBNET_BATCH',
          `VLAN ${vlanToDelete.vlanNumber} 仍被 ${subnetsUsingVlanCount} 个子网使用。`
        );
      }
      const ipsUsingVlanDirectlyCount = await prisma.iPAddress.count({ where: { vlanId: id } });
      if (ipsUsingVlanDirectlyCount > 0) {
        throw new ResourceError(
          `VLAN ${vlanToDelete.vlanNumber} 已直接分配给 ${ipsUsingVlanDirectlyCount} 个 IP 地址。`,
          'VLAN_IN_USE_IP_BATCH',
          `VLAN ${vlanToDelete.vlanNumber} 仍被 ${ipsUsingVlanDirectlyCount} 个 IP 地址直接使用。`
        );
      }
      await prisma.vLAN.delete({ where: { id } });
      deletedVlanNumbers.push(vlanToDelete.vlanNumber);
      successCount++;
    } catch (error: unknown) {
      const errorResponse = createActionErrorResponse(error, `${actionName}_single`);
      const itemIdentifier = (await prisma.vLAN.findUnique({ where: { id } }))?.vlanNumber.toString() || `ID ${id}`;
      failureDetails.push({ id, itemIdentifier: `VLAN ${itemIdentifier}`, error: errorResponse.userMessage });
    }
  }

  if (deletedVlanNumbers.length > 0) {
    await prisma.auditLog.create({
      data: {
        userId: auditUser.userId,
        username: auditUser.username,
        action: 'batch_delete_vlan',
        details: `批量删除了 ${deletedVlanNumbers.length} 个 VLAN: ${deletedVlanNumbers.join(', ')}。失败 ${failureDetails.length} 个。`
      }
    });
    revalidatePath("/vlans");
    revalidatePath("/subnets");
    revalidatePath("/ip-addresses");
    revalidatePath("/query");
  }
  logger.info(`批量删除 VLAN 完成：成功 ${successCount}，失败 ${failureDetails.length}`, { successCount, failureCount: failureDetails.length }, actionName);
  return { successCount, failureCount: failureDetails.length, failureDetails };
}

type PrismaIPAddressWithRelations = Prisma.IPAddressGetPayload<{
  include: {
    subnet: {
      include: {
        vlan: true;
      };
    };
    vlan: true;
  };
}>;


export type AppIPAddressWithRelations = AppIPAddress & {
  subnet?: { id: string; cidr: string; networkAddress: string; vlan?: { vlanNumber: number } | null } | null;
  vlan?: { vlanNumber: number } | null;
};

export async function getIPAddressesAction(params?: FetchParams): Promise<PaginatedResponse<AppIPAddressWithRelations>> {
  const actionName = 'getIPAddressesAction';
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

  const includeClause = {
    subnet: { // Include the full Subnet object related to the IPAddress
      include: { // And within that Subnet object, include its related VLAN object
        vlan: true,
      },
    },
    vlan: true, // Include the full VLAN object directly related to the IPAddress
  };

  let paginatedDbItems: PrismaIPAddressWithRelations[];
  let finalTotalCount: number;

  if (params?.subnetId) {
    const allIpsInSubnetUnsorted = await prisma.iPAddress.findMany({
      where: whereClause,
      include: includeClause,
    }) as PrismaIPAddressWithRelations[];

    const allIpsInSubnetSorted = allIpsInSubnetUnsorted.sort((a, b) => compareIpStrings(a.ipAddress, b.ipAddress));
    finalTotalCount = allIpsInSubnetSorted.length;
    paginatedDbItems = allIpsInSubnetSorted.slice(skip, skip + pageSize);

  } else {
    const orderByClause: Prisma.IPAddressOrderByWithRelationInput[] = [
      { subnet: { networkAddress: 'asc' } }, // Sort by subnet first
      // Prisma doesn't directly support sorting by IP address string numerically in a cross-db way easily.
      // If this becomes an issue, we might need to fetch then sort in JS, or add raw SQL for specific DBs.
      // For now, we rely on string sort or the order they come from DB if subnet is null.
      // For IPs within the same subnet (or null subnet), sorting by 'ipAddress' (string) is lexicographical.
      // This is generally acceptable for display but not perfectly numeric.
      { ipAddress: 'asc' },
    ];


    if (params?.page && params?.pageSize) {
        finalTotalCount = await prisma.iPAddress.count({ where: whereClause });
        paginatedDbItems = await prisma.iPAddress.findMany({
            where: whereClause,
            include: includeClause,
            orderBy: orderByClause,
            skip: skip,
            take: pageSize,
        }) as PrismaIPAddressWithRelations[];
    } else {
        const allIPs = await prisma.iPAddress.findMany({
            where: whereClause,
            include: includeClause,
            orderBy: orderByClause,
        }) as PrismaIPAddressWithRelations[];
        finalTotalCount = allIPs.length;
        paginatedDbItems = allIPs;
    }
  }

  const totalPages = (pageSize > 0 && finalTotalCount > 0)
    ? Math.ceil(finalTotalCount / pageSize)
    : 1;

  const appIps: AppIPAddressWithRelations[] = paginatedDbItems.map(ip => ({
    id: ip.id,
    ipAddress: ip.ipAddress,
    status: ip.status as AppIPAddressStatusType,
    allocatedTo: ip.allocatedTo || undefined,
    description: ip.description || undefined,
    lastSeen: ip.lastSeen?.toISOString() || undefined,
    subnetId: ip.subnetId || undefined,
    vlanId: ip.vlanId || undefined,
    subnet: ip.subnet ? {
      id: ip.subnet.id,
      cidr: ip.subnet.cidr,
      networkAddress: ip.subnet.networkAddress,
      vlan: ip.subnet.vlan ? { vlanNumber: ip.subnet.vlan.vlanNumber } : null,
    } : null,
    vlan: ip.vlan ? { vlanNumber: ip.vlan.vlanNumber } : null,
  }));

  return {
    data: appIps,
    totalCount: finalTotalCount,
    currentPage: page,
    totalPages: totalPages,
    pageSize: pageSize
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
              throw new NotFoundError(`子网 ID: ${data.subnetId}`, `选择的子网不存在。`, 'subnetId');
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
              throw new ResourceError(`IP ${data.ipAddress} 已存在于子网 ${targetSubnet.networkAddress} 中。`, 'IP_EXISTS_IN_SUBNET', `IP 地址 ${data.ipAddress} 已存在于所选子网中。`, 'ipAddress');
            }
        } else { // No subnetId provided, check globally
            const globallyExistingIP = await prisma.iPAddress.findFirst({ where: { ipAddress: data.ipAddress, subnetId: null } });
            if (globallyExistingIP) {
              throw new ResourceError(`IP ${data.ipAddress} 已存在于全局池中 (未分配给任何子网)。`, 'IP_EXISTS_GLOBALLY', `IP 地址 ${data.ipAddress} 已存在于全局池中。`, 'ipAddress');
            }
        }

        const createPayload: Prisma.IPAddressCreateInput = {
            ipAddress: data.ipAddress,
            status: prismaStatus,
            allocatedTo: data.allocatedTo || null,
            description: data.description || null,
            lastSeen: data.lastSeen ? new Date(data.lastSeen) : null,
        };

        if (data.subnetId) {
            createPayload.subnet = { connect: { id: data.subnetId } };
        }

        // Handle vlanId: if undefined or empty string, do not connect. If null, Prisma might error if not nullable.
        // If it's an actual ID, connect.
        if (data.vlanId === null) {
          // Explicitly do nothing if vlanId is null, meaning "no direct VLAN" or "inherit"
        } else if (data.vlanId && data.vlanId.trim() !== "") {
            const vlanExists = await prisma.vLAN.findUnique({ where: { id: data.vlanId }});
            if (!vlanExists) {
              throw new NotFoundError(`VLAN ID: ${data.vlanId}`, `为 IP 地址选择的 VLAN 不存在。`, 'vlanId');
            }
            createPayload.vlan = { connect: { id: data.vlanId } };
        }

        const newIP = await prisma.iPAddress.create({ data: createPayload });

        const subnetCidr = data.subnetId ? (await prisma.subnet.findUnique({where: {id: data.subnetId}}))?.cidr : null;
        const subnetInfo = subnetCidr ? ` 在子网 ${subnetCidr} 中` : ' 在全局池中';
        const vlanInfoLog = (data.vlanId && data.vlanId.trim() !== "") ? ` 使用 VLAN ${(await prisma.vLAN.findUnique({where: {id:data.vlanId}}))?.vlanNumber}`: '';

        await prisma.auditLog.create({
            data: { userId: auditUser.userId, username: auditUser.username, action: 'create_ip_address', details: `创建了 IP ${newIP.ipAddress}${subnetInfo}${vlanInfoLog}，状态为 ${data.status}。` }
        });

        revalidatePath("/ip-addresses");
        revalidatePath("/dashboard");
        revalidatePath("/subnets");
        revalidatePath("/query");
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
  vlanId?: string | null;
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
      throw new NotFoundError(`子网 ID: ${subnetId}`, "未找到批量创建的目标子网。", 'subnetId');
    }
    const parsedTargetSubnetCidr = getSubnetPropertiesFromCidr(targetSubnet.cidr);
    if (!parsedTargetSubnetCidr) {
      throw new AppError(`目标子网 ${targetSubnet.cidr} 的 CIDR 配置无效。`, 500, 'SUBNET_CIDR_INVALID_FOR_BATCH');
    }

    // Validate VLAN if provided
    if (vlanId && vlanId.trim() !== "") { // Note: vlanId can be null for "inherit"
      const vlanExists = await prisma.vLAN.findUnique({ where: { id: vlanId } });
      if (!vlanExists) {
        throw new NotFoundError(`VLAN ID: ${vlanId}`, "为批量 IP 创建选择的 VLAN 不存在。", 'vlanId');
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
          throw new ResourceError(`IP ${currentIpStr} 已存在于子网 ${targetSubnet.networkAddress} 中。`, 'IP_EXISTS_IN_SUBNET', undefined, 'startIp/endIp');
        }

        const createPayload: Prisma.IPAddressCreateInput = {
            ipAddress: currentIpStr,
            status: status, // status is AppIPAddressStatusType, compatible with string
            allocatedTo: status === 'allocated' ? (description || '批量分配') : null,
            description: description || null,
            // lastSeen is not set in batch creation
        };
        if (subnetId) { // Should always be true given the payload structure
            createPayload.subnet = { connect: { id: subnetId } };
        }

        // Handle vlanId: if undefined or empty string or null, do not connect.
        // If it's an actual ID, connect.
        if (vlanId && vlanId.trim() !== "") {
            createPayload.vlan = { connect: { id: vlanId } };
        }
        // If vlanId is null, undefined, or empty, it means no direct VLAN or inherit from subnet.
        // Prisma handles this correctly if `vlan` is not in createPayload.

        await prisma.iPAddress.create({ data: createPayload });
        createdIpAddressesForAudit.push(currentIpStr);
        successCount++;
      } catch (e: unknown) {
        const errorResponse = createActionErrorResponse(e, 'batchCreateIPAddressesAction_single');
        failureDetails.push({ ipAttempted: currentIpStr, error: errorResponse.userMessage });
      }
    }
  } catch (e: unknown) { // Catch errors from initial setup (subnet/vlan validation, IP range)
      const errorResponse = createActionErrorResponse(e, 'batchCreateIPAddressesAction_setup');
      // For setup errors, report a single failure for the whole batch
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
    revalidatePath("/query");
  }
  return { successCount, failureDetails };
}


export interface UpdateIPAddressData {
  ipAddress?: string;
  subnetId?: string | undefined; // Allow undefined for clearing subnet
  vlanId?: string | null | undefined; // Explicitly allow string, null, or undefined
  status?: AppIPAddressStatusType;
  allocatedTo?: string | null | undefined;
  description?: string | null | undefined;
  lastSeen?: string | null | undefined;
}

export async function updateIPAddressAction(
  id: string,
  data: UpdateIPAddressData,
  performingUserId?: string
): Promise<ActionResponse<AppIPAddress>> {
  const actionName = 'updateIPAddressAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    const ipToUpdate = await prisma.iPAddress.findUnique({ where: { id } });
    if (!ipToUpdate) {
      throw new NotFoundError(`IP 地址 ID: ${id}`, `要更新的 IP 地址未找到。`);
    }

    const updateData: Prisma.IPAddressUpdateInput = {};
    let finalIpAddress = ipToUpdate.ipAddress; // Assume IP doesn't change unless specified

    // Handle IP Address change
    if (data.hasOwnProperty('ipAddress') && data.ipAddress !== undefined && data.ipAddress !== ipToUpdate.ipAddress) {
      const ipParts = data.ipAddress.split('.').map(Number);
      if (ipParts.some(part => isNaN(part) || part < 0 || part > 255) || ipParts.length !== 4) {
          throw new ValidationError(`无效的 IP 地址格式更新: ${data.ipAddress}`, 'ipAddress', data.ipAddress);
      }
      updateData.ipAddress = data.ipAddress;
      finalIpAddress = data.ipAddress; // Update finalIpAddress for subsequent checks
    }

    // Handle other scalar fields
    if (data.hasOwnProperty('status') && data.status !== undefined) updateData.status = data.status as string;
    if (data.hasOwnProperty('allocatedTo')) updateData.allocatedTo = (data.allocatedTo === undefined || data.allocatedTo === "") ? null : data.allocatedTo;
    if (data.hasOwnProperty('description')) updateData.description = (data.description === undefined || data.description === "") ? null : data.description;
    if (data.hasOwnProperty('lastSeen')) updateData.lastSeen = data.lastSeen ? new Date(data.lastSeen) : null;


    // Handle VLAN ID change
    if (data.hasOwnProperty('vlanId')) { // Check if vlanId was explicitly passed in data
        const vlanIdToSet = data.vlanId; // string | null | undefined

        if (vlanIdToSet === null) { // User wants to remove direct VLAN association
            updateData.vlan = { disconnect: true };
        } else if (vlanIdToSet) { // User wants to set/change direct VLAN association
            if (!(await prisma.vLAN.findUnique({where: {id: vlanIdToSet}}))) {
                throw new NotFoundError(`VLAN ID: ${vlanIdToSet}`, `为 IP 地址选择的 VLAN 不存在。`, 'vlanId');
            }
            updateData.vlan = { connect: { id: vlanIdToSet } };
        }
        // If vlanIdToSet is undefined, it means no change to vlanId was intended by the form for this field specifically
    }

    // Handle Subnet ID change and IP validation within subnet
    const newSubnetId = data.hasOwnProperty('subnetId') ? (data.subnetId || undefined) : ipToUpdate.subnetId; // Use current if not provided or explicitly empty (becomes undefined)
    const finalStatus = data.status ? data.status as string : ipToUpdate.status;


    if (data.hasOwnProperty('subnetId')) { // Subnet change was explicitly part of the update data
        if (newSubnetId) { // Moving to a new subnet or confirming current subnet
            const targetSubnet = await prisma.subnet.findUnique({ where: { id: newSubnetId } });
            if (!targetSubnet) throw new NotFoundError(`子网 ID: ${newSubnetId}`, "目标子网不存在。", 'subnetId');
            const parsedTargetSubnetCidr = getSubnetPropertiesFromCidr(targetSubnet.cidr);
            if (!parsedTargetSubnetCidr) throw new AppError(`目标子网 ${targetSubnet.cidr} 的 CIDR 无效。`, 500, 'SUBNET_CIDR_INVALID_FOR_IP_CHECK');

            if (!isIpInCidrRange(finalIpAddress, parsedTargetSubnetCidr)) {
              throw new ValidationError(`IP ${finalIpAddress} 不在子网 ${targetSubnet.cidr} 的范围内。`, 'ipAddress/subnetId', finalIpAddress);
            }
            // Check for conflict only if IP or subnet is changing
            if (finalIpAddress !== ipToUpdate.ipAddress || newSubnetId !== ipToUpdate.subnetId) {
                const conflictingIP = await prisma.iPAddress.findFirst({ where: { ipAddress: finalIpAddress, subnetId: newSubnetId, NOT: { id } } });
                if (conflictingIP) throw new ResourceError(`IP ${finalIpAddress} 已存在于子网 ${targetSubnet.networkAddress} 中。`, 'IP_EXISTS_IN_SUBNET', undefined, 'ipAddress');
            }
            updateData.subnet = { connect: { id: newSubnetId } };
        } else { // Clearing subnet (subnetId is undefined or explicitly null from form and becomes undefined)
            if (finalStatus === 'allocated' || finalStatus === 'reserved') {
                throw new ValidationError("对于“已分配”或“预留”状态的 IP，必须选择一个子网。", 'subnetId', finalStatus);
            }
            // Check for global conflict if IP is changing or subnet is being removed
            if (finalIpAddress !== ipToUpdate.ipAddress || ipToUpdate.subnetId !== null) {
                const globallyConflictingIP = await prisma.iPAddress.findFirst({ where: { ipAddress: finalIpAddress, subnetId: null, NOT: { id } } });
                if (globallyConflictingIP) throw new ResourceError(`IP ${finalIpAddress} 已存在于全局池中。`, 'IP_EXISTS_GLOBALLY', undefined, 'ipAddress');
            }
            updateData.subnet = { disconnect: true };
        }
    } else if (newSubnetId && (finalIpAddress !== ipToUpdate.ipAddress)) {
        // SubnetId was not in data (no change intended), but IP address changed. Validate against current subnet.
        const currentSubnet = await prisma.subnet.findUnique({ where: { id: newSubnetId } }); // newSubnetId is ipToUpdate.subnetId here
        if (!currentSubnet) throw new NotFoundError(`当前子网 ID: ${newSubnetId}`, "IP 的当前子网未找到。", 'subnetId');
        const parsedCurrentSubnetCidr = getSubnetPropertiesFromCidr(currentSubnet.cidr);
        if (!parsedCurrentSubnetCidr) throw new AppError(`当前子网 ${currentSubnet.cidr} 的 CIDR 无效。`, 500, 'SUBNET_CIDR_INVALID_FOR_IP_CHECK');
        if (!isIpInCidrRange(finalIpAddress, parsedCurrentSubnetCidr)) {
          throw new ValidationError(`新 IP ${finalIpAddress} 不在当前子网 ${currentSubnet.cidr} 的范围内。`, 'ipAddress', finalIpAddress);
        }
        const conflictingIP = await prisma.iPAddress.findFirst({ where: { ipAddress: finalIpAddress, subnetId: newSubnetId, NOT: { id } } });
        if (conflictingIP) throw new ResourceError(`新 IP ${finalIpAddress} 已存在于子网 ${currentSubnet.networkAddress} 中。`, 'IP_EXISTS_IN_SUBNET', undefined, 'ipAddress');
    }


    const updatedIP = await prisma.iPAddress.update({ where: { id }, data: updateData });
    await prisma.auditLog.create({
      data: { userId: auditUser.userId, username: auditUser.username, action: 'update_ip_address', details: `更新了 IP ${updatedIP.ipAddress}` }
    });

    revalidatePath("/ip-addresses");
    revalidatePath("/dashboard");
    revalidatePath("/subnets");
    revalidatePath("/query");
    const appIp: AppIPAddress = { ...updatedIP, subnetId: updatedIP.subnetId || undefined, vlanId: updatedIP.vlanId || undefined, allocatedTo: updatedIP.allocatedTo || undefined, description: updatedIP.description || undefined, lastSeen: updatedIP.lastSeen?.toISOString(), status: updatedIP.status as AppIPAddressStatusType };
    logger.info('IP 地址更新成功', { ipId: appIp.id }, actionName);
    return { success: true, data: appIp };
  } catch (error: unknown) {
    logger.error(`Error in ${actionName} for IP ${id}`, error as Error, { inputData: data });
    return { success: false, error: createActionErrorResponse(error, actionName) };
  }
}


export async function deleteIPAddressAction(id: string, performingUserId?: string): Promise<ActionResponse> {
  const actionName = 'deleteIPAddressAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    const ipToDelete = await prisma.iPAddress.findUnique({
      where: { id },
      include: {
        subnet: { select: { cidr: true, vlanId: true, vlan: { select: { vlanNumber: true } } } },
        vlan: { select: { vlanNumber: true } },
      },
    });

    if (!ipToDelete) {
      throw new NotFoundError(`IP 地址 ID: ${id}`, `要删除的 IP 地址未找到。`);
    }

    if (ipToDelete.status === 'allocated' || ipToDelete.status === 'reserved') {
      throw new ResourceError(
        `IP 地址 ${ipToDelete.ipAddress} 状态为 "${ipToDelete.status}"。`,
        'IP_ADDRESS_IN_USE_STATUS',
        `无法删除 IP 地址 ${ipToDelete.ipAddress}，因为其状态为 "${ipToDelete.status === 'allocated' ? '已分配' : '预留'}"。请先将其状态更改为空闲。`
      );
    }

    const hasDirectVlan = ipToDelete.vlanId && ipToDelete.vlanId.trim() !== "";
    if (hasDirectVlan) {
      const directVlanNumber = ipToDelete.vlan?.vlanNumber || ipToDelete.vlanId;
      throw new ResourceError(
        `IP 地址 ${ipToDelete.ipAddress} 直接关联到 VLAN ${directVlanNumber}。`,
        'IP_ADDRESS_HAS_DIRECT_VLAN',
        `无法删除 IP 地址 ${ipToDelete.ipAddress}，因为它直接关联到 VLAN ${directVlanNumber}。请先移除其 VLAN 关联 (在 IP 地址编辑中设为“从子网继承或无”)。`
      );
    }

    await prisma.iPAddress.delete({ where: { id } });
    await prisma.auditLog.create({
      data: { userId: auditUser.userId, username: auditUser.username, action: 'delete_ip_address', details: `删除了 IP ${ipToDelete.ipAddress}` }
    });

    revalidatePath("/ip-addresses");
    revalidatePath("/dashboard");
    revalidatePath("/subnets");
    revalidatePath("/query");
    logger.info('IP 地址删除成功', { ipId: id, ipAddress: ipToDelete.ipAddress }, actionName);
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: createActionErrorResponse(error, actionName) };
  }
}

export async function batchDeleteIPAddressesAction(ids: string[], performingUserId?: string): Promise<BatchDeleteResult> {
  const actionName = 'batchDeleteIPAddressesAction';
  const auditUser = await getAuditUserInfo(performingUserId);
  let successCount = 0;
  const failureDetails: BatchOperationFailure[] = [];
  const deletedIpAddresses: string[] = [];

  for (const id of ids) {
    try {
      const ipToDelete = await prisma.iPAddress.findUnique({
        where: { id },
        include: { vlan: { select: { vlanNumber: true } } }
      });
      if (!ipToDelete) {
        failureDetails.push({ id, itemIdentifier: `ID ${id}`, error: 'IP 地址未找到。' });
        continue;
      }
      if (ipToDelete.status === 'allocated' || ipToDelete.status === 'reserved') {
        throw new ResourceError(
          `IP 地址 ${ipToDelete.ipAddress} 状态为 "${ipToDelete.status}"。`,
          'IP_ADDRESS_IN_USE_STATUS_BATCH',
          `IP ${ipToDelete.ipAddress} 状态为 "${ipToDelete.status === 'allocated' ? '已分配' : '预留'}"。`
        );
      }
      if (ipToDelete.vlanId && ipToDelete.vlanId.trim() !== "") {
         const directVlanNumber = ipToDelete.vlan?.vlanNumber || ipToDelete.vlanId;
        throw new ResourceError(
          `IP 地址 ${ipToDelete.ipAddress} 直接关联到 VLAN ${directVlanNumber}。`,
          'IP_ADDRESS_HAS_DIRECT_VLAN_BATCH',
          `IP ${ipToDelete.ipAddress} 直接关联到 VLAN ${directVlanNumber}。`
        );
      }
      await prisma.iPAddress.delete({ where: { id } });
      deletedIpAddresses.push(ipToDelete.ipAddress);
      successCount++;
    } catch (error: unknown) {
      const errorResponse = createActionErrorResponse(error, `${actionName}_single`);
      const itemIdentifier = (await prisma.iPAddress.findUnique({ where: { id } }))?.ipAddress || `ID ${id}`;
      failureDetails.push({ id, itemIdentifier, error: errorResponse.userMessage });
    }
  }

  if (deletedIpAddresses.length > 0) {
    await prisma.auditLog.create({
      data: {
        userId: auditUser.userId,
        username: auditUser.username,
        action: 'batch_delete_ip_address',
        details: `批量删除了 ${deletedIpAddresses.length} 个 IP 地址: ${deletedIpAddresses.join(', ')}。失败 ${failureDetails.length} 个。`
      }
    });
    revalidatePath("/ip-addresses");
    revalidatePath("/dashboard");
    revalidatePath("/subnets");
    revalidatePath("/query");
  }
  logger.info(`批量删除 IP 地址完成：成功 ${successCount}，失败 ${failureDetails.length}`, { successCount, failureCount: failureDetails.length }, actionName);
  return { successCount, failureCount: failureDetails.length, failureDetails };
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
      throw new ResourceError(`提供的邮箱 '${data.email}' 已被其他用户使用。`, 'USER_EMAIL_EXISTS', `邮箱 '${data.email}' 已被注册。`, 'email');
    }
    if (await prisma.user.findUnique({ where: { username: data.username } })) {
      throw new ResourceError(`提供的用户名 '${data.username}' 已被其他用户使用。`, 'USER_USERNAME_EXISTS', `用户名 '${data.username}' 已被注册。`, 'username');
    }
    const roleExists = await prisma.role.findUnique({ where: { id: data.roleId }, include: {permissions: true} });
    if (!roleExists || !roleExists.name) {
      throw new NotFoundError(`角色 ID: ${data.roleId}`, `选择的角色不存在或无效。`, 'roleId');
    }

    const createPayload: Prisma.UserCreateInput = {
        username: data.username,
        email: data.email,
        password: data.password,
        avatar: data.avatar || '/images/avatars/default_avatar.png',
        lastLogin: new Date(),
        role: { connect: { id: data.roleId } }
    };

    const newUser = await prisma.user.create({
      data: createPayload,
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
    const userToUpdate = await prisma.user.findUnique({
      where: { id },
      include: { role: true },
    });
    if (!userToUpdate) {
      throw new NotFoundError(`用户 ID: ${id}`, `要更新的用户未找到。`);
    }
    if (!userToUpdate.role || !userToUpdate.role.name) {
      throw new AppError(`用户 ${id} 没有关联的角色或角色名无效。`, 500, 'USER_MISSING_ROLE_ON_UPDATE', `用户 ${userToUpdate.username} 的角色信息丢失，无法更新。`);
    }

    const updateData: Prisma.UserUpdateInput = {};
    if (data.hasOwnProperty('username') && data.username !== undefined && data.username !== userToUpdate.username) {
      if (await prisma.user.findFirst({ where: { username: data.username, NOT: { id } } })) {
        throw new ResourceError(`提供的用户名 '${data.username}' 已被其他用户使用。`, 'USER_USERNAME_EXISTS', `用户名 '${data.username}' 已被占用。`, 'username');
      }
      updateData.username = data.username;
    }
    if (data.hasOwnProperty('email') && data.email !== undefined && data.email !== userToUpdate.email) {
      if (await prisma.user.findFirst({ where: { email: data.email, NOT: { id } } })) {
        throw new ResourceError(`提供的邮箱 '${data.email}' 已被其他用户使用。`, 'USER_EMAIL_EXISTS', `邮箱 '${data.email}' 已被占用。`, 'email');
      }
      updateData.email = data.email;
    }
    if (data.hasOwnProperty('roleId') && data.roleId !== undefined && data.roleId !== userToUpdate.roleId) {
      const newRole = await prisma.role.findUnique({ where: { id: data.roleId } });
      if (!newRole || !newRole.name) {
        throw new NotFoundError(`角色 ID: ${data.roleId}`, `选择的角色不存在或无效。`, 'roleId');
      }

      // Prevent changing the last Administrator's role
      if (userToUpdate.role.name === 'Administrator' && newRole.name !== 'Administrator') {
        const adminCount = await prisma.user.count({
          where: { role: { name: 'Administrator' } },
        });
        if (adminCount <= 1) {
          throw new ResourceError(
            '无法更改最后一位管理员的角色。',
            'LAST_ADMIN_ROLE_CHANGE_NOT_ALLOWED',
            '系统中必须至少保留一名管理员。无法更改最后一名管理员的角色。',
            'roleId'
          );
        }
      }
      updateData.role = { connect: { id: data.roleId } };
    }
    if (data.hasOwnProperty('avatar')) {
      updateData.avatar = (data.avatar === "" || data.avatar === undefined) ? '/images/avatars/default_avatar.png' : data.avatar;
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

    if (!updatedUser.role || !updatedUser.role.name) { // Should not happen if role update logic is sound
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
      throw new AppError("无法删除用户：关联的角色信息无效。", 500, 'USER_ROLE_INVALID_PRE_DELETE', "无法删除用户，因为其角色信息已损坏。");
    }

    if (performingUserId && id === performingUserId) { // Check if the user is trying to delete themselves
        throw new ResourceError("无法删除当前登录的用户。", "DELETE_SELF_NOT_ALLOWED", "您不能删除自己的账户。");
    }

    if (userToDelete.role.name === "Administrator") {
      const adminCount = await prisma.user.count({ where: { role: { name: "Administrator" } } });
      if (adminCount <= 1) {
        throw new ResourceError("无法删除最后一个管理员用户。", "LAST_ADMIN_DELETE_NOT_ALLOWED", "系统中必须至少保留一个管理员用户。");
      }
    }

    // Update AuditLogs before deleting the user
    await prisma.auditLog.updateMany({
      where: { userId: id },
      data: { userId: null, username: `已删除用户 (${userToDelete.username})` } // Or some other placeholder
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
    if (!role.name) { // Should not happen if DB data is consistent
        logger.error(`Role ${role.id} has a missing name in getRolesAction.`, new AppError("Role name missing"), {roleId: role.id});
        // Fallback to a default role name if absolutely necessary, or handle error differently
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

    // Prevent changing Administrator role's permissions
    if (roleToUpdate.id === ADMIN_ROLE_ID && data.permissions) {
        throw new ResourceError(
            '无法修改内置 "Administrator" 角色的权限。',
            'ADMIN_ROLE_PERMISSIONS_FIXED',
            '系统内置的 "Administrator" 角色的权限集是固定的，无法修改。您可以修改其描述。',
            'permissions'
        );
    }

    const updateData: Prisma.RoleUpdateInput = {};
    if (data.hasOwnProperty('description')) {
      updateData.description = (data.description === undefined || data.description === "") ? null : data.description;
    }

    // Only update permissions if they are provided AND it's not the Administrator role
    if (data.permissions && roleToUpdate.id !== ADMIN_ROLE_ID) {
      // Validate permissions before setting
      const validPermissionIds = mockPermissions.map(p => p.id);
      const allProvidedPermissionsAreValid = data.permissions.every(pid => validPermissionIds.includes(pid));
      if (!allProvidedPermissionsAreValid) {
        throw new ValidationError('提供的权限列表中包含无效的权限ID。', 'permissions');
      }
      const prismaPermissions = data.permissions.map(appPermId => ({ id: appPermId as string }));
      updateData.permissions = { set: prismaPermissions };
    } else if (data.permissions && roleToUpdate.id === ADMIN_ROLE_ID) {
        // This case should be caught above, but log if somehow reached
        logger.warn('Attempted to set permissions for ADMIN_ROLE_ID in updateRoleAction despite check.', undefined, { roleId: id, permissionsAttempted: data.permissions });
    }

    if (Object.keys(updateData).length === 0) {
        logger.info('No changes detected for role update.', { roleId: id, inputData: data }, actionName);
        // Fetch current state to return
        const currentRole = await prisma.role.findUnique({where: {id}, include: {_count: {select: {users:true}}, permissions: true}});
        if (!currentRole || !currentRole.name) throw new AppError("Failed to fetch current role details after no-op update.");
        const currentRoleApp: AppRole = {
             id: currentRole.id,
             name: currentRole.name as AppRoleNameType,
             description: currentRole.description || undefined,
             userCount: currentRole._count.users,
             permissions: currentRole.permissions.map(p => p.id as AppPermissionIdType)
        };
        return { success: true, data: currentRoleApp };
    }

    const updatedRole = await prisma.role.update({
      where: { id },
      data: updateData,
      include: { permissions: true, _count: { select: { users: true } } }
    });

    if (!updatedRole.name) { // Should not happen if DB data is consistent
        throw new AppError("更新角色后，角色名称信息无效。", 500, 'ROLE_NAME_INVALID_POST_UPDATE');
    }

    let auditDetails = `更新了角色 ${updatedRole.name}。`;
    if (data.hasOwnProperty('description')) auditDetails += ` 描述 ${data.description ? '已更改' : '已清除/未更改'}。`;
    if (data.permissions && roleToUpdate.id !== ADMIN_ROLE_ID) auditDetails += ` 权限 ${data.permissions.length > 0 ? '已更改' : '已清除/未更改'}。`;

    await prisma.auditLog.create({
      data: { userId: auditUser.userId, username: auditUser.username, action: 'update_role', details: auditDetails }
    });
    revalidatePath("/roles");
    revalidatePath("/users"); // User's effective permissions might change
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

// Creating new roles is disabled by design. Roles are fixed.
export async function createRoleAction(data: any): Promise<ActionResponse<AppRole>> {
  logger.warn('Attempted to call createRoleAction, which is disabled.', undefined, { inputData: data });
  throw new AppError("不允许创建新角色。角色是固定的 (Administrator, Operator, Viewer)。", 403, 'ROLE_CREATION_NOT_ALLOWED');
}

// Deleting roles is disabled for fixed roles.
export async function deleteRoleAction(id: string): Promise<ActionResponse> {
  const role = await prisma.role.findUnique({where: {id}});
   if (role && (role.name === "Administrator" || role.name === "Operator" || role.name === "Viewer" )) {
     logger.warn(`Attempted to delete fixed role: ${role.name}`, undefined, { roleId: id });
     throw new AppError("不允许删除固定角色 (Administrator, Operator, Viewer)。", 403, 'FIXED_ROLE_DELETION_NOT_ALLOWED');
   }
  // If it's not one of the fixed roles (which shouldn't exist in a clean setup),
  // then it's an attempt to delete a non-existent or custom (not allowed) role.
  logger.warn(`Attempted to delete non-fixed or non-existent role.`, undefined, { roleId: id });
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

    // Log the deletion of an audit log entry. This might seem recursive, but it's important.
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
      // If logging the deletion fails, we don't want to fail the whole operation.
      logger.error('Failed to create audit log for audit log deletion', logError as Error, { originalLogId: id }, actionName);
    }

    revalidatePath("/audit-logs");
    logger.info('审计日志条目删除成功', { logId: id }, actionName);
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: createActionErrorResponse(error, actionName) };
  }
}

export async function batchDeleteAuditLogsAction(ids: string[], performingUserId?: string): Promise<BatchDeleteResult> {
  const actionName = 'batchDeleteAuditLogsAction';
  const auditUser = await getAuditUserInfo(performingUserId);
  let successCount = 0;
  const failureDetails: BatchOperationFailure[] = [];
  const deletedLogSummaries: string[] = [];

  for (const id of ids) {
    try {
      const logToDelete = await prisma.auditLog.findUnique({ where: { id } });
      if (!logToDelete) {
        failureDetails.push({ id, itemIdentifier: `ID ${id}`, error: '审计日志条目未找到。' });
        continue;
      }
      await prisma.auditLog.delete({ where: { id } });
      deletedLogSummaries.push(`ID ${id} (操作: ${logToDelete.action}, 用户: ${logToDelete.username || 'N/A'})`);
      successCount++;
    } catch (error: unknown) {
      const errorResponse = createActionErrorResponse(error, `${actionName}_single`);
      failureDetails.push({ id, itemIdentifier: `ID ${id}`, error: errorResponse.userMessage });
    }
  }

  if (deletedLogSummaries.length > 0) {
    try {
        await prisma.auditLog.create({
        data: {
            userId: auditUser.userId,
            username: auditUser.username,
            action: 'batch_delete_audit_log',
            details: `批量删除了 ${deletedLogSummaries.length} 个审计日志条目。失败 ${failureDetails.length} 个。`
        }
        });
    } catch (logError) {
        logger.error('Failed to create audit log for batch audit log deletion', logError as Error, { deletedCount: deletedLogSummaries.length }, actionName);
    }
    revalidatePath("/audit-logs");
  }
  logger.info(`批量删除审计日志完成：成功 ${successCount}，失败 ${failureDetails.length}`, { successCount, failureCount: failureDetails.length }, actionName);
  return { successCount, failureCount: failureDetails.length, failureDetails };
}

export async function getAllPermissionsAction(): Promise<AppPermission[]> {
    // Return a copy to prevent accidental modification of the source
    return mockPermissions.map(p => ({
        ...p,
        description: p.description || undefined // Ensure description is always present or undefined
    }));
}

// --- Query Tool Actions ---

interface QueryToolParams {
    page?: number;
    pageSize?: number;
    queryString?: string; // Used for subnet (CIDR/desc/netAddr) and VLAN (ID/desc)
    searchTerm?: string; // Used for IP address (IP/allocatedTo/desc)
    status?: AppIPAddressStatusType | 'all'; // Added for IP Address query
}

export async function querySubnetsAction(params: QueryToolParams): Promise<ActionResponse<PaginatedResponse<SubnetQueryResult>>> {
  const actionName = 'querySubnetsAction';
  try {
    const page = params.page || 1;
    const pageSize = params.pageSize || DEFAULT_QUERY_PAGE_SIZE;
    const skip = (page - 1) * pageSize;
    const queryString = params.queryString?.trim(); // Trim whitespace

    let whereClause: Prisma.SubnetWhereInput = {};

    if (queryString) {
      const orConditions: Prisma.SubnetWhereInput[] = [
        { cidr: { contains: queryString, mode: 'insensitive' } },
        { description: { contains: queryString, mode: 'insensitive' } },
        { networkAddress: { contains: queryString, mode: 'insensitive' } },
      ];
      // To prevent Prisma error P2009: "Failed to validate the query: `The condition provided in the where argument is invalid.`"
      // when OR is an empty list, which can happen if for some reason all conditions are filtered out.
      // Here, it's less likely for subnets unless queryString becomes unexpectedly empty after some processing.
      // But as a safeguard:
      if (orConditions.length > 0) {
        whereClause.OR = orConditions;
      } else {
        // If queryString was provided but resulted in no valid OR conditions,
        // make the query effectively return no results rather than all or erroring.
        whereClause.id = "IMPOSSIBLE_ID_TO_MATCH_ANYTHING_SUBNET";
      }
    } else {
      // No query string, return empty paginated response as per UI behavior
      return { success: true, data: { data: [], totalCount: 0, currentPage: page, totalPages: 0, pageSize } };
    }


    const totalCount = await prisma.subnet.count({ where: whereClause });
    const totalPages = Math.ceil(totalCount / pageSize);

    const subnetsFromDb = await prisma.subnet.findMany({
      where: whereClause,
      include: { vlan: true }, // Include the full VLAN object
      orderBy: { cidr: 'asc' },
      skip,
      take: pageSize,
    });

    const results: SubnetQueryResult[] = await Promise.all(
      subnetsFromDb.map(async (subnet) => {
        const props = getSubnetPropertiesFromCidr(subnet.cidr);
        const totalUsableIPs = props ? getUsableIpCount(props.prefix) : 0;
        const allocatedIPsCount = await prisma.iPAddress.count({ where: { subnetId: subnet.id, status: 'allocated' } });
        const dbFreeIPsCount = await prisma.iPAddress.count({ where: { subnetId: subnet.id, status: 'free' } });
        const reservedIPsCount = await prisma.iPAddress.count({ where: { subnetId: subnet.id, status: 'reserved' } });

        return {
          id: subnet.id,
          cidr: subnet.cidr,
          description: subnet.description || undefined,
          vlanNumber: subnet.vlan?.vlanNumber,
          vlanDescription: subnet.vlan?.description || undefined,
          totalUsableIPs,
          allocatedIPsCount,
          dbFreeIPsCount,
          reservedIPsCount,
        };
      })
    );
    const paginatedResult: PaginatedResponse<SubnetQueryResult> = {
        data: results,
        totalCount,
        currentPage: page,
        totalPages,
        pageSize
    };
    return { success: true, data: paginatedResult };
  } catch (error: unknown) {
    return { success: false, error: createActionErrorResponse(error, actionName) };
  }
}

export async function queryVlansAction(params: QueryToolParams): Promise<ActionResponse<PaginatedResponse<VlanQueryResult>>> {
  const actionName = 'queryVlansAction';
  try {
    const page = params.page || 1;
    const pageSize = params.pageSize || DEFAULT_QUERY_PAGE_SIZE;
    const skip = (page - 1) * pageSize;
    const queryString = params.queryString?.trim();

    let whereClause: Prisma.VLANWhereInput = {};

    if (queryString) {
      const potentialVlanNumber = parseInt(queryString, 10);
      if (!isNaN(potentialVlanNumber) && potentialVlanNumber.toString() === queryString) {
        whereClause = { vlanNumber: potentialVlanNumber };
      } else {
        whereClause = { description: { contains: queryString, mode: 'insensitive' } };
      }
    } else {
        return { success: true, data: { data: [], totalCount: 0, currentPage: page, totalPages: 0, pageSize } };
    }


    const totalCount = await prisma.vLAN.count({ where: whereClause });
    const totalPages = Math.ceil(totalCount / pageSize);

    const vlansFromDb = await prisma.vLAN.findMany({
      where: whereClause,
      include: {
        subnets: { select: { id: true, cidr: true, description: true }, take: 10 }, // Limit for preview
        ipAddresses: { select: { id: true, ipAddress: true, description: true }, take: 10 }, // Limit for preview
        _count: { select: { subnets: true, ipAddresses: true } }
      },
      orderBy: { vlanNumber: 'asc' },
      skip,
      take: pageSize,
    });

    const results: VlanQueryResult[] = vlansFromDb.map(vlan => ({
      id: vlan.id,
      vlanNumber: vlan.vlanNumber,
      description: vlan.description || undefined,
      associatedSubnets: vlan.subnets.map(s => ({ id: s.id, cidr: s.cidr, description: s.description || undefined })),
      associatedDirectIPs: vlan.ipAddresses.map(ip => ({ id: ip.id, ipAddress: ip.ipAddress, description: ip.description || undefined })),
      resourceCount: (vlan._count.subnets || 0) + (vlan._count.ipAddresses || 0),
    }));

    const paginatedResult: PaginatedResponse<VlanQueryResult> = {
        data: results,
        totalCount,
        currentPage: page,
        totalPages,
        pageSize
    };
    return { success: true, data: paginatedResult };
  } catch (error: unknown) {
    return { success: false, error: createActionErrorResponse(error, actionName) };
  }
}

export async function queryIpAddressesAction(params: QueryToolParams): Promise<ActionResponse<PaginatedResponse<AppIPAddressWithRelations>>> {
  const actionName = 'queryIpAddressesAction';
  try {
    const page = params.page || 1;
    const pageSize = params.pageSize || DEFAULT_QUERY_PAGE_SIZE;
    const skip = (page - 1) * pageSize;
    const trimmedSearchTerm = params.searchTerm?.trim();
    const statusFilter = params.status;

    let whereClause: Prisma.IPAddressWhereInput = {};
    const orConditions: Prisma.IPAddressWhereInput[] = [];

    if (trimmedSearchTerm) {
      // Try IP wildcard patterns first
      const ipWildcardPatterns = [
        { regex: /^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\*$/, prefixBuilder: (match: RegExpMatchArray) => `${match[1]}.` },
        { regex: /^(\d{1,3}\.\d{1,3})\.\*$/, prefixBuilder: (match: RegExpMatchArray) => `${match[1]}.` },
        { regex: /^(\d{1,3})\.\*$/, prefixBuilder: (match: RegExpMatchArray) => `${match[1]}.` },
      ];
      let matchedIpPattern = false;
      for (const pattern of ipWildcardPatterns) {
        const match = trimmedSearchTerm.match(pattern.regex);
        if (match) {
          orConditions.push({ ipAddress: { startsWith: pattern.prefixBuilder(match), mode: 'insensitive' } });
          matchedIpPattern = true;
          break;
        }
      }

      // If not a wildcard, or if it is but we also want to search other fields
      if (!matchedIpPattern) {
        orConditions.push({ allocatedTo: { contains: trimmedSearchTerm, mode: 'insensitive' } });
        orConditions.push({ description: { contains: trimmedSearchTerm, mode: 'insensitive' } });
        
        // More robust check for potential IP segment
        const isPotentiallyIpSegment = /[\d]/.test(trimmedSearchTerm) && !/^[^\d.]+$/.test(trimmedSearchTerm) && !/^[\s.]*$/.test(trimmedSearchTerm) && trimmedSearchTerm.length <= 15;
        if (isPotentiallyIpSegment) {
            orConditions.push({ ipAddress: { startsWith: trimmedSearchTerm, mode: 'insensitive' } });
        }
      }
    }

    const statusCondition: Prisma.IPAddressWhereInput | null = (statusFilter && statusFilter !== 'all')
      ? { status: statusFilter as AppIPAddressStatusType }
      : null;

    if (orConditions.length > 0) {
      if (statusCondition) {
        whereClause.AND = [ // Ensure status is ANDed with the OR conditions
          { OR: orConditions },
          statusCondition
        ];
      } else {
        whereClause.OR = orConditions;
      }
    } else if (statusCondition) {
      whereClause = statusCondition;
    } else {
      // No search term, no status filter means return empty (as per UI spec)
      return { success: true, data: { data: [], totalCount: 0, currentPage: page, totalPages: 0, pageSize } };
    }
    
    // If after all processing, orConditions is empty AND there's no status filter,
    // this means the search term was non-empty but invalid.
    // We make the query return no results instead of all or erroring.
    if (trimmedSearchTerm && orConditions.length === 0 && !statusCondition) {
        whereClause = { id: "IMPOSSIBLE_ID_TO_MATCH_ANYTHING_IP" };
    }


    const totalCount = await prisma.iPAddress.count({ where: whereClause });
    const totalPages = Math.ceil(totalCount / pageSize);

    const includeClauseForQuery = {
        subnet: { include: { vlan: true } },
        vlan: true,
    };

    const ipsFromDb = await prisma.iPAddress.findMany({
      where: whereClause,
      include: includeClauseForQuery,
      orderBy: [ { subnet: { networkAddress: 'asc' } }, { ipAddress: 'asc' } ],
      skip,
      take: pageSize,
    }) as PrismaIPAddressWithRelations[];

    const results: AppIPAddressWithRelations[] = ipsFromDb.map(ip => ({
        id: ip.id,
        ipAddress: ip.ipAddress,
        status: ip.status as AppIPAddressStatusType,
        allocatedTo: ip.allocatedTo || undefined,
        description: ip.description || undefined,
        lastSeen: ip.lastSeen?.toISOString() || undefined,
        subnetId: ip.subnetId || undefined,
        vlanId: ip.vlanId || undefined,
        subnet: ip.subnet ? {
            id: ip.subnet.id,
            cidr: ip.subnet.cidr,
            networkAddress: ip.subnet.networkAddress,
            vlan: ip.subnet.vlan ? { vlanNumber: ip.subnet.vlan.vlanNumber } : null,
        } : null,
        vlan: ip.vlan ? { vlanNumber: ip.vlan.vlanNumber } : null,
    }));

    const paginatedResult: PaginatedResponse<AppIPAddressWithRelations> = {
        data: results,
        totalCount,
        currentPage: page,
        totalPages,
        pageSize
    };
    return { success: true, data: paginatedResult };
  } catch (error: unknown) {
    logger.error(`Error in ${actionName}`, error as Error, { inputData: params });
    return { success: false, error: createActionErrorResponse(error, actionName) };
  }
}


export async function getSubnetFreeIpDetailsAction(subnetId: string): Promise<ActionResponse<SubnetFreeIpDetails>> {
  const actionName = 'getSubnetFreeIpDetailsAction';
  try {
    const subnet = await prisma.subnet.findUnique({ where: { id: subnetId } });
    if (!subnet) {
      throw new NotFoundError(`子网 ID: ${subnetId}`, '子网未找到。');
    }

    const subnetProperties = getSubnetPropertiesFromCidr(subnet.cidr);
    if (!subnetProperties) {
      throw new AppError(`无法解析子网 ${subnet.cidr} 的属性。`, 500, 'SUBNET_PROP_PARSE_ERROR');
    }

    const totalUsableIPs = getUsableIpCount(subnetProperties.prefix);

    const dbIpsInSubnet = await prisma.iPAddress.findMany({
      where: { subnetId: subnet.id },
      select: { ipAddress: true, status: true },
    });

    const dbAllocatedIpsSet = new Set<number>();
    const dbReservedIpsSet = new Set<number>();

    dbIpsInSubnet.forEach(ip => {
      const ipNum = ipToNumber(ip.ipAddress);
      if (ip.status === 'allocated') {
        dbAllocatedIpsSet.add(ipNum);
      } else if (ip.status === 'reserved') {
        dbReservedIpsSet.add(ipNum);
      }
    });

    const dbAllocatedIPsCount = dbAllocatedIpsSet.size;
    const dbReservedIPsCount = dbReservedIpsSet.size;

    const calculatedAvailableNumericIps: number[] = [];

    if (subnetProperties.firstUsableIp && subnetProperties.lastUsableIp) {
      const firstUsableNum = ipToNumber(subnetProperties.firstUsableIp);
      const lastUsableNum = ipToNumber(subnetProperties.lastUsableIp);

      for (let currentIpNum = firstUsableNum; currentIpNum <= lastUsableNum; currentIpNum++) {
        if (!dbAllocatedIpsSet.has(currentIpNum) && !dbReservedIpsSet.has(currentIpNum)) {
          calculatedAvailableNumericIps.push(currentIpNum);
        }
      }
    } else if (subnetProperties.prefix === 32) { // Single IP subnet
        const singleIpNum = ipToNumber(subnetProperties.networkAddress);
        if (!dbAllocatedIpsSet.has(singleIpNum) && !dbReservedIpsSet.has(singleIpNum)) {
            calculatedAvailableNumericIps.push(singleIpNum);
        }
    } else if (subnetProperties.prefix === 31) { // Two IP subnet (RFC 3021)
        const firstIpNum = ipToNumber(subnetProperties.networkAddress);
        const secondIpNum = firstIpNum + 1;
        if (!dbAllocatedIpsSet.has(firstIpNum) && !dbReservedIpsSet.has(firstIpNum)) {
            calculatedAvailableNumericIps.push(firstIpNum);
        }
        if (!dbAllocatedIpsSet.has(secondIpNum) && !dbReservedIpsSet.has(secondIpNum)) {
            calculatedAvailableNumericIps.push(secondIpNum);
        }
    }

    const calculatedAvailableIpRanges = groupConsecutiveIpsToRanges(calculatedAvailableNumericIps);
    const calculatedAvailableIPsCount = calculatedAvailableNumericIps.length;

    const result: SubnetFreeIpDetails = {
      subnetId: subnet.id,
      subnetCidr: subnet.cidr,
      totalUsableIPs,
      dbAllocatedIPsCount,
      dbReservedIPsCount,
      calculatedAvailableIPsCount,
      calculatedAvailableIpRanges,
    };

    return { success: true, data: result };

  } catch (error: unknown) {
    logger.error(`Error in ${actionName} for subnet ${subnetId}`, error as Error);
    return { success: false, error: createActionErrorResponse(error, actionName) };
  }
}

    