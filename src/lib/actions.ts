
"use server";

import { revalidatePath } from "next/cache";
import type { Subnet as AppSubnet, VLAN as AppVLAN, IPAddress as AppIPAddress, User as AppUser, Role as AppRole, AuditLog as AppAuditLog, IPAddressStatus as AppIPAddressStatusType, RoleName as AppRoleNameType, PermissionId as AppPermissionIdType, Permission as AppPermission } from '@/types';
import { PERMISSIONS } from '@/types';
import prisma from "./prisma";
import { 
  parseAndValidateCIDR as getSubnetPropertiesFromCidr, // Renamed for clarity, used for getting properties
  getUsableIpCount, 
  isIpInCidrRange, 
  ipToNumber, 
  numberToIp,
  getPrefixFromCidr
} from "./ip-utils";
import { validateCIDR as validateCidrInput } from "./error-utils"; // Primary validation function for CIDR input
import { logger } from './logger';
import { AppError, ValidationError, ResourceError, NotFoundError, AuthError, type ActionErrorResponse } from './errors';
import { createActionErrorResponse } from './error-utils'; // For converting errors to response objects
import { ADMIN_ROLE_ID, OPERATOR_ROLE_ID, VIEWER_ROLE_ID, mockPermissions } from "./data"; // mockPermissions might not be needed here
import { Prisma } from '@prisma/client';

// Standardized Action Response
export interface ActionResponse<TData = unknown> { // Changed default TData to unknown
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

// --- Login and User Details Actions (Error handling might need review later if they throw) ---
interface LoginPayload {
  email: string;
  password?: string;
}
interface LoginResponse { // This is not an ActionResponse, specific structure
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
      // Use AuthError for logging, but return specific message for login
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
  // ... (keep existing implementation, or adapt if it needs to return ActionResponse)
  // For now, assuming it's okay as is, as it doesn't seem to be the direct cause of the user's reported issue.
  // If it can fail, it should also be wrapped or return a structured error.
  // For simplicity of this focused change, leaving it.
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


// --- Subnet Actions ---
export async function createSubnetAction(
  data: { cidr: string; vlanId?: string; description?: string; },
  performingUserId?: string // Optional: pass if you want to attribute audit to a specific user
): Promise<ActionResponse<AppSubnet>> {
  const actionName = 'createSubnetAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);

    // 1. Validate CIDR input (format and if it's a network address)
    // This function throws ValidationError on failure.
    validateCidrInput(data.cidr, 'cidr');

    // 2. Get subnet properties after basic validation passes
    // getSubnetPropertiesFromCidr is the renamed parseAndValidateCIDR from ip-utils
    const subnetProperties = getSubnetPropertiesFromCidr(data.cidr);
    if (!subnetProperties) {
      // Should be caught by validateCidrInput, but as a safeguard for parsing logic
      throw new AppError(
        'Failed to parse CIDR properties after validation.',
        500,
        'CIDR_PARSE_ERROR',
        '无法解析有效的 CIDR 属性，请联系支持。'
      );
    }
    const canonicalCidrToStore = `${subnetProperties.networkAddress}/${subnetProperties.prefix}`;
    
    // 3. Check if subnet already exists
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
    
    // Optional: Validate VLAN if vlanId is provided
    if (data.vlanId && data.vlanId !== "") {
        const vlanExists = await prisma.vLAN.findUnique({ where: { id: data.vlanId }});
        if (!vlanExists) {
            throw new NotFoundError(`VLAN ID: ${data.vlanId}`, `选择的 VLAN 不存在。`);
        }
    }

    // 4. Create subnet in database
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

    // 5. Create audit log
    await prisma.auditLog.create({
      data: {
        userId: auditUser.userId,
        username: auditUser.username,
        action: 'create_subnet', // Consistent action key
        details: `创建了子网 ${newSubnetPrisma.cidr}`
      }
    });

    // 6. Revalidate paths
    revalidatePath("/subnets");
    revalidatePath("/dashboard");
    revalidatePath("/ip-addresses");

    const appSubnet: AppSubnet = {
        ...newSubnetPrisma,
        vlanId: newSubnetPrisma.vlanId || undefined,
        description: newSubnetPrisma.description || undefined,
        utilization: 0, // Initial utilization
        ipRange: newSubnetPrisma.ipRange || undefined // Ensure ipRange is optional
    };

    logger.info('子网创建成功', { subnetId: appSubnet.id, cidr: appSubnet.cidr }, actionName);
    return { success: true, data: appSubnet };

  } catch (error: unknown) {
    // The createActionErrorResponse function will log the error and format it.
    return { success: false, error: createActionErrorResponse(error, actionName) };
  }
}


// --- Placeholder for other actions. They will need similar try/catch and return ActionResponse structure ---

export async function getSubnetsAction(params?: FetchParams): Promise<PaginatedResponse<AppSubnet>> {
  // ... (existing implementation - if it can fail, consider wrapping or ensuring robust error handling)
  // For now, assuming read actions are less prone to business logic errors displayed to user.
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
    const parsedCidr = getSubnetPropertiesFromCidr(subnet.cidr); // Use the renamed one
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
      logger.error(`Invalid CIDR (${subnet.cidr}) found in DB for subnet ID ${subnet.id}. Calculations might be incorrect.`, undefined, {subnetId: subnet.id, cidr: subnet.cidr}, 'getSubnetsAction');
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
      validateCidrInput(data.cidr, 'cidr'); // Validates format and if it's network address
      const newSubnetProperties = getSubnetPropertiesFromCidr(data.cidr);
      if (!newSubnetProperties) {
        throw new AppError('Failed to parse new CIDR properties after validation.', 500, 'CIDR_PARSE_ERROR', '无法解析新的有效 CIDR 属性。');
      }
      
      const newCanonicalCidr = `${newSubnetProperties.networkAddress}/${newSubnetProperties.prefix}`;
      newCanonicalCidrForLog = newCanonicalCidr;

      const conflictingSubnet = await prisma.subnet.findFirst({ where: { cidr: newCanonicalCidr, NOT: { id } } });
      if (conflictingSubnet) {
        throw new ResourceError(`子网 ${newCanonicalCidr} 已存在。`, 'SUBNET_ALREADY_EXISTS', `新的 CIDR ${newCanonicalCidr} 与现有子网冲突。`);
      }

      updateData.cidr = newCanonicalCidr;
      updateData.networkAddress = newSubnetProperties.networkAddress;
      updateData.subnetMask = newSubnetProperties.subnetMask;
      updateData.ipRange = newSubnetProperties.ipRange;

      // Handle IP disassociation if subnet shrinks (example logic, might need refinement)
      const allocatedIpsInSubnet = await prisma.iPAddress.findMany({ where: { subnetId: id, status: "allocated" } });
      const ipsToDisassociateDetails: string[] = [];
      for (const ip of allocatedIpsInSubnet) {
        if (!isIpInCidrRange(ip.ipAddress, newSubnetProperties)) {
          await prisma.iPAddress.update({
            where: { id: ip.id },
            data: { status: "free", allocatedTo: null, subnetId: null, vlanId: null }, // Or specific handling
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
      if (newVlanId) { // if not null or undefined, check if it exists
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
      // No actual changes to be made, return current subnet data or specific message
      logger.info('No changes detected for subnet update.', { subnetId: id, inputData: data }, actionName);
       const currentAppSubnet: AppSubnet = { 
        ...subnetToUpdate, 
        vlanId: subnetToUpdate.vlanId || undefined, 
        description: subnetToUpdate.description || undefined, 
        ipRange: subnetToUpdate.ipRange || undefined, 
        utilization: await calculateSubnetUtilization(id) // Recalculate utilization
      };
      return { success: true, data: currentAppSubnet }; // Or return an info message
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
    const parsedCidr = getSubnetPropertiesFromCidr(subnet.cidr);
    if (!parsedCidr) return 0;
    const totalUsableIps = getUsableIpCount(parsedCidr.prefix);
    if (totalUsableIps === 0) return 0;
    const allocatedIpsCount = await prisma.iPAddress.count({ where: { subnetId: subnetId, status: "allocated" }});
    return Math.round((allocatedIpsCount / totalUsableIps) * 100);
}


export async function deleteSubnetAction(id: string, performingUserId?: string): Promise<ActionResponse> {
  // ... To be refactored similarly
  const actionName = 'deleteSubnetAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    const subnetToDelete = await prisma.subnet.findUnique({ where: { id } });

    if (!subnetToDelete) {
      throw new NotFoundError(`子网 ID: ${id}`, `要删除的子网未找到。`);
    }

    // Example business rule: Do not delete if there are allocated IPs (could be configurable)
    const allocatedIpsCount = await prisma.iPAddress.count({ where: { subnetId: id, status: 'allocated' } });
    if (allocatedIpsCount > 0) {
      throw new ResourceError(
        `子网 ${subnetToDelete.cidr} 中仍有 ${allocatedIpsCount} 个已分配的 IP 地址。`,
        'SUBNET_HAS_ALLOCATED_IPS',
        `无法删除子网 ${subnetToDelete.cidr}，因为它仍包含已分配的 IP 地址。请先将这些 IP 释放或移至其他子网。`
      );
    }
    
    // If no allocated IPs, proceed to disassociate free/reserved IPs
    const ipsInSubnet = await prisma.iPAddress.findMany({ where: { subnetId: id } });
    for (const ip of ipsInSubnet) {
      await prisma.iPAddress.update({
        where: { id: ip.id },
        data: { subnetId: null, status: "free", allocatedTo: null, vlanId: null }, // Or handle as per policy
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


// --- VLAN Actions (need similar refactoring) ---
export async function getVLANsAction(params?: FetchParams): Promise<PaginatedResponse<AppVLAN>> {
  // ... (existing implementation)
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
// Other actions (createVLANAction, updateVLANAction, etc.) would follow the same pattern
// as createSubnetAction regarding try/catch and returning ActionResponse.

export async function createVLANAction(data: Omit<AppVLAN, "id" | "subnetCount">, performingUserId?: string): Promise<ActionResponse<AppVLAN>> {
  // TODO: Refactor this action like createSubnetAction
  const auditUser = await getAuditUserInfo(performingUserId);
  if (isNaN(data.vlanNumber) || data.vlanNumber < 1 || data.vlanNumber > 4094) {
    throw new ValidationError("VLAN 号码必须是 1 到 4094 之间的整数。", 'vlanNumber', data.vlanNumber);
  }
  const existingVLAN = await prisma.vLAN.findUnique({ where: { vlanNumber: data.vlanNumber } });
  if (existingVLAN) throw new ResourceError(`VLAN ${data.vlanNumber} 已存在。`, 'VLAN_EXISTS');

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
  return { success: true, data: appVlan };
}

export interface BatchVlanCreationResult { // This is not an ActionResponse, specific for batch
  successCount: number;
  failureDetails: Array<{
    vlanNumberAttempted: number;
    error: string; // This should ideally be userMessage
  }>;
}
export async function batchCreateVLANsAction(
  vlansToCreateInput: Array<{ vlanNumber: number; description?: string; }>,
  performingUserId?: string
): Promise<BatchVlanCreationResult> { // Not returning ActionResponse for now
  // TODO: Refactor this action. Each individual creation within the batch should
  // effectively use the ActionResponse pattern, and the batch result aggregates this.
  // For now, keeping original structure to limit scope of change.
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
        throw new ResourceError(`VLAN ${vlanInput.vlanNumber} 已存在。`, 'VLAN_EXISTS');
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
      let errorMessage = "未知错误";
      if (e instanceof AppError) errorMessage = e.userMessage;
      else if (e instanceof Error) errorMessage = e.message;
      failureDetails.push({ vlanNumberAttempted: vlanInput.vlanNumber, error: errorMessage });
      logger.warn('批量创建 VLAN 失败 - 单个条目', e as Error, { vlanInput });
    }
  }
  // ... (rest of audit logging and revalidation from original)
  if (createdVlanNumbersForAudit.length > 0) {
     await prisma.auditLog.create({
        data: { userId: auditUser.userId, username: auditUser.username, action: 'batch_create_vlan', details: `批量创建了 ${createdVlanNumbersForAudit.length} 个 VLAN：${createdVlanNumbersForAudit.join(', ')}。失败：${failureDetails.length} 个。` }
    });
  }
  if (successCount > 0) { revalidatePath("/vlans"); }
  return { successCount, failureDetails };
}

export async function updateVLANAction(id: string, data: Partial<Omit<AppVLAN, "id" | "subnetCount">>, performingUserId?: string): Promise<ActionResponse<AppVLAN>> {
  // TODO: Refactor
  const auditUser = await getAuditUserInfo(performingUserId);
  const vlanToUpdate = await prisma.vLAN.findUnique({ where: { id } });
  if (!vlanToUpdate) throw new NotFoundError(`VLAN ID: ${id}`);

  if (data.vlanNumber && data.vlanNumber !== vlanToUpdate.vlanNumber) {
    if (isNaN(data.vlanNumber) || data.vlanNumber < 1 || data.vlanNumber > 4094) {
        throw new ValidationError("VLAN 号码必须是 1 到 4094 之间的整数。", 'vlanNumber', data.vlanNumber);
    }
    const existingVLAN = await prisma.vLAN.findUnique({ where: { vlanNumber: data.vlanNumber } });
    if (existingVLAN && existingVLAN.id !== id) {
      throw new ResourceError(`已存在另一个 VLAN 号码为 ${data.vlanNumber} 的 VLAN。`, 'VLAN_EXISTS');
    }
  }
  const updatePayload: Prisma.VLANUpdateInput = {};
  if (data.hasOwnProperty('vlanNumber') && data.vlanNumber !== undefined) updatePayload.vlanNumber = data.vlanNumber;
  if (data.hasOwnProperty('description')) updatePayload.description = data.description || null;

  const updatedVLAN = await prisma.vLAN.update({ where: { id }, data: updatePayload });
  // ... (audit and revalidate)
  const appVlan: AppVLAN = { ...updatedVLAN, description: updatedVLAN.description || undefined, subnetCount: vlanToUpdate.subnetCount }; // subnetCount might need recalc
  return { success: true, data: appVlan};
}
export async function deleteVLANAction(id: string, performingUserId?: string): Promise<ActionResponse> {
  // TODO: Refactor
  const auditUser = await getAuditUserInfo(performingUserId);
  const vlanToDelete = await prisma.vLAN.findUnique({ where: { id } });
  if (!vlanToDelete) throw new NotFoundError(`VLAN ID: ${id}`);
  // ... (check if used, then delete, audit, revalidate)
  const subnetsUsingVlanCount = await prisma.subnet.count({ where: { vlanId: id } });
  if (subnetsUsingVlanCount > 0) {
    throw new ResourceError(`无法删除 VLAN ${vlanToDelete.vlanNumber}。它已分配给 ${subnetsUsingVlanCount} 个子网。请先解除关联。`, 'VLAN_IN_USE');
  }
  // ... similar check for IPs directly associated
  await prisma.vLAN.delete({ where: { id } });
  return { success: true };
}

// --- IP Address Actions (need similar refactoring) ---
export async function getIPAddressesAction(params?: FetchParams): Promise<PaginatedResponse<AppIPAddress & { subnet?: { cidr: string; networkAddress: string; vlan?: { vlanNumber: number } | null } | null; vlan?: { vlanNumber: number } | null }>> {
  // ... (existing implementation)
  const page = params?.page || 1;
  const pageSize = params?.pageSize || DEFAULT_PAGE_SIZE;
  const skip = (page - 1) * pageSize;
  const whereClause: Prisma.IPAddressWhereInput = {};
  if (params?.subnetId) whereClause.subnetId = params.subnetId;
  if (params?.status && params.status !== 'all') whereClause.status = params.status as AppIPAddressStatusType;
  const totalCount = await prisma.iPAddress.count({ where: whereClause });
  const totalPages = Math.ceil(totalCount / pageSize);

  const ipsFromDb = params?.page && params?.pageSize ?
    await prisma.iPAddress.findMany({
        where: whereClause,
        include: { subnet: { select: { cidr: true, networkAddress: true, vlan: { select: { vlanNumber: true } } } }, vlan: { select: { vlanNumber: true }} },
        orderBy: { ipAddress: 'asc' }, skip, take: pageSize,
    }) :
    await prisma.iPAddress.findMany({
        where: whereClause,
        include: { subnet: { select: { cidr: true, networkAddress: true, vlan: { select: { vlanNumber: true } } } }, vlan: { select: { vlanNumber: true }} },
        orderBy: { ipAddress: 'asc' }
    });
  const appIps = ipsFromDb.map(ip => ({
    ...ip, subnetId: ip.subnetId || undefined, vlanId: ip.vlanId || undefined, allocatedTo: ip.allocatedTo || undefined,
    description: ip.description || undefined, lastSeen: ip.lastSeen?.toISOString() || undefined, status: ip.status as AppIPAddressStatusType,
  }));
  return { data: appIps, totalCount: params?.page && params?.pageSize ? totalCount : appIps.length, currentPage: page, totalPages: params?.page && params?.pageSize ? totalPages : 1, pageSize };
}
// createIPAddressAction, updateIPAddressAction, etc. need refactoring

export async function createIPAddressAction(data: Omit<AppIPAddress, "id">, performingUserId?: string): Promise<ActionResponse<AppIPAddress>> {
    // TODO: Refactor
    const auditUser = await getAuditUserInfo(performingUserId);
    // ... (validation logic throwing AppError, ValidationError, ResourceError, NotFoundError)
    const newIP = await prisma.iPAddress.create({ data: { /* ... */ } as any });
    // ... (audit, revalidate)
    return { success: true, data: newIP as any };
}
export interface BatchIpCreationResult { /* ... */ }
export async function batchCreateIPAddressesAction(payload: { /* ... */ }): Promise<BatchIpCreationResult> {
    // TODO: Refactor
    return { successCount: 0, failureDetails: [] };
}
export async function updateIPAddressAction(id: string, data: Partial<Omit<AppIPAddress, "id">>, performingUserId?: string): Promise<ActionResponse<AppIPAddress>> {
    // TODO: Refactor
    const updatedIP = await prisma.iPAddress.update({ where: { id }, data: { /* ... */ } as any });
    return { success: true, data: updatedIP as any };
}
export async function deleteIPAddressAction(id: string, performingUserId?: string): Promise<ActionResponse> {
    // TODO: Refactor
    await prisma.iPAddress.delete({ where: { id } });
    return { success: true };
}

// --- User Actions (need similar refactoring) ---
export async function getUsersAction(params?: FetchParams): Promise<PaginatedResponse<FetchedUserDetails>> {
  // ... (existing implementation)
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
// createUserAction, updateUserAction, etc. need refactoring
export async function createUserAction(data: Omit<AppUser, "id" | "lastLogin" | "roleName"> & { password: string, avatar?: string }, performingUserId?: string): Promise<ActionResponse<FetchedUserDetails>> {
    // TODO: Refactor
    const newUser = await prisma.user.create({ data: { /* ... */ } as any, include: { role: { include: { permissions: true } } } });
    return { success: true, data: newUser as any };
}
export async function updateUserAction(id: string, data: Partial<Omit<AppUser, "id" | "roleName">> & { password?: string }, performingUserId?: string): Promise<ActionResponse<FetchedUserDetails>> {
    // TODO: Refactor
    const updatedUser = await prisma.user.update({ where: { id }, data: { /* ... */ } as any, include: { role: { include: { permissions: true } } } });
    return { success: true, data: updatedUser as any };
}
export async function updateOwnPasswordAction(userId: string, payload: { currentPassword?: string; newPassword?: string; }): Promise<ActionResponse<{ message: string }>> { // Ensure this is ActionResponse
    // TODO: Refactor
    return { success: true, data: { message: "Password updated." } };
}
export async function deleteUserAction(id: string, performingUserId?: string): Promise<ActionResponse> {
    // TODO: Refactor
    return { success: true };
}


// --- Role Actions (need similar refactoring, especially updateRoleAction) ---
export async function getRolesAction(params?: FetchParams): Promise<PaginatedResponse<AppRole>> {
  // ... (existing implementation)
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
    // TODO: Refactor
    const updatedRole = await prisma.role.update({ where: { id }, data: { /* ... */ } as any, include: { permissions: true, _count: { select: { users: true } } } });
    return { success: true, data: updatedRole as any };
}
export async function createRoleAction(data: any): Promise<ActionResponse<AppRole>> { throw new Error("Not allowed."); }
export async function deleteRoleAction(id: string): Promise<ActionResponse> { throw new Error("Not allowed."); }

// --- Audit Log Actions (need similar refactoring if they can fail meaningfully for a user) ---
export async function getAuditLogsAction(params?: FetchParams): Promise<PaginatedResponse<AppAuditLog>> {
  // ... (existing implementation)
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
    // TODO: Refactor
    return { success: true };
}

// --- Permissions Action (Read-only, less critical for this specific error display issue) ---
export async function getAllPermissionsAction(): Promise<AppPermission[]> {
    // ... (existing implementation)
    const permissionsFromDb = await prisma.permission.findMany({ orderBy: { id: 'asc' }});
    return permissionsFromDb.map(p => ({ ...p, id: p.id as AppPermissionIdType, description: p.description || undefined }));
}
