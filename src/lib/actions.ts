
"use server";

import { revalidatePath } from "next/cache";
import type {
  Subnet as AppSubnet, VLAN as AppVLAN, IPAddress as AppIPAddress, User as AppUser, Role as AppRole, AuditLog,
  IPAddressStatus as AppIPAddressStatusType, RoleName as AppRoleNameType, PermissionId as AppPermissionIdType,
  Permission as AppPermission, SubnetQueryResult, VlanQueryResult, BatchDeleteResult, BatchOperationFailure,
  SubnetFreeIpDetails, PaginatedResponse,
  DeviceDictionary as AppDeviceDictionary,
  PaymentSourceDictionary as AppPaymentSourceDictionary,
  AccessTypeDictionary as AppAccessTypeDictionary,
  InterfaceTypeDictionary as AppInterfaceTypeDictionary,
  DashboardData,
  IPStatusCounts,
  TopNItemCount,
  VLANResourceInfo,
  SubnetUtilizationInfo
} from '@/types';
import { PERMISSIONS } from '@/types';
import prisma from "./prisma";
import {
  getSubnetPropertiesFromCidr, getUsableIpCount, isIpInCidrRange, ipToNumber, numberToIp, doSubnetsOverlap, compareIpStrings, groupConsecutiveIpsToRanges,
} from "./ip-utils";
import { validateCIDR as validateCidrInputFormat } from "./error-utils";
import { logger } from './logger';
import { AppError, ValidationError, ResourceError, NetworkError, AuthError, NotFoundError, type ActionErrorResponse } from './errors';
import { createActionErrorResponse } from './error-utils';
import { mockPermissions as seedPermissionsData } from "./data";
import { Prisma } from '@prisma/client';
import { encrypt, decrypt } from './crypto-utils';
import { DASHBOARD_TOP_N_COUNT, DASHBOARD_AUDIT_LOG_COUNT, DEFAULT_PAGE_SIZE, DEFAULT_QUERY_PAGE_SIZE, CHART_COLORS_REMAINDER } from "./constants";
import { z } from 'zod';


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
  const adminUser = await prisma.user.findFirst({ where: { role: { name: "Administrator" } } });
  if (adminUser) return { userId: adminUser.id, username: adminUser.username };
  return { userId: undefined, username: '系统' };
}

interface FetchParams { page?: number; pageSize?: number; subnetId?: string; status?: AppIPAddressStatusType | 'all'; }
export interface FetchedUserDetails { id: string; username: string; email: string; roleId: string; roleName: AppRoleNameType; avatar?: string; permissions: AppPermissionIdType[]; lastLogin?: string | undefined; }
interface LoginPayload { email: string; password?: string; }
interface LoginResponse { success: boolean; user?: FetchedUserDetails; message?: string; }

export async function loginAction(payload: LoginPayload): Promise<LoginResponse> {
  const actionName = 'loginAction'; const { email, password: passwordAttempt } = payload;
  if (!email || !passwordAttempt) { return { success: false, message: "邮箱和密码是必需的。" }; }
  try {
    const userFromDb = await prisma.user.findUnique({
      where: { email },
      include: {
        role: {
          include: {
            permissions: true
          }
        }
      }
    });

    if (!userFromDb) {
      logger.warn(`[${actionName}] Login failed: User not found for email ${email}.`, new AuthError(`User with email ${email} not found.`), { email }, actionName);
      return { success: false, message: "邮箱或密码无效。" };
    }

    let decryptedStoredPassword;
    try {
      decryptedStoredPassword = decrypt(userFromDb.password);
    } catch (decryptionError) {
      logger.error(`[${actionName}] Password decryption failed for user ${userFromDb.username}.`, decryptionError as Error, { userId: userFromDb.id }, actionName);
      return { success: false, message: "登录认证失败，请联系管理员。" };
    }

    if (decryptedStoredPassword !== passwordAttempt) {
      logger.warn(`[${actionName}] Login failed: Invalid password for user ${userFromDb.username}.`, new AuthError('Invalid password attempt.'), { userId: userFromDb.id }, actionName);
      return { success: false, message: "邮箱或密码无效。" };
    }

    if (!userFromDb.role || !userFromDb.role.name) {
      logger.error(`[${actionName}] User ${userFromDb.id} (${userFromDb.username}) missing role.`, new AppError('User role data incomplete'), { userId: userFromDb.id }, actionName);
      return { success: false, message: "用户角色信息不完整。" };
    }
    
    let permissionsList: AppPermissionIdType[] = userFromDb.role.permissions.map(p => p.id as AppPermissionIdType);
    
    await prisma.user.update({
      where: { id: userFromDb.id },
      data: { lastLogin: new Date() }
    });
    
    await prisma.auditLog.create({
      data: {
        userId: userFromDb.id,
        username: userFromDb.username,
        action: 'user_login',
        details: `用户 ${userFromDb.username} 成功登录。`
      }
    });
    
    return {
      success: true,
      user: {
        id: userFromDb.id,
        username: userFromDb.username,
        email: userFromDb.email,
        roleId: userFromDb.roleId,
        roleName: userFromDb.role.name as AppRoleNameType,
        avatar: userFromDb.avatar || '/images/avatars/default_avatar.png',
        permissions: permissionsList,
        lastLogin: userFromDb.lastLogin?.toISOString()
      }
    };
  } catch (error) {
    logger.error(`[${actionName}] Login error`, error as Error, { email }, actionName);
    if (error instanceof Error && error.message.includes('Decryption failed')) {
        return { success: false, message: "登录认证参数错误，请联系管理员。" };
    }
    return { success: false, message: "登录过程中发生意外错误。" };
  }
}

export async function fetchCurrentUserDetailsAction(userId: string): Promise<FetchedUserDetails | null> {
  const actionName = 'fetchCurrentUserDetailsAction'; if (!userId) return null;
  try {
    const userFromDb = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: {
          include: {
            permissions: true
          }
        }
      }
    });
    if (!userFromDb || !userFromDb.role || !userFromDb.role.name) {
      logger.warn(`[${actionName}] User ${userId} or role invalid.`, new AppError("User role data invalid"), { userId }, actionName);
      return null;
    }
    let permissionsList: AppPermissionIdType[] = userFromDb.role.permissions.map(p => p.id as AppPermissionIdType);
    return {
      id: userFromDb.id,
      username: userFromDb.username,
      email: userFromDb.email,
      roleId: userFromDb.roleId,
      roleName: userFromDb.role.name as AppRoleNameType,
      avatar: userFromDb.avatar || '/images/avatars/default_avatar.png',
      permissions: permissionsList,
      lastLogin: userFromDb.lastLogin?.toISOString() || undefined
    };
  } catch (error) {
    logger.error(`[${actionName}] Error for userId ${userId}`, error as Error, { userId }, actionName);
    return null;
  }
}

export async function getUsersAction(params?: FetchParams): Promise<PaginatedResponse<AppUser>> {
  const actionName = 'getUsersAction';
  try {
    const page = params?.page || 1; const pageSize = params?.pageSize || DEFAULT_PAGE_SIZE; const skip = (page - 1) * pageSize;
    const totalCount = await prisma.user.count(); const totalPages = Math.ceil(totalCount / pageSize);
    const usersFromDb = await prisma.user.findMany({ include: { role: { include: { permissions: true } } }, orderBy: { username: 'asc' }, skip, take: pageSize });
    const appUsers: AppUser[] = usersFromDb.map(user => ({ id: user.id, username: user.username, email: user.email, roleId: user.roleId, roleName: user.role.name as AppRoleNameType, avatar: user.avatar || undefined, lastLogin: user.lastLogin?.toISOString() || undefined, permissions: user.role.permissions.map(p => p.id as AppPermissionIdType) }));
    return { data: appUsers, totalCount, currentPage: page, totalPages, pageSize };
  } catch (error) { logger.error(`Error in ${actionName}`, error as Error, undefined, actionName); throw new AppError("获取用户数据时发生服务器错误。", 500, "GET_USERS_FAILED", "无法加载用户数据。"); }
}

export async function createUserAction(data: Omit<AppUser, "id" | "lastLogin" | "roleName"> & { password: string, avatar?: string, phone?: string | null }, performingUserId?: string): Promise<ActionResponse<FetchedUserDetails>> {
  const actionName = 'createUserAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    if (!data.password) throw new ValidationError("新用户需要密码。", "password", undefined, "新用户需要密码。");
    if (await prisma.user.findUnique({ where: { email: data.email } })) throw new ResourceError(`邮箱 "${data.email}" 已被使用。`, 'EMAIL_ALREADY_EXISTS', `邮箱 "${data.email}" 已被使用。`, 'email');
    if (await prisma.user.findUnique({ where: { username: data.username } })) throw new ResourceError(`用户名 "${data.username}" 已被使用。`, 'USERNAME_ALREADY_EXISTS', `用户名 "${data.username}" 已被使用。`, 'username');
    if (!(await prisma.role.findUnique({ where: { id: data.roleId } }))) throw new NotFoundError(`角色 ID: ${data.roleId}`, `角色 ID ${data.roleId} 未找到。`, 'roleId');

    const encryptedPassword = encrypt(data.password);

    const newUser = await prisma.user.create({
      data: { username: data.username, email: data.email, password: encryptedPassword, phone: data.phone || null, roleId: data.roleId, avatar: data.avatar || '/images/avatars/default_avatar.png' },
      include: { role: { include: { permissions: true } } }
    });
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'create_user', details: `创建了用户 ${newUser.username}` } });
    revalidatePath("/users");
    const fetchedUser: FetchedUserDetails = { id: newUser.id, username: newUser.username, email: newUser.email, roleId: newUser.roleId, roleName: newUser.role.name as AppRoleNameType, avatar: newUser.avatar || undefined, permissions: newUser.role.permissions.map(p => p.id as AppPermissionIdType), lastLogin: newUser.lastLogin?.toISOString() || undefined };
    return { success: true, data: fetchedUser };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

export async function updateUserAction(id: string, data: Partial<Omit<AppUser, "id" | "roleName">> & { password?: string }, performingUserId?: string): Promise<ActionResponse<FetchedUserDetails>> {
  const actionName = 'updateUserAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    const userToUpdate = await prisma.user.findUnique({ where: { id } });
    if (!userToUpdate) throw new NotFoundError(`用户 ID: ${id}`, `用户 ID ${id} 未找到。`);
    const updateData: Prisma.UserUpdateInput = {};
    if (data.username && data.username !== userToUpdate.username) { if (await prisma.user.findFirst({ where: { username: data.username, NOT: { id } } })) throw new ResourceError(`用户名 "${data.username}" 已被使用。`, 'USERNAME_ALREADY_EXISTS', `用户名 "${data.username}" 已被使用。`, 'username'); updateData.username = data.username; }
    if (data.email && data.email !== userToUpdate.email) { if (await prisma.user.findFirst({ where: { email: data.email, NOT: { id } } })) throw new ResourceError(`邮箱 "${data.email}" 已被使用。`, 'EMAIL_ALREADY_EXISTS', `邮箱 "${data.email}" 已被使用。`, 'email'); updateData.email = data.email; }
    if (data.roleId && data.roleId !== userToUpdate.roleId) { if (!(await prisma.role.findUnique({ where: { id: data.roleId } }))) throw new NotFoundError(`角色 ID: ${data.roleId}`, `角色 ID ${data.roleId} 未找到。`, 'roleId'); updateData.role = { connect: { id: data.roleId } }; }
    if (data.password) updateData.password = encrypt(data.password);
    if (data.hasOwnProperty('phone')) updateData.phone = data.phone || null;
    if (data.avatar) updateData.avatar = data.avatar;
    if (Object.keys(updateData).length === 0) { const currentUserDetails = await fetchCurrentUserDetailsAction(id); if(!currentUserDetails) throw new NotFoundError(`用户 ID: ${id}`, `用户 ID ${id} 未找到。`); return { success: true, data: currentUserDetails }; }
    const updatedUser = await prisma.user.update({ where: { id }, data: updateData, include: { role: { include: { permissions: true } } } });
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'update_user', details: `更新了用户 ${updatedUser.username}` } });
    revalidatePath("/users");
    const fetchedUser: FetchedUserDetails = { id: updatedUser.id, username: updatedUser.username, email: updatedUser.email, roleId: updatedUser.roleId, roleName: updatedUser.role.name as AppRoleNameType, avatar: updatedUser.avatar || undefined, permissions: updatedUser.role.permissions.map(p => p.id as AppPermissionIdType), lastLogin: updatedUser.lastLogin?.toISOString() || undefined };
    return { success: true, data: fetchedUser };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

export async function updateOwnPasswordAction(userId: string, payload: { currentPassword?: string; newPassword?: string; }): Promise<ActionResponse<{ message: string }>> {
    const actionName = 'updateOwnPasswordAction';
    try {
        const { currentPassword, newPassword } = payload;
        if (!currentPassword || !newPassword) throw new ValidationError("当前密码和新密码都是必需的。", "currentPassword", undefined, "当前密码和新密码都是必需的。");
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new AuthError("用户未找到。", "用户身份验证失败。");

        let decryptedStoredPassword;
        try {
            decryptedStoredPassword = decrypt(user.password);
        } catch (decryptionError) {
            logger.error(`[${actionName}] Password decryption failed for user ${user.username} during own password update.`, decryptionError as Error, { userId }, actionName);
            throw new AuthError("认证参数错误，无法验证当前密码。", "当前密码认证失败。");
        }

        if (decryptedStoredPassword !== currentPassword) throw new AuthError("当前密码不正确。", "当前密码不正确。", "currentPassword");
        if (currentPassword === newPassword) throw new ValidationError("新密码不能与当前密码相同。", "newPassword", undefined, "新密码不能与当前密码相同。");

        const encryptedNewPassword = encrypt(newPassword);
        await prisma.user.update({ where: { id: userId }, data: { password: encryptedNewPassword } });
        await prisma.auditLog.create({ data: { userId: user.id, username: user.username, action: 'update_own_password', details: `用户 ${user.username} 更改了自己的密码。` } });
        return { success: true, data: { message: "密码已成功更新。" } };
    } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

export async function deleteUserAction(id: string, performingUserId?: string): Promise<ActionResponse> {
  const actionName = 'deleteUserAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    const userToDelete = await prisma.user.findUnique({ where: { id } });
    if (!userToDelete) throw new NotFoundError(`用户 ID: ${id}`, `用户 ID ${id} 未找到。`);
    if (userToDelete.id === performingUserId) throw new ResourceError("无法删除当前登录的用户。", "CANNOT_DELETE_SELF", "无法删除当前登录的用户。");
    await prisma.auditLog.updateMany({ where: { userId: id }, data: { userId: null }});
    await prisma.user.delete({ where: { id } });
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'delete_user', details: `删除了用户 ${userToDelete.username}` } });
    revalidatePath("/users");
    return { success: true };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

export async function getRolesAction(params?: FetchParams): Promise<PaginatedResponse<AppRole>> {
  const actionName = 'getRolesAction';
  try {
    const page = params?.page || 1; const pageSize = params?.pageSize || DEFAULT_PAGE_SIZE; const skip = (page - 1) * pageSize;
    const totalCount = await prisma.role.count(); const totalPages = Math.ceil(totalCount / pageSize);
    const rolesFromDb = await prisma.role.findMany({ include: { permissions: true, _count: { select: { users: true } } }, orderBy: { name: 'asc' }, skip, take: pageSize });
    const appRoles: AppRole[] = rolesFromDb.map(role => ({ id: role.id, name: role.name as AppRoleNameType, description: role.description || undefined, permissions: role.permissions.map(p => p.id as AppPermissionIdType), userCount: (role._count && typeof role._count === 'object' ? role._count.users : 0) || 0 }));
    return { data: appRoles, totalCount, currentPage: page, totalPages, pageSize };
  } catch (error) { logger.error(`Error in ${actionName}`, error as Error, undefined, actionName); throw new AppError("获取角色数据时发生服务器错误。", 500, "GET_ROLES_FAILED", "无法加载角色数据。"); }
}

export async function updateRoleAction(id: string, data: Partial<Omit<AppRole, "id" | "userCount" | "name">> & { permissions?: AppPermissionIdType[] }, performingUserId?: string): Promise<ActionResponse<AppRole>> {
  const actionName = 'updateRoleAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    const roleToUpdate = await prisma.role.findUnique({ where: { id } });
    if (!roleToUpdate) throw new NotFoundError(`角色 ID: ${id}`, `角色 ID ${id} 未找到。`);
    const updatePayload: Prisma.RoleUpdateInput = {};
    if (data.description !== undefined) updatePayload.description = data.description || null;
    if (data.permissions) {
        if (roleToUpdate.name === 'Administrator') throw new ResourceError("不能修改 Administrator 角色的权限。", "ADMIN_ROLE_PERMISSIONS_PROTECTED", "不能修改 Administrator 角色的权限。");
        const validPermissions = await prisma.permission.findMany({ where: { id: { in: data.permissions } } });
        if (validPermissions.length !== data.permissions.length) throw new ValidationError("一个或多个提供的权限 ID 无效。", "permissions", undefined, "一个或多个提供的权限ID无效。");
        updatePayload.permissions = { set: data.permissions.map(pid => ({ id: pid })) };
    }
    if (Object.keys(updatePayload).length === 0) { const currentRoleData = await prisma.role.findUnique({ where: { id }, include: {permissions: true, _count: {select: {users: true}}} }); if (!currentRoleData) throw new NotFoundError(`角色 ID: ${id}`, `角色 ID ${id} 未找到。`); const appRole : AppRole = { id: currentRoleData.id, name: currentRoleData.name as AppRoleNameType, description: currentRoleData.description || undefined, permissions: currentRoleData.permissions.map(p=>p.id as AppPermissionIdType), userCount: (currentRoleData._count && typeof currentRoleData._count === 'object' ? currentRoleData._count.users : 0) || 0 }; return { success: true, data: appRole }; }
    const updatedRole = await prisma.role.update({ where: { id }, data: updatePayload, include: { permissions: true, _count: {select: {users: true}} } });
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'update_role', details: `更新了角色 ${updatedRole.name}` } });
    revalidatePath("/roles");
    const appRole : AppRole = { id: updatedRole.id, name: updatedRole.name as AppRoleNameType, description: updatedRole.description || undefined, permissions: updatedRole.permissions.map(p=>p.id as AppPermissionIdType), userCount: (updatedRole._count && typeof updatedRole._count === 'object' ? updatedRole._count.users : 0) || 0 };
    return { success: true, data: appRole };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

export async function getAllPermissionsAction(): Promise<AppPermission[]> { return seedPermissionsData.map(p => ({ ...p, description: p.description || undefined })); }

export async function getAuditLogsAction(params?: FetchParams): Promise<PaginatedResponse<AuditLog>> {
  const actionName = 'getAuditLogsAction';
  try {
    const page = params?.page || 1; const pageSize = params?.pageSize || DEFAULT_PAGE_SIZE; const skip = (page - 1) * pageSize; // Use DEFAULT_PAGE_SIZE
    const totalCount = await prisma.auditLog.count(); const totalPages = Math.ceil(totalCount / pageSize);
    const logsFromDb = await prisma.auditLog.findMany({ orderBy: { timestamp: 'desc' }, skip, take: pageSize });
    const appLogs: AuditLog[] = logsFromDb.map(log => ({ id: log.id, userId: log.userId || undefined, username: log.username || '系统', action: log.action, timestamp: log.timestamp.toISOString(), details: log.details || undefined }));
    return { data: appLogs, totalCount, currentPage: page, totalPages, pageSize };
  } catch (error) { logger.error(`Error in ${actionName}`, error as Error, undefined, actionName); throw new AppError("获取审计日志数据时发生服务器错误。", 500, "GET_AUDIT_LOGS_FAILED", "无法加载审计日志数据。"); }
}

export async function deleteAuditLogAction(id: string, performingUserId?: string): Promise<ActionResponse> {
  const actionName = 'deleteAuditLogAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    if (!(await prisma.auditLog.findUnique({ where: { id } }))) throw new NotFoundError(`审计日志 ID: ${id}`, `审计日志 ID ${id} 未找到。`);
    await prisma.auditLog.delete({ where: { id } });
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'delete_audit_log_entry', details: `删除了审计日志条目 ID ${id}` } });
    revalidatePath("/audit-logs");
    return { success: true };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

export async function batchDeleteAuditLogsAction(ids: string[], performingUserId?: string): Promise<BatchDeleteResult> {
  const actionName = 'batchDeleteAuditLogsAction';
  const BATCH_SIZE = 100;
  const auditUser = await getAuditUserInfo(performingUserId);
  const failureDetails: BatchOperationFailure[] = [];
  const successfullyDeletedIds: string[] = [];
  let successCount = 0;

  const itemsToProcess = await prisma.auditLog.findMany({
    where: { id: { in: ids } },
    select: { id: true }
  });
  const validIdsToDelete = new Set(itemsToProcess.map(item => item.id));

  for (const id of ids) {
    if (!validIdsToDelete.has(id)) {
      failureDetails.push({ id, itemIdentifier: `日志 ID ${id}`, error: '审计日志条目未找到。' });
    }
  }
  
  const validIdArray = Array.from(validIdsToDelete);

  for (let i = 0; i < validIdArray.length; i += BATCH_SIZE) {
    const batch = validIdArray.slice(i, i + BATCH_SIZE);
    
    try {
      const result = await prisma.auditLog.deleteMany({
        where: { id: { in: batch } }
      });
      const deletedCountInBatch = result.count;
      successCount += deletedCountInBatch;
      batch.forEach(id => successfullyDeletedIds.push(id));
    } catch (error: unknown) {
      const errRes = createActionErrorResponse(error, `${actionName}_transaction_batch`);
      batch.forEach(failedId => {
        failureDetails.push({ id: failedId, itemIdentifier: `日志 ID ${failedId}`, error: `事务失败: ${errRes.userMessage}` });
      });
    }
  }
  
  if (successCount > 0) {
    await prisma.auditLog.create({
      data: {
        userId: auditUser.userId,
        username: auditUser.username,
        action: 'batch_delete_audit_log',
        details: `批量成功删除了 ${successCount} 条审计日志。IDs: ${successfullyDeletedIds.slice(0, 10).join(', ')}${successfullyDeletedIds.length > 10 ? '...' : ''}。最初选中 ${ids.length} 个。`
      }
    });
    revalidatePath("/audit-logs");
  }

  return { successCount, failureCount: failureDetails.length, failureDetails };
}

export async function getSubnetsAction(params?: FetchParams): Promise<PaginatedResponse<AppSubnet>> {
  const actionName = 'getSubnetsAction';
  try {
    const page = params?.page || 1;
    const pageSize = params?.pageSize || DEFAULT_PAGE_SIZE;
    const skip = (page - 1) * pageSize;
    const whereClause = {};

    const [totalCount, subnetsFromDb] = await prisma.$transaction([
      prisma.subnet.count({ where: whereClause }),
      prisma.subnet.findMany({
        where: whereClause,
        orderBy: { cidr: 'asc' },
        ...(params?.page && params?.pageSize && { skip, take: pageSize }),
      }),
    ]);
    
    const totalPages = (pageSize > 0 && totalCount > 0) ? Math.ceil(totalCount / pageSize) : 1;

    let appSubnets: AppSubnet[] = [];
    if (subnetsFromDb.length > 0) {
      const subnetIds = subnetsFromDb.map(s => s.id);
      
      const allocatedIpCountsBySubnet = await prisma.iPAddress.groupBy({
        by: ['subnetId'],
        _count: { id: true },
        where: { subnetId: { in: subnetIds }, status: 'allocated' },
      });

      const allocatedIpCountMap = new Map<string, number>();
      allocatedIpCountsBySubnet.forEach(group => {
        if (group.subnetId) {
          allocatedIpCountMap.set(group.subnetId, group._count.id);
        }
      });

      appSubnets = subnetsFromDb.map(subnet => {
        if (!subnet.cidr || typeof subnet.cidr !== 'string' || subnet.cidr.trim() === "") {
          logger.warn(`[${actionName}] Subnet ID ${subnet.id} invalid CIDR.`, undefined, { subnetId: subnet.id, cidrFromDb: subnet.cidr });
          return { ...subnet, cidr: subnet.cidr || "Invalid/Missing CIDR", networkAddress: subnet.networkAddress || "N/A", subnetMask: subnet.subnetMask || "N/A", ipRange: subnet.ipRange || undefined, name: subnet.name || undefined, dhcpEnabled: subnet.dhcpEnabled ?? false, vlanId: subnet.vlanId || undefined, description: subnet.description || undefined, utilization: 0 };
        }
        const subnetProperties = getSubnetPropertiesFromCidr(subnet.cidr);
        let utilization = 0;
        if (subnetProperties) {
          const totalUsableIps = getUsableIpCount(subnetProperties.prefix);
          const allocatedIpsCount = allocatedIpCountMap.get(subnet.id) || 0;
          if (totalUsableIps > 0) {
            const rawPercentage = (allocatedIpsCount / totalUsableIps) * 100;
             utilization = (allocatedIpsCount > 0 && rawPercentage > 0 && rawPercentage < 1) ? 1 : Math.round(rawPercentage);
          }
        }
        return { ...subnet, name: subnet.name || undefined, dhcpEnabled: subnet.dhcpEnabled ?? false, vlanId: subnet.vlanId || undefined, description: subnet.description || undefined, utilization, ipRange: subnet.ipRange || undefined };
      });
    }

    return { data: appSubnets, totalCount, currentPage: page, totalPages, pageSize };
  } catch (error: unknown) {
    logger.error(`Error in ${actionName}`, error as Error, undefined, actionName);
    if (error instanceof AppError) throw error;
    throw new AppError("获取子网数据时发生服务器错误。", 500, "GET_SUBNETS_FAILED", "无法加载子网数据。");
  }
}

export interface CreateSubnetData { cidr: string; name?: string | null | undefined; dhcpEnabled?: boolean | null | undefined; vlanId?: string | null | undefined; description?: string | null | undefined; }
export async function createSubnetAction(data: CreateSubnetData, performingUserId?: string): Promise<ActionResponse<AppSubnet>> {
  const actionName = 'createSubnetAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    validateCidrInputFormat(data.cidr, 'cidr');
    const newSubnetProperties = getSubnetPropertiesFromCidr(data.cidr);
    if (!newSubnetProperties) throw new AppError('Failed to parse CIDR properties for new subnet.', 500, 'CIDR_PARSE_UNEXPECTED_ERROR', '无法解析提供的CIDR。');

    const canonicalCidrToStore = newSubnetProperties.networkAddress + "/" + newSubnetProperties.prefix;
    if (await prisma.subnet.findUnique({ where: { cidr: canonicalCidrToStore } })) {
        throw new ResourceError(`子网 ${canonicalCidrToStore} 已存在。`, 'SUBNET_ALREADY_EXISTS', `子网 ${canonicalCidrToStore} 已存在。`, 'cidr');
    }
    const allExistingSubnets = await prisma.subnet.findMany();
    const overlappingSubnets: string[] = [];
    for (const existingSub of allExistingSubnets) {
      const existingSubProps = getSubnetPropertiesFromCidr(existingSub.cidr);
      if (existingSubProps && doSubnetsOverlap(newSubnetProperties, existingSubProps)) {
        overlappingSubnets.push(existingSub.cidr);
      }
    }
    if (overlappingSubnets.length > 0) {
      throw new ResourceError(
        `新的子网 ${data.cidr} 与以下现有子网重叠: ${overlappingSubnets.join(', ')}。`,
        'SUBNET_OVERLAP_ERROR',
        `新的子网 ${data.cidr} 与以下现有子网重叠: ${overlappingSubnets.join(', ')}。`,
        'cidr'
      );
    }

    const createPayload: Prisma.SubnetCreateInput = {
        cidr: canonicalCidrToStore,
        networkAddress: newSubnetProperties.networkAddress,
        subnetMask: newSubnetProperties.subnetMask,
        ipRange: newSubnetProperties.ipRange || null,
        name: (data.name === undefined || data.name === "") ? null : data.name,
        dhcpEnabled: data.dhcpEnabled ?? false,
        description: (data.description === undefined || data.description === "") ? null : data.description,
    };
    if (data.vlanId) {
        if (!(await prisma.vLAN.findUnique({ where: { id: data.vlanId } }))) {
          throw new NotFoundError(`VLAN ID: ${data.vlanId}`, `VLAN ID ${data.vlanId} 未找到。`, 'vlanId');
        }
        createPayload.vlan = { connect: { id: data.vlanId } };
    }
    const newSubnetPrisma = await prisma.subnet.create({ data: createPayload, include: { vlan: true } });
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'create_subnet', details: `创建了子网 ${newSubnetPrisma.cidr}` } });
    revalidatePath("/subnets"); revalidatePath("/dashboard"); revalidatePath("/ip-addresses"); revalidatePath("/query");
    const appSubnet: AppSubnet = { ...newSubnetPrisma, name: newSubnetPrisma.name || undefined, dhcpEnabled: newSubnetPrisma.dhcpEnabled ?? false, vlanId: newSubnetPrisma.vlanId || undefined, description: newSubnetPrisma.description || undefined, utilization: 0, ipRange: newSubnetPrisma.ipRange || undefined };
    return { success: true, data: appSubnet };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

export interface UpdateSubnetData { cidr?: string; name?: string | null | undefined; dhcpEnabled?: boolean | null | undefined; vlanId?: string | null | undefined; description?: string | null | undefined; }
export async function updateSubnetAction(id: string, data: UpdateSubnetData, performingUserId?: string): Promise<ActionResponse<AppSubnet>> {
  const actionName = 'updateSubnetAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    const subnetToUpdate = await prisma.subnet.findUnique({ where: { id } });
    if (!subnetToUpdate) throw new NotFoundError(`子网 ID: ${id}`, `子网 ID ${id} 未找到。`);

    const updateData: Prisma.SubnetUpdateInput = {};
    const originalCidrForLog = subnetToUpdate.cidr;
    let newCanonicalCidrForLog = subnetToUpdate.cidr;

    if (data.cidr && data.cidr !== subnetToUpdate.cidr) {
      validateCidrInputFormat(data.cidr, 'cidr');
      const newSubnetProperties = getSubnetPropertiesFromCidr(data.cidr);
      if (!newSubnetProperties) throw new AppError('Failed to parse new CIDR properties.', 500, 'CIDR_PARSE_UNEXPECTED_ERROR', '无法解析新的CIDR。');
      newCanonicalCidrForLog = newSubnetProperties.networkAddress + "/" + newSubnetProperties.prefix;

      if (await prisma.subnet.findFirst({ where: { cidr: newCanonicalCidrForLog, NOT: { id } } })) {
        throw new ResourceError(`子网 ${newCanonicalCidrForLog} 已存在。`, 'SUBNET_ALREADY_EXISTS', `子网 ${newCanonicalCidrForLog} 已存在。`, 'cidr');
      }
      const otherExistingSubnets = await prisma.subnet.findMany({ where: { NOT: { id } } });
      const overlappingSubnets: string[] = [];
      for (const existingSub of otherExistingSubnets) {
        const existingSubProps = getSubnetPropertiesFromCidr(existingSub.cidr);
        if (existingSubProps && doSubnetsOverlap(newSubnetProperties, existingSubProps)) {
          overlappingSubnets.push(existingSub.cidr);
        }
      }
      if (overlappingSubnets.length > 0) {
        throw new ResourceError(
          `更新后的子网 ${newCanonicalCidrForLog} 与以下现有子网重叠: ${overlappingSubnets.join(', ')}。`,
          'SUBNET_OVERLAP_ERROR',
          `更新后的子网 ${newCanonicalCidrForLog} 与以下现有子网重叠: ${overlappingSubnets.join(', ')}。`,
          'cidr'
        );
      }

      updateData.cidr = newCanonicalCidrForLog;
      updateData.networkAddress = newSubnetProperties.networkAddress;
      updateData.subnetMask = newSubnetProperties.subnetMask;
      updateData.ipRange = newSubnetProperties.ipRange || null;

      const associatedIPs = await prisma.iPAddress.findMany({ where: { subnetId: id } });
      const ipsToUpdateOrDisassociate: { id: string; updates: Prisma.IPAddressUpdateInput }[] = [];
      let disassociatedIpLogDetails = "";

      for (const ip of associatedIPs) {
        if (!isIpInCidrRange(ip.ipAddress, newSubnetProperties)) {
          ipsToUpdateOrDisassociate.push({
            id: ip.id,
            updates: {
              subnet: { disconnect: true },
              status: 'free' as AppIPAddressStatusType,
              allocatedTo: null, usageUnit: null, contactPerson: null, phone: null, isGateway: false,
              directVlan: { disconnect: true },
              peerUnitName: null, peerDeviceName: null, peerPortName: null,
              selectedAccessType: null, selectedLocalDeviceName: null, selectedDevicePort: null, selectedPaymentSource: null,
              description: `(原属于子网 ${originalCidrForLog}) ${ip.description || ''}`.trim(),
            }
          });
          disassociatedIpLogDetails += `IP ${ip.ipAddress} (原状态: ${ip.status}) 已解除关联并设为空闲; `;
        }
      }
      if (ipsToUpdateOrDisassociate.length > 0) {
        await prisma.$transaction(ipsToUpdateOrDisassociate.map(item => prisma.iPAddress.update({ where: { id: item.id }, data: item.updates })));
        await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'auto_disassociate_ips_on_subnet_resize', details: `子网 ${originalCidrForLog} 调整大小为 ${newCanonicalCidrForLog}。 ${disassociatedIpLogDetails}` } });
      }
    }
    if (data.hasOwnProperty('name')) updateData.name = (data.name === undefined || data.name === "") ? null : data.name;
    if (data.hasOwnProperty('dhcpEnabled')) updateData.dhcpEnabled = data.dhcpEnabled ?? false;
    if (data.hasOwnProperty('vlanId')) {
        const newVlanId = data.vlanId;
        if (newVlanId === null || newVlanId === "" || newVlanId === undefined) {
            updateData.vlan = { disconnect: true };
        } else {
            if (!(await prisma.vLAN.findUnique({where: {id: newVlanId}}))) {
              throw new NotFoundError(`VLAN ID: ${newVlanId}`, `VLAN ID ${newVlanId} 未找到。`, 'vlanId');
            }
            updateData.vlan = { connect: { id: newVlanId } };
        }
    }
    if (data.hasOwnProperty('description')) updateData.description = (data.description === undefined || data.description === "") ? null : data.description;

    if (Object.keys(updateData).length === 0) {
      const utilization = await calculateSubnetUtilizationHelper(id);
      const currentAppSubnet: AppSubnet = { ...subnetToUpdate, name: subnetToUpdate.name || undefined, dhcpEnabled: subnetToUpdate.dhcpEnabled ?? false, vlanId: subnetToUpdate.vlanId || undefined, description: subnetToUpdate.description || undefined, ipRange: subnetToUpdate.ipRange || undefined, utilization };
      return { success: true, data: currentAppSubnet };
    }
    const updatedSubnetPrisma = await prisma.subnet.update({ where: { id }, data: updateData, include: { vlan: true } });
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'update_subnet', details: `更新了子网 ID ${id} (旧 CIDR: ${originalCidrForLog}, 新 CIDR: ${newCanonicalCidrForLog})` } });
    revalidatePath("/subnets"); revalidatePath("/dashboard"); revalidatePath("/ip-addresses"); revalidatePath("/query");
    const utilization = await calculateSubnetUtilizationHelper(updatedSubnetPrisma.id);
    const appSubnet: AppSubnet = { ...updatedSubnetPrisma, name: updatedSubnetPrisma.name || undefined, dhcpEnabled: updatedSubnetPrisma.dhcpEnabled ?? false, vlanId: updatedSubnetPrisma.vlanId || undefined, description: updatedSubnetPrisma.description || undefined, ipRange: updatedSubnetPrisma.ipRange || undefined, utilization };
    return { success: true, data: appSubnet };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

async function calculateSubnetUtilizationHelper(subnetId: string): Promise<number> {
    const subnet = await prisma.subnet.findUnique({ where: { id: subnetId } }); 
    if (!subnet || !subnet.cidr) {
        logger.warn(`Could not find subnet or subnet CIDR for ID: ${subnetId} in calculateSubnetUtilizationHelper.`);
        return 0;
    }
    const subnetProperties = getSubnetPropertiesFromCidr(subnet.cidr); 
    if (!subnetProperties || typeof subnetProperties.prefix !== 'number') {
        logger.warn(`Could not parse CIDR properties for subnet: ${subnet.cidr} (ID: ${subnetId}).`);
        return 0;
    }
    const totalUsableIps = getUsableIpCount(subnetProperties.prefix); if (totalUsableIps === 0) return 0;
    const allocatedIpsCount = await prisma.iPAddress.count({ where: { subnetId: subnetId, status: "allocated" } });
    const rawPercentage = (allocatedIpsCount / totalUsableIps) * 100;
    if (allocatedIpsCount > 0 && rawPercentage > 0 && rawPercentage < 1) {
      return 1;
    }
    return Math.round(rawPercentage);
}

export async function deleteSubnetAction(id: string, performingUserId?: string): Promise<ActionResponse> {
  const actionName = 'deleteSubnetAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    const subnetToDelete = await prisma.subnet.findUnique({ where: { id }, include: { vlan: true } });
    if (!subnetToDelete) throw new NotFoundError(`子网 ID: ${id}`, `子网 ID ${id} 未找到。`);

    if (subnetToDelete.vlanId && subnetToDelete.vlanId.trim() !== "") {
      const vlanMsg = subnetToDelete.vlan ? `VLAN ${subnetToDelete.vlan.vlanNumber}` : `VLAN (ID: ${subnetToDelete.vlanId})`;
      throw new ResourceError(`子网 ${subnetToDelete.cidr} 已关联到 ${vlanMsg}，无法删除。`, 'SUBNET_HAS_VLAN_ASSOCIATION', `子网 ${subnetToDelete.cidr} 已关联到 ${vlanMsg}，无法删除。`);
    }
    if (await prisma.iPAddress.count({ where: { subnetId: id, status: 'allocated' } }) > 0) {
      throw new ResourceError(`子网 ${subnetToDelete.cidr} 中仍有已分配的 IP，无法删除。`, 'SUBNET_HAS_ALLOCATED_IPS', `子网 ${subnetToDelete.cidr} 中仍有已分配的 IP，无法删除。`);
    }
    if (await prisma.iPAddress.count({ where: { subnetId: id, status: 'reserved' } }) > 0) {
      throw new ResourceError(`子网 ${subnetToDelete.cidr} 中仍有预留的 IP，无法删除。`, 'SUBNET_HAS_RESERVED_IPS', `子网 ${subnetToDelete.cidr} 中仍有预留的 IP，无法删除。`);
    }

    const freeIpsInSubnet = await prisma.iPAddress.findMany({ where: { subnetId: id, status: 'free' } });
    const operations: Prisma.PrismaPromise<any>[] = [];

    if (freeIpsInSubnet.length > 0) {
      freeIpsInSubnet.forEach(ip =>
        operations.push(prisma.iPAddress.update({
          where: { id: ip.id },
          data: {
            subnet: { disconnect: true },
            directVlan: { disconnect: true },
            description: `(原属于已删除子网 ${subnetToDelete.cidr}) ${ip.description || ''}`.trim(),
          }
        }))
      );
    }
    operations.push(prisma.subnet.delete({ where: { id } }));
    
    await prisma.$transaction(operations);

    if (freeIpsInSubnet.length > 0) {
      await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'auto_disassociate_free_ips_on_subnet_delete', details: `子网 ${subnetToDelete.cidr} 删除前，其 ${freeIpsInSubnet.length} 个空闲 IP 已解除关联。` } });
    }
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'delete_subnet', details: `删除了子网 ${subnetToDelete.cidr}` } });
    revalidatePath("/subnets"); revalidatePath("/ip-addresses"); revalidatePath("/dashboard"); revalidatePath("/query");
    return { success: true };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

export async function batchDeleteSubnetsAction(ids: string[], performingUserId?: string): Promise<BatchDeleteResult> {
  const actionName = 'batchDeleteSubnetsAction';
  const auditUser = await getAuditUserInfo(performingUserId);
  const failureDetails: BatchOperationFailure[] = [];
  const successfullyDeletedCidrs: string[] = [];

  const subnetsToProcess = await prisma.subnet.findMany({
    where: { id: { in: ids } },
    include: { vlan: true }
  });
  const subnetsMap = new Map(subnetsToProcess.map(s => [s.id, s]));

  const validDeletes: Array<{ id: string; cidr: string }> = [];

  // Pre-validation loop to find which subnets can be deleted
  for (const id of ids) {
    const subnetToDelete = subnetsMap.get(id);
    const itemIdentifier = subnetToDelete?.cidr || `ID ${id}`;

    if (!subnetToDelete) {
      failureDetails.push({ id, itemIdentifier, error: '子网未找到。' });
      continue;
    }
    try {
      if (subnetToDelete.vlanId && subnetToDelete.vlanId.trim() !== "") {
        const vlanMsg = subnetToDelete.vlan ? `VLAN ${subnetToDelete.vlan.vlanNumber}` : `VLAN (ID: ${subnetToDelete.vlanId})`;
        throw new ResourceError(`子网 ${subnetToDelete.cidr} 已关联到 ${vlanMsg}。`, 'SUBNET_HAS_VLAN_ASSOCIATION_BATCH', `子网 ${subnetToDelete.cidr} 已关联到 ${vlanMsg}。`);
      }
      if (await prisma.iPAddress.count({ where: { subnetId: id, status: 'allocated' } }) > 0) throw new ResourceError(`子网 ${subnetToDelete.cidr} 中仍有已分配的 IP。`, 'SUBNET_HAS_ALLOCATED_IPS_BATCH', `子网 ${subnetToDelete.cidr} 中仍有已分配的 IP。`);
      if (await prisma.iPAddress.count({ where: { subnetId: id, status: 'reserved' } }) > 0) throw new ResourceError(`子网 ${subnetToDelete.cidr} 中仍有预留的 IP。`, 'SUBNET_HAS_RESERVED_IPS_BATCH', `子网 ${subnetToDelete.cidr} 中仍有预留的 IP。`);
      validDeletes.push({ id: subnetToDelete.id, cidr: subnetToDelete.cidr });
    } catch (e: unknown) {
      const errRes = createActionErrorResponse(e, `${actionName}_single_check`);
      failureDetails.push({ id, itemIdentifier, error: errRes.userMessage });
    }
  }

  let successCount = 0;
  const BATCH_SIZE = 50; // Smaller batch size for complex operations involving multiple tables

  // Batch processing loop for valid deletes
  for (let i = 0; i < validDeletes.length; i += BATCH_SIZE) {
    const batch = validDeletes.slice(i, i + BATCH_SIZE);
    const batchIds = batch.map(item => item.id);
    const transactionOperations: Prisma.PrismaPromise<any>[] = [];

    try {
      // Find all free IPs in all subnets of the current batch
      const freeIpsInBatchSubnets = await prisma.iPAddress.findMany({
        where: { subnetId: { in: batchIds }, status: 'free' }
      });

      // Prepare updates for these free IPs
      if (freeIpsInBatchSubnets.length > 0) {
        const subnetCidrMap = new Map(batch.map(s => [s.id, s.cidr]));
        freeIpsInBatchSubnets.forEach(ip => {
          const cidr = ip.subnetId ? subnetCidrMap.get(ip.subnetId) : 'unknown';
          transactionOperations.push(prisma.iPAddress.update({
            where: { id: ip.id },
            data: {
              subnet: { disconnect: true },
              directVlan: { disconnect: true },
              description: `(原属于已删除子网 ${cidr}) ${ip.description || ''}`.trim(),
            }
          }));
        });
      }

      // Add the delete operations for the subnets in the current batch
      batch.forEach(subnet => {
        transactionOperations.push(prisma.subnet.delete({ where: { id: subnet.id } }));
      });
      
      // Execute transaction for the current batch
      await prisma.$transaction(transactionOperations);
      successCount += batch.length;
      batch.forEach(item => successfullyDeletedCidrs.push(item.cidr));

    } catch (transactionError: unknown) {
      const errRes = createActionErrorResponse(transactionError, `${actionName}_transaction`);
      batch.forEach(item => {
        // Avoid adding duplicate failures if they were already caught in pre-validation
        if (!failureDetails.some(f => f.id === item.id)) {
          failureDetails.push({ id: item.id, itemIdentifier: item.cidr, error: `事务失败: ${errRes.userMessage}` });
        }
      });
    }
  }

  if (successCount > 0) {
    await prisma.auditLog.create({
      data: {
        userId: auditUser.userId,
        username: auditUser.username,
        action: 'batch_delete_subnet',
        details: `批量成功删除了 ${successCount} 个子网: ${successfullyDeletedCidrs.join(', ')}。最初选中 ${ids.length} 个。`
      }
    });
    revalidatePath("/subnets");
    revalidatePath("/ip-addresses");
    revalidatePath("/dashboard");
    revalidatePath("/query");
  }
  return { successCount, failureCount: failureDetails.length, failureDetails };
}


export async function getVLANsAction(params?: FetchParams): Promise<PaginatedResponse<AppVLAN>> {
  const page = params?.page || 1;
  const pageSize = params?.pageSize || DEFAULT_PAGE_SIZE;
  const skip = (page - 1) * pageSize;
  const whereClause = {};

  const totalCount = await prisma.vLAN.count({ where: whereClause });
  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  const vlansFromDb = params?.page && params?.pageSize
    ? await prisma.vLAN.findMany({ where: whereClause, orderBy: { vlanNumber: 'asc' }, skip, take: pageSize })
    : await prisma.vLAN.findMany({ where: whereClause, orderBy: { vlanNumber: 'asc' } });
  
  const vlanIds = vlansFromDb.map(v => v.id);
  
  // Optimized Batch Counting
  const [subnetCounts, directIpCounts] = await Promise.all([
    prisma.subnet.groupBy({
      by: ['vlanId'],
      where: { vlanId: { in: vlanIds } },
      _count: { _all: true },
    }),
    prisma.iPAddress.groupBy({
      by: ['directVlanId'],
      where: { directVlanId: { in: vlanIds } },
      _count: { _all: true },
    })
  ]);

  const subnetCountMap = new Map(subnetCounts.filter(item => item.vlanId).map(item => {
      const count = (item._count && typeof item._count === 'object' ? item._count._all : 0) || 0;
      return [item.vlanId!, count];
  }));
  const directIpCountMap = new Map(directIpCounts.filter(item => item.directVlanId).map(item => {
      const count = (item._count && typeof item._count === 'object' ? item._count._all : 0) || 0;
      return [item.directVlanId!, count];
  }));

  const appVlans: AppVLAN[] = vlansFromDb.map(vlan => ({
    ...vlan,
    name: vlan.name || undefined,
    description: vlan.description || undefined,
    subnetCount: (subnetCountMap.get(vlan.id) || 0) + (directIpCountMap.get(vlan.id) || 0),
  }));

  return { data: appVlans, totalCount: params?.page && params?.pageSize ? totalCount : appVlans.length, currentPage: page, totalPages: params?.page && params?.pageSize ? totalPages : 1, pageSize };
}

export async function createVLANAction(data: Omit<AppVLAN, "id" | "subnetCount">, performingUserId?: string): Promise<ActionResponse<AppVLAN>> {
  const actionName = 'createVLANAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    if (isNaN(data.vlanNumber) || data.vlanNumber < 1 || data.vlanNumber > 4094) throw new ValidationError("VLAN 号码必须是 1 到 4094 之间的整数。", 'vlanNumber', data.vlanNumber, "VLAN 号码必须是 1 到 4094 之间的整数。");
    if (await prisma.vLAN.findUnique({ where: { vlanNumber: data.vlanNumber } })) throw new ResourceError(`VLAN ${data.vlanNumber} 已存在。`, 'VLAN_EXISTS', `VLAN ${data.vlanNumber} 已存在，请使用不同的号码。`, 'vlanNumber');
    const newVLAN = await prisma.vLAN.create({ data: { vlanNumber: data.vlanNumber, name: data.name || null, description: data.description || null } });
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'create_vlan', details: `创建了 VLAN ${newVLAN.vlanNumber} (${newVLAN.name || '无名称'})` } });
    revalidatePath("/vlans"); revalidatePath("/subnets"); revalidatePath("/ip-addresses"); revalidatePath("/query");
    const appVlan: AppVLAN = { ...newVLAN, name: newVLAN.name || undefined, description: newVLAN.description || undefined, subnetCount: 0 };
    return { success: true, data: appVlan };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

export interface BatchVlanCreationResult { successCount: number; failureDetails: Array<{ vlanNumberAttempted: number; error: string; }>; }
export async function batchCreateVLANsAction(vlansToCreateInput: Array<{ vlanNumber: number; name?: string; description?: string; }>, performingUserId?: string): Promise<BatchVlanCreationResult> {
  const auditUser = await getAuditUserInfo(performingUserId); let successCount = 0; const failureDetails: BatchVlanCreationResult['failureDetails'] = []; const createdVlanSummaries: string[] = [];
  const operations: Prisma.PrismaPromise<any>[] = [];
  const validVlanInputsForTransaction: Array<{ vlanNumber: number; name?: string; description?: string; }> = [];

  for (const vlanInput of vlansToCreateInput) {
    try {
      if (isNaN(vlanInput.vlanNumber) || vlanInput.vlanNumber < 1 || vlanInput.vlanNumber > 4094) throw new ValidationError("VLAN 号码必须是 1 到 4094 之间的整数。", 'vlanNumber', vlanInput.vlanNumber, "VLAN 号码必须是 1 到 4094 之间的整数。");
      if (await prisma.vLAN.findUnique({ where: { vlanNumber: vlanInput.vlanNumber } })) throw new ResourceError(`VLAN ${vlanInput.vlanNumber} 已存在。`, 'VLAN_EXISTS', `VLAN ${vlanInput.vlanNumber} 已存在。`, 'startVlanNumber'); // Field name from original error
      validVlanInputsForTransaction.push(vlanInput);
    } catch (e: unknown) { const errRes = createActionErrorResponse(e, 'batchCreateVLANsAction_single_check'); failureDetails.push({ vlanNumberAttempted: vlanInput.vlanNumber, error: errRes.userMessage }); }
  }

  if (validVlanInputsForTransaction.length > 0) {
    validVlanInputsForTransaction.forEach(vlanInput => {
      operations.push(prisma.vLAN.create({ data: { vlanNumber: vlanInput.vlanNumber, name: vlanInput.name || null, description: vlanInput.description || null } }));
    });
    try {
      const results = await prisma.$transaction(operations);
      successCount = results.length;
      results.forEach((createdVlan: AppVLAN) => { // Assuming transaction returns the created objects
        createdVlanSummaries.push(`${createdVlan.vlanNumber}${createdVlan.name ? ` (${createdVlan.name})` : ''}`);
      });
    } catch (transactionError: unknown) {
      const errRes = createActionErrorResponse(transactionError, `batchCreateVLANsAction_transaction_error`);
      validVlanInputsForTransaction.forEach(vlanInput => {
        if (!failureDetails.some(f => f.vlanNumberAttempted === vlanInput.vlanNumber)) {
            failureDetails.push({ vlanNumberAttempted: vlanInput.vlanNumber, error: errRes.userMessage });
        }
      });
      successCount = 0;
      createdVlanSummaries.length = 0;
    }
  }

  if (createdVlanSummaries.length > 0 && successCount > 0) await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'batch_create_vlan', details: `批量成功创建了 ${successCount} 个 VLAN：${createdVlanSummaries.join(', ')}。最初请求 ${vlansToCreateInput.length} 个，失败：${failureDetails.length} 个。` } });
  if (successCount > 0) { revalidatePath("/vlans"); revalidatePath("/query"); }
  return { successCount, failureDetails };
}

export async function updateVLANAction(id: string, data: Partial<Omit<AppVLAN, "id" | "subnetCount">>, performingUserId?: string): Promise<ActionResponse<AppVLAN>> {
  const actionName = 'updateVLANAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    const vlanToUpdate = await prisma.vLAN.findUnique({ where: { id } }); if (!vlanToUpdate) throw new NotFoundError(`VLAN ID: ${id}`, `VLAN ID ${id} 未找到。`);
    const updatePayload: Prisma.VLANUpdateInput = {};
    if (data.hasOwnProperty('vlanNumber') && data.vlanNumber !== undefined) { if (isNaN(data.vlanNumber) || data.vlanNumber < 1 || data.vlanNumber > 4094) throw new ValidationError("VLAN 号码必须是 1 到 4094 之间的整数。", 'vlanNumber', data.vlanNumber, "VLAN 号码必须是 1 到 4094 之间的整数。"); if (data.vlanNumber !== vlanToUpdate.vlanNumber) { const existingVLAN = await prisma.vLAN.findUnique({ where: { vlanNumber: data.vlanNumber } }); if (existingVLAN && existingVLAN.id !== id) throw new ResourceError(`已存在另一个 VLAN 号码为 ${data.vlanNumber} 的 VLAN。`, 'VLAN_EXISTS', `已存在另一个 VLAN 号码为 ${data.vlanNumber} 的 VLAN。`, 'vlanNumber'); } updatePayload.vlanNumber = data.vlanNumber; }
    if (data.hasOwnProperty('name')) updatePayload.name = (data.name === "" || data.name === undefined) ? null : data.name;
    if (data.hasOwnProperty('description')) updatePayload.description = (data.description === "" || data.description === undefined) ? null : data.description;
    if (Object.keys(updatePayload).length === 0) { const subnetCount = (await prisma.subnet.count({ where: { vlanId: id } })) + (await prisma.iPAddress.count({where: {directVlanId: id}})); const currentVLANApp: AppVLAN = { ...vlanToUpdate, name: vlanToUpdate.name || undefined, description: vlanToUpdate.description || undefined, subnetCount }; return { success: true, data: currentVLANApp }; }
    const updatedVLAN = await prisma.vLAN.update({ where: { id }, data: updatePayload });
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'update_vlan', details: `更新了 VLAN ${updatedVLAN.vlanNumber} (${updatedVLAN.name || '无名称'})` } });
    revalidatePath("/vlans"); revalidatePath("/subnets"); revalidatePath("/ip-addresses"); revalidatePath("/query");
    const subnetCount = (await prisma.subnet.count({ where: { vlanId: updatedVLAN.id } })) + (await prisma.iPAddress.count({where: {directVlanId: updatedVLAN.id}}));
    const appVlan: AppVLAN = { ...updatedVLAN, name: updatedVLAN.name || undefined, description: updatedVLAN.description || undefined, subnetCount };
    return { success: true, data: appVlan };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

export async function deleteVLANAction(id: string, performingUserId?: string): Promise<ActionResponse> {
  const actionName = 'deleteVLANAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    const vlanToDelete = await prisma.vLAN.findUnique({ where: { id } }); if (!vlanToDelete) throw new NotFoundError(`VLAN ID: ${id}`, `VLAN ID ${id} 未找到。`);
    if (await prisma.subnet.count({ where: { vlanId: id } }) > 0) throw new ResourceError(`无法删除 VLAN ${vlanToDelete.vlanNumber}。它已分配给子网。`, 'VLAN_IN_USE_SUBNET', `无法删除 VLAN ${vlanToDelete.vlanNumber}。它已分配给子网。`);
    if (await prisma.iPAddress.count({ where: { directVlanId: id } }) > 0) throw new ResourceError(`无法删除 VLAN ${vlanToDelete.vlanNumber}。它已直接分配给 IP 地址。`, 'VLAN_IN_USE_IP', `无法删除 VLAN ${vlanToDelete.vlanNumber}。它已直接分配给 IP 地址。`);
    await prisma.vLAN.delete({ where: { id } });
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'delete_vlan', details: `删除了 VLAN ${vlanToDelete.vlanNumber} (${vlanToDelete.name || '无名称'})` } });
    revalidatePath("/vlans"); revalidatePath("/subnets"); revalidatePath("/ip-addresses"); revalidatePath("/query");
    return { success: true };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

export async function batchDeleteVLANsAction(ids: string[], performingUserId?: string): Promise<BatchDeleteResult> {
  const actionName = 'batchDeleteVLANsAction';
  const auditUser = await getAuditUserInfo(performingUserId);
  const failureDetails: BatchOperationFailure[] = [];
  const successfullyDeletedVlanSummaries: string[] = [];

  const vlansToProcess = await prisma.vLAN.findMany({
      where: { id: { in: ids } },
      select: { id: true, vlanNumber: true, name: true }
  });
  const vlanMap = new Map(vlansToProcess.map(v => [v.id, v]));
  
  const validDeletes: Array<{id: string, vlanNumber: number, name?: string | null}> = [];

  // Pre-validation loop
  for (const id of ids) {
      const vlanToDelete = vlanMap.get(id);
      const itemIdentifier = vlanToDelete ? `VLAN ${vlanToDelete.vlanNumber} (${vlanToDelete.name || '无名称'})` : `ID ${id}`; 
      
      if (!vlanToDelete) {
          failureDetails.push({ id, itemIdentifier, error: 'VLAN 未找到。' });
          continue;
      }
      try {
          if (await prisma.subnet.count({ where: { vlanId: id } }) > 0) {
              throw new ResourceError(`VLAN ${vlanToDelete.vlanNumber} 已分配给子网。`, 'VLAN_IN_USE_SUBNET_BATCH', `VLAN ${vlanToDelete.vlanNumber} 已分配给子网。`);
          }
          if (await prisma.iPAddress.count({ where: { directVlanId: id } }) > 0) {
              throw new ResourceError(`VLAN ${vlanToDelete.vlanNumber} 已直接分配给 IP 地址。`, 'VLAN_IN_USE_IP_BATCH', `VLAN ${vlanToDelete.vlanNumber} 已直接分配给 IP 地址。`);
          }
          validDeletes.push({ id: vlanToDelete.id, vlanNumber: vlanToDelete.vlanNumber, name: vlanToDelete.name });
      } catch (error: unknown) {
          const errRes = createActionErrorResponse(error, `${actionName}_single_check`);
          failureDetails.push({ id, itemIdentifier, error: errRes.userMessage });
      }
  }

  let successCount = 0;
  const BATCH_SIZE = 100;

  // Batch processing loop
  for (let i = 0; i < validDeletes.length; i += BATCH_SIZE) {
    const batch = validDeletes.slice(i, i + BATCH_SIZE);
    const batchIds = batch.map(item => item.id);
    
    try {
        const result = await prisma.vLAN.deleteMany({ where: { id: { in: batchIds } } });
        successCount += result.count;
        batch.forEach(v => successfullyDeletedVlanSummaries.push(`${v.vlanNumber}${v.name ? ` (${v.name})` : ''}`));
    } catch (transactionError: unknown) {
        const errRes = createActionErrorResponse(transactionError, `${actionName}_transaction`);
        batch.forEach(v => {
            if (!failureDetails.some(f => f.id === v.id)) { 
                failureDetails.push({ id: v.id, itemIdentifier: `VLAN ${v.vlanNumber} (${v.name || '无名称'})`, error: `事务失败: ${errRes.userMessage}` });
            }
        });
    }
  }

  if (successCount > 0) {
      await prisma.auditLog.create({
          data: {
              userId: auditUser.userId,
              username: auditUser.username,
              action: 'batch_delete_vlan',
              details: `批量成功删除了 ${successCount} 个 VLAN: ${successfullyDeletedVlanSummaries.join(', ')}。最初选中 ${ids.length} 个。`
          }
      });
      revalidatePath("/vlans"); revalidatePath("/subnets"); revalidatePath("/ip-addresses"); revalidatePath("/query");
  }
  return { successCount, failureCount: failureDetails.length, failureDetails };
}

type PrismaIPAddressWithRelations = Prisma.IPAddressGetPayload<{ include: { subnet: { include: { vlan: true } }; directVlan: true; }; }>;
export type AppIPAddressWithRelations = AppIPAddress & {
  subnet?: { id: string; cidr: string; name?: string; networkAddress: string; vlan?: { vlanNumber: number; name?: string; } | null } | null;
  directVlan?: { vlanNumber: number; name?: string; } | null;
};

export async function getIPAddressesAction(params?: FetchParams): Promise<PaginatedResponse<AppIPAddressWithRelations>> {
  const page = params?.page || 1;
  const pageSize = params?.pageSize || DEFAULT_PAGE_SIZE;
  const skip = (page - 1) * pageSize;
  const whereClause: Prisma.IPAddressWhereInput = {};
  if (params?.subnetId) whereClause.subnetId = params.subnetId;
  if (params?.status && params.status !== 'all') whereClause.status = params.status as AppIPAddressStatusType;
  const includeClause = { subnet: { include: { vlan: { select: { vlanNumber: true, name: true } } } }, directVlan: { select: { vlanNumber: true, name: true } } };

  const [totalCount, paginatedDbItems] = await prisma.$transaction([
    prisma.iPAddress.count({ where: whereClause }),
    prisma.iPAddress.findMany({ where: whereClause, include: includeClause, orderBy: [ { subnet: { networkAddress: 'asc' } }, { ipAddress: 'asc' } ], skip, take: pageSize })
  ]);
  
  const totalPages = (pageSize > 0 && totalCount > 0) ? Math.ceil(totalCount / pageSize) : 1;

  const appIps: AppIPAddressWithRelations[] = (paginatedDbItems as PrismaIPAddressWithRelations[]).map(ip => ({
    id: ip.id, ipAddress: ip.ipAddress, status: ip.status as AppIPAddressStatusType, isGateway: ip.isGateway ?? false,
    allocatedTo: ip.allocatedTo || undefined, usageUnit: ip.usageUnit || undefined, contactPerson: ip.contactPerson || undefined, phone: ip.phone || undefined,
    description: ip.description || undefined, 
    createdAt: ip.createdAt.toISOString(), updatedAt: ip.updatedAt.toISOString(),
    subnetId: ip.subnetId || undefined, directVlanId: ip.directVlanId || undefined,
    subnet: ip.subnet ? { id: ip.subnet.id, cidr: ip.subnet.cidr, name: ip.subnet.name || undefined, networkAddress: ip.subnet.networkAddress, vlan: ip.subnet.vlan ? { vlanNumber: ip.subnet.vlan.vlanNumber, name: ip.subnet.vlan.name || undefined } : null } : null,
    directVlan: ip.directVlan ? { vlanNumber: ip.directVlan.vlanNumber, name: ip.directVlan.name || undefined } : null,
    peerUnitName: ip.peerUnitName || undefined,
    peerDeviceName: ip.peerDeviceName || undefined,
    peerPortName: ip.peerPortName || undefined,
    selectedAccessType: ip.selectedAccessType || undefined,
    selectedLocalDeviceName: ip.selectedLocalDeviceName || undefined, selectedDevicePort: ip.selectedDevicePort || undefined, selectedPaymentSource: ip.selectedPaymentSource || undefined,
  }));
  return { data: appIps, totalCount: totalCount, currentPage: page, totalPages: totalPages, pageSize: pageSize };
}

export async function createIPAddressAction(data: Omit<AppIPAddress, "id" | "createdAt" | "updatedAt">, performingUserId?: string): Promise<ActionResponse<AppIPAddress>> {
  const actionName = 'createIPAddressAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    if (data.ipAddress.split('.').map(Number).some(p => isNaN(p) || p < 0 || p > 255) || data.ipAddress.split('.').length !== 4) throw new ValidationError(`无效的 IP 地址格式: ${data.ipAddress}`, 'ipAddress', data.ipAddress, `无效的 IP 地址格式: ${data.ipAddress}`);
    
    const existingGlobalIP = await prisma.iPAddress.findUnique({ where: { ipAddress: data.ipAddress } });
    if (existingGlobalIP) {
        throw new ResourceError(`IP 地址 ${data.ipAddress} 已在系统中存在。`, 'IP_ADDRESS_GLOBALLY_EXISTS', `IP 地址 ${data.ipAddress} 已在系统中存在，不能重复添加。`, 'ipAddress');
    }

    if (!data.subnetId && (data.status === 'allocated' || data.status === 'reserved')) {
      throw new ValidationError("对于“已分配”或“预留”状态的 IP，必须选择一个子网。", 'subnetId', undefined, "对于“已分配”或“预留”状态的 IP，必须选择一个子网。");
    }

    if (data.subnetId) {
      const targetSubnet = await prisma.subnet.findUnique({ where: { id: data.subnetId } });
      if (!targetSubnet) throw new NotFoundError(`子网 ID: ${data.subnetId}`, `子网 ID ${data.subnetId} 未找到。`, 'subnetId');
      const parsedCidr = getSubnetPropertiesFromCidr(targetSubnet.cidr);
      if (!parsedCidr) throw new AppError(`目标子网 ${targetSubnet.cidr} 的 CIDR 无效。`, 500, 'SUBNET_CIDR_INVALID_FOR_IP_CHECK', `目标子网 ${targetSubnet.cidr} 的 CIDR 无效。`);
      if (!isIpInCidrRange(data.ipAddress, parsedCidr)) {
        throw new ValidationError(`IP ${data.ipAddress} 不在子网 ${targetSubnet.cidr} 的范围内。`, 'ipAddress', data.ipAddress, `IP ${data.ipAddress} 不在子网 ${targetSubnet.cidr} 的范围内。`);
      }
    }

    const createPayload: Prisma.IPAddressCreateInput = {
      ipAddress: data.ipAddress, status: data.status as string, isGateway: data.isGateway ?? false,
      allocatedTo: data.allocatedTo || null, usageUnit: data.usageUnit || null,
      contactPerson: data.contactPerson || null,
      phone: data.phone || null,
      description: data.description || null,
      peerUnitName: data.peerUnitName || null,
      peerDeviceName: data.peerDeviceName || null,
      peerPortName: data.peerPortName || null,
      selectedAccessType: data.selectedAccessType || null,
      selectedLocalDeviceName: data.selectedLocalDeviceName || null, selectedDevicePort: data.selectedDevicePort || null,
      selectedPaymentSource: data.selectedPaymentSource || null,
    };

    if (data.subnetId) createPayload.subnet = { connect: { id: data.subnetId } };
    if (data.directVlanId) { if (!(await prisma.vLAN.findUnique({ where: { id: data.directVlanId } }))) throw new NotFoundError(`VLAN ID: ${data.directVlanId}`, `VLAN ID ${data.directVlanId} 未找到。`, 'directVlanId'); createPayload.directVlan = { connect: { id: data.directVlanId } }; }

    const newIP = await prisma.iPAddress.create({ data: createPayload });
    const subnetCidr = data.subnetId ? (await prisma.subnet.findUnique({where: {id: data.subnetId}}))?.cidr : null;
    const subnetInfo = subnetCidr ? ` 在子网 ${subnetCidr} 中` : ' 在全局池中';
    const vlanInfoLog = data.directVlanId ? ` 使用 VLAN ${(await prisma.vLAN.findUnique({where: {id:data.directVlanId}}))?.vlanNumber}`: '';
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'create_ip_address', details: `创建了 IP ${newIP.ipAddress}${subnetInfo}${vlanInfoLog}，状态为 ${data.status}。` } });
    revalidatePath("/ip-addresses"); revalidatePath("/dashboard"); revalidatePath("/subnets"); revalidatePath("/query");
    const appIp: AppIPAddress = { ...newIP, isGateway: newIP.isGateway ?? false, subnetId: newIP.subnetId || undefined, directVlanId: newIP.directVlanId || undefined, allocatedTo: newIP.allocatedTo || undefined, usageUnit: newIP.usageUnit || undefined, contactPerson: newIP.contactPerson || undefined, phone: newIP.phone || undefined, description: newIP.description || undefined, createdAt: newIP.createdAt.toISOString(), updatedAt: newIP.updatedAt.toISOString(), status: newIP.status as AppIPAddressStatusType, peerUnitName: newIP.peerUnitName || undefined, peerDeviceName: newIP.peerDeviceName || undefined, peerPortName: newIP.peerPortName || undefined, selectedAccessType: newIP.selectedAccessType || undefined, selectedLocalDeviceName: newIP.selectedLocalDeviceName || undefined, selectedDevicePort: newIP.selectedDevicePort || undefined, selectedPaymentSource: newIP.selectedPaymentSource || undefined };
    return { success: true, data: appIp };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

export interface BatchIpCreationResult { successCount: number; failureDetails: Array<{ ipAttempted: string; error: string; }>; }
export async function batchCreateIPAddressesAction(payload: { startIp: string; endIp: string; subnetId: string; directVlanId?: string | null; description?: string; status: AppIPAddressStatusType; isGateway?: boolean; usageUnit?:string; contactPerson?:string; phone?:string; peerUnitName?: string; peerDeviceName?: string; peerPortName?: string; selectedAccessType?: string; selectedLocalDeviceName?: string; selectedDevicePort?: string; selectedPaymentSource?: string; }, performingUserId?: string): Promise<BatchIpCreationResult> {
  const auditUser = await getAuditUserInfo(performingUserId); let successCount = 0; const failureDetails: BatchIpCreationResult['failureDetails'] = []; const createdIpAddressesForAudit: string[] = [];
  const { startIp, endIp, subnetId, directVlanId, description, status, isGateway, usageUnit, contactPerson, phone, peerUnitName, peerDeviceName, peerPortName, selectedAccessType, selectedLocalDeviceName, selectedDevicePort, selectedPaymentSource } = payload;
  try {
    const targetSubnet = await prisma.subnet.findUnique({ where: { id: subnetId } }); if (!targetSubnet) throw new NotFoundError(`子网 ID: ${subnetId}`, "未找到批量创建的目标子网。", 'subnetId');
    const parsedTargetSubnetCidr = getSubnetPropertiesFromCidr(targetSubnet.cidr); if (!parsedTargetSubnetCidr) throw new AppError(`目标子网 ${targetSubnet.cidr} 的 CIDR 配置无效。`, 500, 'SUBNET_CIDR_INVALID_FOR_BATCH', `目标子网 ${targetSubnet.cidr} 的 CIDR 配置无效。`);
    if (directVlanId && directVlanId.trim() !== "") { if (!(await prisma.vLAN.findUnique({ where: { id: directVlanId } }))) throw new NotFoundError(`VLAN ID: ${directVlanId}`, "为批量 IP 创建选择的 VLAN 不存在。", 'directVlanId'); }
    let currentIpNum = ipToNumber(startIp); let endIpNum = ipToNumber(endIp); if (currentIpNum > endIpNum) throw new ValidationError("起始 IP 必须小于或等于结束 IP。", 'endIp', undefined, "起始 IP 必须小于或等于结束 IP。");
    for (; currentIpNum <= endIpNum; currentIpNum++) {
      const currentIpStr = numberToIp(currentIpNum);
      try {
        if (!isIpInCidrRange(currentIpStr, parsedTargetSubnetCidr)) throw new ValidationError(`IP ${currentIpStr} 不在子网 ${targetSubnet.cidr} 的范围内。`, 'startIp/endIp', currentIpStr, `IP ${currentIpStr} 不在子网 ${targetSubnet.cidr} 的范围内。`);
        
        if (await prisma.iPAddress.findUnique({ where: { ipAddress: currentIpStr } })) { // Global check
          throw new ResourceError(`IP 地址 ${currentIpStr} 已在系统中存在。`, 'IP_ADDRESS_GLOBALLY_EXISTS_BATCH', `IP 地址 ${currentIpStr} 已在系统中存在。`, 'startIp/endIp');
        }
        
        const createPayload: Prisma.IPAddressCreateInput = {
            ipAddress: currentIpStr, status: status, isGateway: isGateway ?? false, allocatedTo: status === 'allocated' ? (description || '批量分配') : null,
            usageUnit: usageUnit||null, contactPerson: contactPerson||null,
            phone: phone || null,
            description: description || null,
            peerUnitName: peerUnitName || null, peerDeviceName: peerDeviceName || null, peerPortName: peerPortName || null,
            selectedAccessType: selectedAccessType || null, selectedLocalDeviceName: selectedLocalDeviceName || null, selectedDevicePort: selectedDevicePort || null,
            selectedPaymentSource: selectedPaymentSource || null,
        };
        if (subnetId) createPayload.subnet = { connect: { id: subnetId } };
        if (directVlanId && directVlanId.trim() !== "") createPayload.directVlan = { connect: { id: directVlanId } };
        await prisma.iPAddress.create({ data: createPayload }); createdIpAddressesForAudit.push(currentIpStr); successCount++;
      } catch (e: unknown) { const errRes = createActionErrorResponse(e, 'batchCreateIPAddressesAction_single'); failureDetails.push({ ipAttempted: currentIpStr, error: errRes.userMessage }); }
    }
  } catch (e: unknown) { const errRes = createActionErrorResponse(e, 'batchCreateIPAddressesAction_setup'); return { successCount: 0, failureDetails: [{ ipAttempted: `${startIp}-${endIp}`, error: errRes.userMessage }] }; }
  if (createdIpAddressesForAudit.length > 0) await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'batch_create_ip_address', details: `批量创建了 ${createdIpAddressesForAudit.length} 个 IP 到子网 ${payload.subnetId}：${createdIpAddressesForAudit.join(', ')}。状态: ${status}。失败：${failureDetails.length} 个。` } });
  if (successCount > 0) { revalidatePath("/ip-addresses"); revalidatePath("/dashboard"); revalidatePath("/subnets"); revalidatePath("/query"); }
  return { successCount, failureDetails };
}

export interface UpdateIPAddressData { ipAddress?: string; subnetId?: string | undefined; directVlanId?: string | null | undefined; status?: AppIPAddressStatusType; isGateway?: boolean | null | undefined; allocatedTo?: string | null | undefined; usageUnit?: string | null | undefined; contactPerson?: string | null | undefined; phone?: string | null | undefined; description?: string | null | undefined; peerUnitName?: string | null | undefined; peerDeviceName?: string | null | undefined; peerPortName?: string | null | undefined; selectedAccessType?: string | null | undefined; selectedLocalDeviceName?: string | null | undefined; selectedDevicePort?: string | null | undefined; selectedPaymentSource?: string | null | undefined; }
export async function updateIPAddressAction(id: string, data: UpdateIPAddressData, performingUserId?: string): Promise<ActionResponse<AppIPAddress>> {
  const actionName = 'updateIPAddressAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    const ipToUpdate = await prisma.iPAddress.findUnique({ where: { id } }); if (!ipToUpdate) throw new NotFoundError(`IP 地址 ID: ${id}`, `IP 地址 ID ${id} 未找到。`);
    const updateData: Prisma.IPAddressUpdateInput = { };
    let finalIpAddress = ipToUpdate.ipAddress;

    if (data.hasOwnProperty('ipAddress') && data.ipAddress !== undefined && data.ipAddress !== ipToUpdate.ipAddress) {
      if (data.ipAddress.split('.').map(Number).some(p => isNaN(p) || p < 0 || p > 255) || data.ipAddress.split('.').length !== 4) throw new ValidationError(`无效的 IP 地址格式更新: ${data.ipAddress}`, 'ipAddress', data.ipAddress, `无效的 IP 地址格式更新: ${data.ipAddress}`);
      
      const existingGlobalIP = await prisma.iPAddress.findFirst({ where: { ipAddress: data.ipAddress, NOT: { id } } });
      if (existingGlobalIP) {
          throw new ResourceError(`IP 地址 ${data.ipAddress} 已在系统中存在。`, 'IP_ADDRESS_GLOBALLY_EXISTS_UPDATE', `IP 地址 ${data.ipAddress} 已在系统中存在，不能分配给此记录。`, 'ipAddress');
      }
      updateData.ipAddress = data.ipAddress;
      finalIpAddress = data.ipAddress;
    }

    if (data.hasOwnProperty('status') && data.status !== undefined) updateData.status = data.status as string;
    if (data.hasOwnProperty('isGateway')) updateData.isGateway = data.isGateway ?? false;
    if (data.hasOwnProperty('allocatedTo')) updateData.allocatedTo = (data.allocatedTo === undefined || data.allocatedTo === "") ? null : data.allocatedTo;
    if (data.hasOwnProperty('usageUnit')) updateData.usageUnit = (data.usageUnit === undefined || data.usageUnit === "") ? null : data.usageUnit;
    if (data.hasOwnProperty('contactPerson')) updateData.contactPerson = (data.contactPerson === undefined || data.contactPerson === "") ? null : data.contactPerson;
    if (data.hasOwnProperty('phone')) updateData.phone = data.phone || null;
    if (data.hasOwnProperty('description')) updateData.description = (data.description === undefined || data.description === "") ? null : data.description;
    if (data.hasOwnProperty('directVlanId')) { const vlanIdToSet = data.directVlanId; if (vlanIdToSet === null || vlanIdToSet === "" || vlanIdToSet === undefined) updateData.directVlan = { disconnect: true }; else if (vlanIdToSet) { if (!(await prisma.vLAN.findUnique({where: {id: vlanIdToSet}}))) throw new NotFoundError(`VLAN ID: ${vlanIdToSet}`, `VLAN ID ${vlanIdToSet} 未找到。`, 'directVlanId'); updateData.directVlan = { connect: { id: vlanIdToSet } }; } }
    if (data.hasOwnProperty('peerUnitName')) updateData.peerUnitName = data.peerUnitName || null;
    if (data.hasOwnProperty('peerDeviceName')) updateData.peerDeviceName = data.peerDeviceName || null;
    if (data.hasOwnProperty('peerPortName')) updateData.peerPortName = data.peerPortName || null;
    if (data.hasOwnProperty('selectedAccessType')) updateData.selectedAccessType = data.selectedAccessType || null;
    if (data.hasOwnProperty('selectedLocalDeviceName')) updateData.selectedLocalDeviceName = data.selectedLocalDeviceName || null;
    if (data.hasOwnProperty('selectedDevicePort')) updateData.selectedDevicePort = data.selectedDevicePort || null;
    if (data.hasOwnProperty('selectedPaymentSource')) updateData.selectedPaymentSource = data.selectedPaymentSource || null;

    const newSubnetId = data.hasOwnProperty('subnetId') ? (data.subnetId || undefined) : ipToUpdate.subnetId;
    const finalStatus = data.status ? data.status as string : ipToUpdate.status;

    if (data.hasOwnProperty('subnetId')) { 
      if (newSubnetId) { 
        const targetSubnet = await prisma.subnet.findUnique({ where: { id: newSubnetId } });
        if (!targetSubnet) throw new NotFoundError(`子网 ID: ${newSubnetId}`, "目标子网不存在。", 'subnetId');
        const parsedCidr = getSubnetPropertiesFromCidr(targetSubnet.cidr);
        if (!parsedCidr) throw new AppError(`目标子网 ${targetSubnet.cidr} 的 CIDR 无效。`, 500, 'SUBNET_CIDR_INVALID_FOR_IP_CHECK', `目标子网 ${targetSubnet.cidr} 的 CIDR 无效。`);
        if (!isIpInCidrRange(finalIpAddress, parsedCidr)) {
          throw new ValidationError(`IP ${finalIpAddress} 不在子网 ${targetSubnet.cidr} 的范围内。`, 'ipAddress/subnetId', finalIpAddress, `IP ${finalIpAddress} 不在子网 ${targetSubnet.cidr} 的范围内。`);
        }
        updateData.subnet = { connect: { id: newSubnetId } };
      } else { 
        if (finalStatus === 'allocated' || finalStatus === 'reserved') {
          throw new ValidationError("对于“已分配”或“预留”状态的 IP，必须选择一个子网。", 'subnetId', finalStatus, "对于“已分配”或“预留”状态的 IP，必须选择一个子网。");
        }
        updateData.subnet = { disconnect: true };
      }
    } else if (newSubnetId && (finalIpAddress !== ipToUpdate.ipAddress)) { 
      const currentSubnet = await prisma.subnet.findUnique({ where: { id: newSubnetId } });
      if (!currentSubnet) throw new NotFoundError(`当前子网 ID: ${newSubnetId}`, "IP 的当前子网未找到。", 'subnetId');
      const parsedCidr = getSubnetPropertiesFromCidr(currentSubnet.cidr);
      if (!parsedCidr) throw new AppError(`当前子网 ${currentSubnet.cidr} 的 CIDR 无效。`, 500, 'SUBNET_CIDR_INVALID_FOR_IP_CHECK', `当前子网 ${currentSubnet.cidr} 的 CIDR 无效。`);
      if (!isIpInCidrRange(finalIpAddress, parsedCidr)) {
        throw new ValidationError(`新 IP ${finalIpAddress} 不在当前子网 ${currentSubnet.cidr} 的范围内。`, 'ipAddress', finalIpAddress, `新 IP ${finalIpAddress} 不在当前子网 ${currentSubnet.cidr} 的范围内。`);
      }
    }

    const updatedIP = await prisma.iPAddress.update({ where: { id }, data: updateData });
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'update_ip_address', details: `更新了 IP ${updatedIP.ipAddress}` } });
    revalidatePath("/ip-addresses"); revalidatePath("/dashboard"); revalidatePath("/subnets"); revalidatePath("/query");
    const appIp: AppIPAddress = { ...updatedIP, isGateway: updatedIP.isGateway ?? false, subnetId: updatedIP.subnetId || undefined, directVlanId: updatedIP.directVlanId || undefined, allocatedTo: updatedIP.allocatedTo || undefined, usageUnit: updatedIP.usageUnit || undefined, contactPerson: updatedIP.contactPerson || undefined, phone: updatedIP.phone || undefined, description: updatedIP.description || undefined, createdAt: updatedIP.createdAt.toISOString(), updatedAt: updatedIP.updatedAt.toISOString(), status: updatedIP.status as AppIPAddressStatusType, peerUnitName: updatedIP.peerUnitName || undefined, peerDeviceName: updatedIP.peerDeviceName || undefined, peerPortName: updatedIP.peerPortName || undefined, selectedAccessType: updatedIP.selectedAccessType || undefined, selectedLocalDeviceName: updatedIP.selectedLocalDeviceName || undefined, selectedDevicePort: updatedIP.selectedDevicePort || undefined, selectedPaymentSource: updatedIP.selectedPaymentSource || undefined };
    return { success: true, data: appIp };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

export async function deleteIPAddressAction(id: string, performingUserId?: string): Promise<ActionResponse> {
  const actionName = 'deleteIPAddressAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    const ipToDelete = await prisma.iPAddress.findUnique({ where: { id }, include: { directVlan: { select: { vlanNumber: true } } } }); if (!ipToDelete) throw new NotFoundError(`IP 地址 ID: ${id}`, `IP 地址 ID ${id} 未找到。`);
    if (ipToDelete.status === 'allocated' || ipToDelete.status === 'reserved') throw new ResourceError(`IP 地址 ${ipToDelete.ipAddress} 状态为 "${ipToDelete.status}"，无法删除。`, 'IP_ADDRESS_IN_USE_STATUS', `IP 地址 ${ipToDelete.ipAddress} 状态为 "${ipToDelete.status}"，无法删除。`);
    if (ipToDelete.directVlanId) { const directVlanNumber = ipToDelete.directVlan?.vlanNumber || ipToDelete.directVlanId; throw new ResourceError(`IP 地址 ${ipToDelete.ipAddress} 直接关联到 VLAN ${directVlanNumber}，无法删除。`, 'IP_ADDRESS_HAS_DIRECT_VLAN', `IP 地址 ${ipToDelete.ipAddress} 直接关联到 VLAN ${directVlanNumber}，无法删除。`); }
    await prisma.iPAddress.delete({ where: { id } });
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'delete_ip_address', details: `删除了 IP ${ipToDelete.ipAddress}` } });
    revalidatePath("/ip-addresses"); revalidatePath("/dashboard"); revalidatePath("/subnets"); revalidatePath("/query");
    return { success: true };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

export async function batchDeleteIPAddressesAction(ids: string[], performingUserId?: string): Promise<BatchDeleteResult> {
  const actionName = 'batchDeleteIPAddressesAction';
  const auditUser = await getAuditUserInfo(performingUserId);
  const failureDetails: BatchOperationFailure[] = [];
  const successfullyDeletedIpAddresses: string[] = [];

  const ipsToProcess = await prisma.iPAddress.findMany({
      where: { id: { in: ids } },
      select: { id: true, ipAddress: true, status: true, directVlanId: true, directVlan: { select: {vlanNumber: true}} }
  });
  const ipMap = new Map(ipsToProcess.map(ip => [ip.id, ip]));

  const validDeletes: Array<{id: string, ipAddress: string}> = [];

  // Pre-validation loop
  for (const id of ids) {
      const ipToDelete = ipMap.get(id);
      const itemIdentifier = ipToDelete?.ipAddress || `ID ${id}`; 
      
      if (!ipToDelete) {
          failureDetails.push({ id, itemIdentifier, error: 'IP 地址未找到。' });
          continue;
      }
      try {
          if (ipToDelete.status === 'allocated' || ipToDelete.status === 'reserved') {
              throw new ResourceError(`IP 地址 ${ipToDelete.ipAddress} 状态为 "${ipToDelete.status}"。`, 'IP_ADDRESS_IN_USE_STATUS_BATCH', `IP 地址 ${ipToDelete.ipAddress} 状态为 "${ipToDelete.status}"。`);
          }
          if (ipToDelete.directVlanId) {
              const directVlanNumber = ipToDelete.directVlan?.vlanNumber || ipToDelete.directVlanId;
              throw new ResourceError(`IP 地址 ${ipToDelete.ipAddress} 直接关联到 VLAN ${directVlanNumber}。`, 'IP_ADDRESS_HAS_DIRECT_VLAN_BATCH', `IP 地址 ${ipToDelete.ipAddress} 直接关联到 VLAN ${directVlanNumber}。`);
          }
          validDeletes.push({id: ipToDelete.id, ipAddress: ipToDelete.ipAddress});
      } catch (error: unknown) {
          const errRes = createActionErrorResponse(error, `${actionName}_single_check`);
          failureDetails.push({ id, itemIdentifier, error: errRes.userMessage });
      }
  }

  let successCount = 0;
  const BATCH_SIZE = 100;

  // Batch processing loop
  for (let i = 0; i < validDeletes.length; i += BATCH_SIZE) {
    const batch = validDeletes.slice(i, i + BATCH_SIZE);
    const batchIds = batch.map(item => item.id);
    
    try {
        const result = await prisma.iPAddress.deleteMany({ where: { id: { in: batchIds } } });
        successCount += result.count;
        batch.forEach(item => successfullyDeletedIpAddresses.push(item.ipAddress));
    } catch (transactionError: unknown) {
        const errRes = createActionErrorResponse(transactionError, `${actionName}_transaction`);
        batch.forEach(item => {
            if (!failureDetails.some(f => f.id === item.id)) {
                failureDetails.push({ id: item.id, itemIdentifier: item.ipAddress, error: `事务失败: ${errRes.userMessage}` });
            }
        });
    }
  }

  if (successCount > 0) {
      await prisma.auditLog.create({
          data: {
              userId: auditUser.userId,
              username: auditUser.username,
              action: 'batch_delete_ip_address',
              details: `批量成功删除了 ${successCount} 个 IP 地址: ${successfullyDeletedIpAddresses.join(', ')}。最初选中 ${ids.length} 个。`
          }
      });
      revalidatePath("/ip-addresses"); revalidatePath("/dashboard"); revalidatePath("/subnets"); revalidatePath("/query");
  }
  return { successCount, failureCount: failureDetails.length, failureDetails };
}


interface QueryToolParams { page?: number; pageSize?: number; queryString?: string; searchTerm?: string; status?: AppIPAddressStatusType | 'all'; }

const SubnetQuerySchema = z.string().trim().optional();
export async function querySubnetsAction(params: QueryToolParams): Promise<ActionResponse<PaginatedResponse<SubnetQueryResult>>> {
  const actionName = 'querySubnetsAction';
  try {
    const page = params.page || 1; const pageSize = params.pageSize || DEFAULT_QUERY_PAGE_SIZE; const skip = (page - 1) * pageSize;
    const validationResult = SubnetQuerySchema.safeParse(params.queryString);
    const queryString = validationResult.success ? (validationResult.data || "") : "";


    if (!queryString) return { success: true, data: { data: [], totalCount: 0, currentPage: page, totalPages: 0, pageSize } };

    const orConditions: Prisma.SubnetWhereInput[] = [
      { cidr: { contains: queryString } },
      { name: { contains: queryString } },
      { description: { contains: queryString } },
      { networkAddress: { contains: queryString } },
    ];

    let whereClause: Prisma.SubnetWhereInput = { OR: orConditions };
    const totalCount = await prisma.subnet.count({ where: whereClause }); const totalPages = Math.ceil(totalCount / pageSize) || 1;
    const subnetsFromDb = await prisma.subnet.findMany({ where: whereClause, include: { vlan: { select: { vlanNumber: true, name: true } } }, orderBy: { cidr: 'asc' }, skip, take: pageSize });
    const results: SubnetQueryResult[] = await Promise.all(subnetsFromDb.map(async (s) => { const props = getSubnetPropertiesFromCidr(s.cidr); const totalUsableIPs = props ? getUsableIpCount(props.prefix) : 0; const allocatedIPsCount = await prisma.iPAddress.count({ where: { subnetId: s.id, status: 'allocated' } }); const dbFreeIPsCount = await prisma.iPAddress.count({ where: { subnetId: s.id, status: 'free' } }); const reservedIPsCount = await prisma.iPAddress.count({ where: { subnetId: s.id, status: 'reserved' } }); return { id: s.id, cidr: s.cidr, name: s.name || undefined, description: s.description || undefined, dhcpEnabled: s.dhcpEnabled ?? false, vlanNumber: s.vlan?.vlanNumber, vlanName: s.vlan?.name || undefined, totalUsableIPs, allocatedIPsCount, dbFreeIPsCount, reservedIPsCount }; }));
    return { success: true, data: { data: results, totalCount, currentPage: page, totalPages, pageSize } };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

const VlanQueryReqSchema = z.string().trim().optional();

export async function queryVlansAction(params: QueryToolParams): Promise<ActionResponse<PaginatedResponse<VlanQueryResult>>> {
  const actionName = 'queryVlansAction';
  try {
    const page = params.page || 1;
    const pageSize = params.pageSize || DEFAULT_QUERY_PAGE_SIZE;
    const skip = (page - 1) * pageSize;

    const queryString = params.queryString;
    const validationResult = VlanQueryReqSchema.safeParse(queryString);

    const validatedQuery = validationResult.success ? (validationResult.data || "") : "";

    if (!validatedQuery) {
        return { success: true, data: { data: [], totalCount: 0, currentPage: page, totalPages: 0, pageSize } };
    }

    const startsWithQuery = `${validatedQuery}%`;
    const containsQuery = `%${validatedQuery}%`;

    const countResult: Array<{ count: bigint }> = await prisma.$queryRaw`
      SELECT COUNT(*) as count FROM "vlans"
      WHERE
        ("name" LIKE ${containsQuery})
        OR ("description" LIKE ${containsQuery})
        OR (CAST("vlan_number" AS TEXT) LIKE ${startsWithQuery});
    `;
    const totalCount = Number(countResult[0]?.count || 0);
    const totalPages = Math.ceil(totalCount / pageSize) || 1;

    const vlansFromDb = await prisma.$queryRaw<Array<AppVLAN & { id: string; created_at: Date; updated_at: Date; vlan_number: number }>>`
      SELECT "id", "vlan_number", "name", "description", "created_at", "updated_at" FROM "vlans"
      WHERE
        ("name" LIKE ${containsQuery})
        OR ("description" LIKE ${containsQuery})
        OR (CAST("vlan_number" AS TEXT) LIKE ${startsWithQuery})
      ORDER BY "vlan_number" ASC
      LIMIT ${pageSize} OFFSET ${skip};
    `;

    const vlanIds = vlansFromDb.map(v => v.id);

    // Optimized batch fetch for related data
    const [allAssociatedSubnets, allAssociatedDirectIPs] = await Promise.all([
      prisma.subnet.findMany({
        where: { vlanId: { in: vlanIds } },
        select: { id: true, cidr: true, name: true, description: true, vlanId: true }
      }),
      prisma.iPAddress.findMany({
        where: { directVlanId: { in: vlanIds } },
        select: { id: true, ipAddress: true, description: true, directVlanId: true }
      })
    ]);

    // Group related data by vlanId in memory
    const subnetsByVlanId = allAssociatedSubnets.reduce((acc, subnet) => {
      if (subnet.vlanId) {
        if (!acc[subnet.vlanId]) acc[subnet.vlanId] = [];
        acc[subnet.vlanId].push(subnet);
      }
      return acc;
    }, {} as Record<string, typeof allAssociatedSubnets>);

    const directIpsByVlanId = allAssociatedDirectIPs.reduce((acc, ip) => {
      if (ip.directVlanId) {
        if (!acc[ip.directVlanId]) acc[ip.directVlanId] = [];
        acc[ip.directVlanId].push(ip);
      }
      return acc;
    }, {} as Record<string, typeof allAssociatedDirectIPs>);


    // Map the results without further DB calls
    const results: VlanQueryResult[] = vlansFromDb.map((v_raw) => {
      const v: AppVLAN = {
        id: v_raw.id,
        vlanNumber: v_raw.vlan_number,
        name: v_raw.name || undefined,
        description: v_raw.description || undefined,
      };
      
      const associatedSubnets = subnetsByVlanId[v.id] || [];
      const associatedDirectIPs = directIpsByVlanId[v.id] || [];

      return {
        id: v.id,
        vlanNumber: v.vlanNumber,
        name: v.name,
        description: v.description,
        associatedSubnets: associatedSubnets.map(s => ({ id: s.id, cidr: s.cidr, name: s.name || undefined, description: s.description || undefined})),
        associatedDirectIPs: associatedDirectIPs.map(ip => ({id: ip.id, ipAddress: ip.ipAddress, description: ip.description || undefined})),
        resourceCount: associatedSubnets.length + associatedDirectIPs.length,
      };
    });

    return { success: true, data: { data: results, totalCount, currentPage: page, totalPages, pageSize } };

  } catch (error: unknown) {
    logger.error(actionName, error, { queryString: params.queryString }, 'queryVlansAction');

    if (error instanceof z.ZodError) {
      return { success: false, error: createActionErrorResponse({ message: error.flatten().formErrors.join(', '), code: 'VALIDATION_ERROR', field: 'queryString' }, actionName) };
    }
    return { success: false, error: createActionErrorResponse(error, actionName) };
  }
}


const IpQuerySearchTermSchema = z.string().trim().optional();
export async function queryIpAddressesAction(params: QueryToolParams): Promise<ActionResponse<PaginatedResponse<AppIPAddressWithRelations>>> {
  const actionName = 'queryIpAddressesAction';
  try {
    const page = params.page || 1; const pageSize = params.pageSize || DEFAULT_QUERY_PAGE_SIZE; const skip = (page - 1) * pageSize;

    const validationResult = IpQuerySearchTermSchema.safeParse(params.searchTerm);
    const trimmedSearchTerm = validationResult.success ? (validationResult.data || "") : "";

    const statusFilter = params.status;
    const andConditions: Prisma.IPAddressWhereInput[] = []; const orConditionsForSearchTerm: Prisma.IPAddressWhereInput[] = [];
    if (trimmedSearchTerm) {
      const ipWildcardPatterns = [ { regex: /^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\*$/, prefixBuilder: (m: RegExpMatchArray) => `${m[1]}.` }, { regex: /^(\d{1,3}\.\d{1,3})\.\*$/, prefixBuilder: (m: RegExpMatchArray) => `${m[1]}.` }, { regex: /^(\d{1,3})\.\*$/, prefixBuilder: (m: RegExpMatchArray) => `${m[1]}.` } ];
      let matchedIpPattern = false; for (const p of ipWildcardPatterns) { const m = trimmedSearchTerm.match(p.regex); if (m) { orConditionsForSearchTerm.push({ ipAddress: { startsWith: p.prefixBuilder(m) } }); matchedIpPattern = true; break; } }
      const isPotentiallyIpSegment = !matchedIpPattern && trimmedSearchTerm.length > 0 && trimmedSearchTerm.length <= 15 && /[\d]/.test(trimmedSearchTerm) && /^[0-9.*]+$/.test(trimmedSearchTerm) && !/^\.+$/.test(trimmedSearchTerm) && !/^\*+$/.test(trimmedSearchTerm);
      if (isPotentiallyIpSegment && !matchedIpPattern) orConditionsForSearchTerm.push({ ipAddress: { startsWith: trimmedSearchTerm } });

      orConditionsForSearchTerm.push({ allocatedTo: { contains: trimmedSearchTerm } });
      orConditionsForSearchTerm.push({ description: { contains: trimmedSearchTerm } });
      orConditionsForSearchTerm.push({ usageUnit: { contains: trimmedSearchTerm } });
      orConditionsForSearchTerm.push({ contactPerson: { contains: trimmedSearchTerm } });
      orConditionsForSearchTerm.push({ phone: { contains: trimmedSearchTerm } });
      orConditionsForSearchTerm.push({ peerUnitName: { contains: trimmedSearchTerm } });
      orConditionsForSearchTerm.push({ peerDeviceName: { contains: trimmedSearchTerm } });
      orConditionsForSearchTerm.push({ peerPortName: { contains: trimmedSearchTerm } });
      orConditionsForSearchTerm.push({ selectedAccessType: { contains: trimmedSearchTerm } });
      orConditionsForSearchTerm.push({ selectedLocalDeviceName: { contains: trimmedSearchTerm } });
      orConditionsForSearchTerm.push({ selectedDevicePort: { contains: trimmedSearchTerm } });
      orConditionsForSearchTerm.push({ selectedPaymentSource: { contains: trimmedSearchTerm } });
    }
    if (orConditionsForSearchTerm.length > 0) andConditions.push({ OR: orConditionsForSearchTerm }); else if (trimmedSearchTerm) andConditions.push({ id: "IMPOSSIBLE_ID_TO_MATCH_ANYTHING_IP_SEARCH" });
    if (statusFilter && statusFilter !== 'all') andConditions.push({ status: statusFilter as AppIPAddressStatusType });
    let whereClause: Prisma.IPAddressWhereInput = {};
    if (andConditions.length > 0) whereClause = { AND: andConditions }; else if (!trimmedSearchTerm && (!statusFilter || statusFilter === 'all')) return { success: true, data: { data: [], totalCount: 0, currentPage: page, totalPages: 0, pageSize } };
    const totalCount = await prisma.iPAddress.count({ where: whereClause }); const totalPages = Math.ceil(totalCount / pageSize) || 1;
    const includeClauseForQuery = { subnet: { include: { vlan: { select: { vlanNumber: true, name: true } } } }, directVlan: { select: {vlanNumber: true, name: true} } };
    const ipsFromDb = await prisma.iPAddress.findMany({ where: whereClause, include: includeClauseForQuery, orderBy: [ { subnet: { networkAddress: 'asc' } }, { ipAddress: 'asc' } ], skip, take: pageSize }) as PrismaIPAddressWithRelations[];
    const results: AppIPAddressWithRelations[] = ipsFromDb.map(ip => ({ id: ip.id, ipAddress: ip.ipAddress, status: ip.status as AppIPAddressStatusType, isGateway: ip.isGateway ?? false, allocatedTo: ip.allocatedTo || undefined, usageUnit: ip.usageUnit || undefined, contactPerson: ip.contactPerson || undefined, phone: ip.phone || undefined, description: ip.description || undefined, createdAt: ip.createdAt.toISOString(), updatedAt: ip.updatedAt.toISOString(), subnetId: ip.subnetId || undefined, directVlanId: ip.directVlanId || undefined, subnet: ip.subnet ? { id: ip.subnet.id, cidr: ip.subnet.cidr, name: ip.subnet.name || undefined, networkAddress: ip.subnet.networkAddress, vlan: ip.subnet.vlan ? { vlanNumber: ip.subnet.vlan.vlanNumber, name: ip.subnet.vlan.name || undefined } : null } : null, directVlan: ip.directVlan ? { vlanNumber: ip.directVlan.vlanNumber, name: ip.directVlan.name || undefined } : null, peerUnitName: ip.peerUnitName || undefined, peerDeviceName: ip.peerDeviceName || undefined, peerPortName: ip.peerPortName || undefined, selectedAccessType: ip.selectedAccessType || undefined, selectedLocalDeviceName: ip.selectedLocalDeviceName || undefined, selectedDevicePort: ip.selectedDevicePort || undefined, selectedPaymentSource: ip.selectedPaymentSource || undefined }));
    return { success: true, data: { data: results, totalCount, currentPage: page, totalPages, pageSize } };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

export async function getSubnetFreeIpDetailsAction(subnetId: string): Promise<ActionResponse<SubnetFreeIpDetails>> {
  const actionName = 'getSubnetFreeIpDetailsAction';
  try {
    const subnet = await prisma.subnet.findUnique({ where: { id: subnetId } }); if (!subnet) throw new NotFoundError(`子网 ID: ${subnetId}`, `子网 ID ${subnetId} 未找到。`);
    const subnetProperties = getSubnetPropertiesFromCidr(subnet.cidr); if (!subnetProperties) throw new AppError(`子网 ${subnet.cidr} 的 CIDR 配置无效。`, 500, 'SUBNET_CIDR_INVALID_FOR_FREE_IP_CALC', `子网 ${subnet.cidr} 的 CIDR 配置无效。`);
    const totalUsableIPs = getUsableIpCount(subnetProperties.prefix);
    const dbAllocatedIPs = await prisma.iPAddress.findMany({ where: { subnetId, status: 'allocated' }, select: { ipAddress: true } });
    const dbReservedIPs = await prisma.iPAddress.findMany({ where: { subnetId, status: 'reserved' }, select: { ipAddress: true } });
    const dbAllocatedIPsCount = dbAllocatedIPs.length; const dbReservedIPsCount = dbReservedIPs.length;
    const usedIpNumbers = new Set([...dbAllocatedIPs, ...dbReservedIPs].map(ip => ipToNumber(ip.ipAddress))); const availableIpNumbers: number[] = [];
    if (subnetProperties.firstUsableIp && subnetProperties.lastUsableIp) { const firstUsableNum = ipToNumber(subnetProperties.firstUsableIp); const lastUsableNum = ipToNumber(subnetProperties.lastUsableIp); for (let i = firstUsableNum; i <= lastUsableNum; i++) { if (!usedIpNumbers.has(i)) availableIpNumbers.push(i); } }
    else if (subnetProperties.prefix === 32) { const networkNum = ipToNumber(subnetProperties.networkAddress); if (!usedIpNumbers.has(networkNum)) availableIpNumbers.push(networkNum); }
    else if (subnetProperties.prefix === 31) { const networkNum = ipToNumber(subnetProperties.networkAddress); const secondIpNum = ipToNumber(subnetProperties.broadcastAddress); if (!usedIpNumbers.has(networkNum)) availableIpNumbers.push(networkNum); if (!usedIpNumbers.has(secondIpNum)) availableIpNumbers.push(secondIpNum); }
    const calculatedAvailableIpRanges = groupConsecutiveIpsToRanges(availableIpNumbers);
    return { success: true, data: { subnetId, subnetCidr: subnet.cidr, totalUsableIPs, dbAllocatedIPsCount, dbReservedIPsCount, calculatedAvailableIPsCount: availableIpNumbers.length, calculatedAvailableIpRanges, } };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

export async function getDashboardDataAction(): Promise<ActionResponse<DashboardData>> {
  const actionName = 'getDashboardDataAction';
  try {
    const [
      ipStatusGroups,
      vlanResources,
      recentAuditLogsDb,
      usageUnitGroups,
      unspecifiedUsageUnitCount,
      subnetsNeedingAttentionRaw
    ] = await prisma.$transaction([
      prisma.iPAddress.groupBy({
        by: ['status'],
        _count: { _all: true },
        orderBy: {
          status: 'asc',
        },
      }),
      prisma.vLAN.findMany({
        select: {
          id: true,
          vlanNumber: true,
          name: true,
          _count: { select: { subnets: true, directIPs: true } },
        },
        orderBy: { vlanNumber: 'asc' },
      }),
      prisma.auditLog.findMany({
        select: { id: true, username: true, action: true, timestamp: true, details: true },
        orderBy: { timestamp: 'desc' },
        take: DASHBOARD_AUDIT_LOG_COUNT,
      }),
      prisma.iPAddress.groupBy({
        by: ['usageUnit'],
        _count: { usageUnit: true },
        where: { AND: [{ usageUnit: { not: null } }, { usageUnit: { not: "" } }] },
        orderBy: { _count: { usageUnit: 'desc' } },
      }),
      prisma.iPAddress.count({
        where: { OR: [{ usageUnit: null }, { usageUnit: "" }] },
      }),
      prisma.subnet.findMany({
        select: { id: true, cidr: true, name: true, _count: { select: { ipAddresses: { where: { status: 'allocated' } } } } },
      })
    ]);

    const [totalIpCount, totalVlanCount, totalSubnetCount] = await prisma.$transaction([
        prisma.iPAddress.count(),
        prisma.vLAN.count(),
        prisma.subnet.count(),
    ]);

    const ipStatusCounts: IPStatusCounts = { allocated: 0, free: 0, reserved: 0 };
    ipStatusGroups.forEach(group => {
      const statusKey = group.status as keyof IPStatusCounts;
      if (statusKey in ipStatusCounts && group._count && typeof group._count === 'object') {
        ipStatusCounts[statusKey] = group._count._all || 0;
      }
    });

    let ipUsageByUnit: TopNItemCount[] = usageUnitGroups
      .map((g, index) => ({ item: g.usageUnit!, count: (g._count && typeof g._count === 'object' ? g._count.usageUnit : 0) || 0, fill: CHART_COLORS_REMAINDER[index % CHART_COLORS_REMAINDER.length] }))
      .slice(0, DASHBOARD_TOP_N_COUNT);
    const otherUsageUnitCount = usageUnitGroups.slice(DASHBOARD_TOP_N_COUNT).reduce((sum, g) => sum + ((g._count && typeof g._count === 'object' ? g._count.usageUnit : 0) || 0), 0);
    if (otherUsageUnitCount > 0) ipUsageByUnit.push({ item: "其他", count: otherUsageUnitCount, fill: CHART_COLORS_REMAINDER[DASHBOARD_TOP_N_COUNT % CHART_COLORS_REMAINDER.length]});
    if (unspecifiedUsageUnitCount > 0) {
        const unspecifiedExists = ipUsageByUnit.find(item => item.item === "未指定");
        let currentTopNSize = DASHBOARD_TOP_N_COUNT;
        const otherItemIndex = ipUsageByUnit.findIndex(item => item.item === "其他");
        
        if (!unspecifiedExists) {
            if (ipUsageByUnit.length < currentTopNSize || (ipUsageByUnit.length === currentTopNSize && otherItemIndex === -1)) {
                 ipUsageByUnit.push({ item: "未指定", count: unspecifiedUsageUnitCount, fill: CHART_COLORS_REMAINDER[(ipUsageByUnit.length) % CHART_COLORS_REMAINDER.length]});
            } else if (otherItemIndex !== -1) { 
                 ipUsageByUnit[otherItemIndex].count += unspecifiedUsageUnitCount;
            } else { 
                 ipUsageByUnit.push({ item: "其他", count: unspecifiedUsageUnitCount, fill: CHART_COLORS_REMAINDER[(ipUsageByUnit.length) % CHART_COLORS_REMAINDER.length]});
            }
        }
    }
    ipUsageByUnit.sort((a, b) => { if (a.item === "其他" || a.item === "未指定") return 1; if (b.item === "其他" || b.item === "未指定") return -1; return b.count - a.count; });
    if (ipUsageByUnit.length > DASHBOARD_TOP_N_COUNT + 1) { 
        ipUsageByUnit = ipUsageByUnit.slice(0, DASHBOARD_TOP_N_COUNT + 1);
    }

    const vlanResourceCounts: VLANResourceInfo[] = vlanResources.map(vlan => ({
      id: vlan.id,
      vlanNumber: vlan.vlanNumber,
      name: vlan.name || undefined,
      resourceCount: ((vlan._count && typeof vlan._count === 'object' ? vlan._count.subnets : 0) || 0) + ((vlan._count && typeof vlan._count === 'object' ? vlan._count.directIPs : 0) || 0),
    }));
    const busiestVlans = [...vlanResourceCounts].sort((a, b) => b.resourceCount - a.resourceCount).slice(0, DASHBOARD_TOP_N_COUNT);
    
    const subnetsNeedingAttention: SubnetUtilizationInfo[] = subnetsNeedingAttentionRaw.map(subnet => {
        const subnetProperties = getSubnetPropertiesFromCidr(subnet.cidr);
        let utilization = 0;
        if (subnetProperties) {
            const totalUsableIps = getUsableIpCount(subnetProperties.prefix);
            const allocatedIpsCount = (subnet._count && typeof subnet._count === 'object' ? subnet._count.ipAddresses : 0) || 0;
            if (totalUsableIps > 0) {
                const rawPercentage = (allocatedIpsCount / totalUsableIps) * 100;
                utilization = Math.round(rawPercentage);
            }
        }
        return { id: subnet.id, cidr: subnet.cidr, name: subnet.name || undefined, utilization };
    })
    .filter(s => s.utilization > 80)
    .sort((a, b) => b.utilization - a.utilization)
    .slice(0, DASHBOARD_TOP_N_COUNT);

    const recentAuditLogs: AuditLog[] = recentAuditLogsDb.map(log => ({ id: log.id, userId: undefined, username: log.username || '系统', action: log.action, timestamp: log.timestamp.toISOString(), details: log.details || undefined }));

    const dashboardData: DashboardData = {
      totalIpCount, ipStatusCounts, totalVlanCount, totalSubnetCount,
      ipUsageByUnit, busiestVlans,
      subnetsNeedingAttention, recentAuditLogs,
    };
    
    revalidatePath("/dashboard");
    return { success: true, data: dashboardData };
  } catch (error: unknown) {
    logger.error(actionName, error as Error, { context: actionName });
    return { success: false, error: createActionErrorResponse(error, actionName) };
  }
}

export async function checkInterfaceTypeUsage(interfaceTypeName: string, forItemIdentifier: string): Promise<void> {
  const [
    peerPortPrefixUsage,
    peerPortExactUsage,
    localDevicePortPrefixUsage,
    localDevicePortExactUsage
  ] = await Promise.all([
    prisma.iPAddress.count({ where: { peerPortName: { startsWith: `${interfaceTypeName} ` } } }),
    prisma.iPAddress.count({ where: { peerPortName: interfaceTypeName } }),
    prisma.iPAddress.count({ where: { selectedDevicePort: { startsWith: `${interfaceTypeName} ` } } }),
    prisma.iPAddress.count({ where: { selectedDevicePort: interfaceTypeName } })
  ]);
  
  if (peerPortPrefixUsage > 0) throw new ResourceError(`接口类型 "${interfaceTypeName}" 正在被 ${peerPortPrefixUsage} 个 IP 地址的“对端端口”字段作为前缀使用。`, 'INTERFACE_TYPE_IN_USE_PEER_PORT_PREFIX', `接口类型 "${interfaceTypeName}" (条目: ${forItemIdentifier}) 正在被 ${peerPortPrefixUsage} 个 IP 的“对端端口”作为前缀使用。`);
  if (peerPortExactUsage > 0) throw new ResourceError(`接口类型 "${interfaceTypeName}" 正在被 ${peerPortExactUsage} 个 IP 地址的“对端端口”字段精确匹配使用。`, 'INTERFACE_TYPE_IN_USE_PEER_PORT_EXACT', `接口类型 "${interfaceTypeName}" (条目: ${forItemIdentifier}) 正在被 ${peerPortExactUsage} 个 IP 的“对端端口”精确匹配使用。`);
  if (localDevicePortPrefixUsage > 0) throw new ResourceError(`接口类型 "${interfaceTypeName}" 正在被 ${localDevicePortPrefixUsage} 个 IP 地址的“本端设备端口”字段作为前缀使用。`, 'INTERFACE_TYPE_IN_USE_LOCAL_PORT_PREFIX', `接口类型 "${interfaceTypeName}" (条目: ${forItemIdentifier}) 正在被 ${localDevicePortPrefixUsage} 个 IP 的“本端设备端口”作为前缀使用。`);
  if (localDevicePortExactUsage > 0) throw new ResourceError(`接口类型 "${interfaceTypeName}" 正在被 ${localDevicePortExactUsage} 个 IP 地址的“本端设备端口”字段精确匹配使用。`, 'INTERFACE_TYPE_IN_USE_LOCAL_PORT_EXACT', `接口类型 "${interfaceTypeName}" (条目: ${forItemIdentifier}) 正在被 ${localDevicePortExactUsage} 个 IP 的“本端设备端口”精确匹配使用。`);
}

export async function getDeviceDictionariesAction(params?: FetchParams): Promise<PaginatedResponse<AppDeviceDictionary>> {
    const actionName = 'getDeviceDictionariesAction';
    try {
        const page = params?.page || 1;
        const pageSize = params?.pageSize || DEFAULT_PAGE_SIZE;
        const skip = (page - 1) * pageSize;
        const totalCount = await prisma.deviceDictionary.count();
        const totalPages = Math.ceil(totalCount / pageSize) || 1;

        const itemsFromDb = await prisma.deviceDictionary.findMany({
            orderBy: { deviceName: 'asc' },
            skip,
            take: pageSize
        });
        
        const appItems: AppDeviceDictionary[] = itemsFromDb.map(item => ({ 
            ...item, 
            createdAt: item.createdAt.toISOString(), 
            updatedAt: item.updatedAt.toISOString() 
        }));
        
        return { data: appItems, totalCount, currentPage: page, totalPages, pageSize };
    } catch (error: unknown) {
        logger.error(`Error in ${actionName}`, error as Error, undefined, actionName);
        throw new AppError("获取设备字典数据时发生服务器错误。", 500, "GET_DEVICE_DICTS_FAILED", "无法加载设备字典数据。");
    }
}

export async function createDeviceDictionaryAction(data: Omit<AppDeviceDictionary, 'id' | 'createdAt' | 'updatedAt'>, performingUserId?: string): Promise<ActionResponse<AppDeviceDictionary>> {
  const actionName = 'createDeviceDictionaryAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    if (!data.deviceName || data.deviceName.trim() === "") throw new ValidationError("设备名称是必需的。", "deviceName", undefined, "设备名称是必需的。");
    if (await prisma.deviceDictionary.findUnique({ where: { deviceName: data.deviceName } })) throw new ResourceError(`设备名称 "${data.deviceName}" 已存在。`, 'DEVICE_DICT_NAME_EXISTS', `设备名称 "${data.deviceName}" 已存在。`, 'deviceName');
    const newItem = await prisma.deviceDictionary.create({ data: { deviceName: data.deviceName } });
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'create_device_dictionary', details: `创建了设备字典条目: ${newItem.deviceName}` } });
    revalidatePath("/dictionaries/device");
    revalidatePath("/ip-addresses");
    const appItem: AppDeviceDictionary = {...newItem, createdAt: newItem.createdAt.toISOString(), updatedAt: newItem.updatedAt.toISOString()};
    return { success: true, data: appItem };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

export async function updateDeviceDictionaryAction(id: string, data: Partial<Omit<AppDeviceDictionary, 'id' | 'createdAt' | 'updatedAt'>>, performingUserId?: string): Promise<ActionResponse<AppDeviceDictionary>> {
  const actionName = 'updateDeviceDictionaryAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    const itemToUpdate = await prisma.deviceDictionary.findUnique({ where: { id } }); if (!itemToUpdate) throw new NotFoundError(`设备字典 ID: ${id}`, `设备字典 ID ${id} 未找到。`);
    const updatePayload: Prisma.DeviceDictionaryUpdateInput = {};
    if (data.deviceName && data.deviceName !== itemToUpdate.deviceName) { if (await prisma.deviceDictionary.findFirst({ where: { deviceName: data.deviceName, NOT: { id } } })) throw new ResourceError(`设备名称 "${data.deviceName}" 已存在。`, 'DEVICE_DICT_NAME_EXISTS', `设备名称 "${data.deviceName}" 已存在。`, 'deviceName'); updatePayload.deviceName = data.deviceName; }
    if (Object.keys(updatePayload).length === 0) { const currentItem: AppDeviceDictionary = {...itemToUpdate, createdAt: itemToUpdate.createdAt.toISOString(), updatedAt: itemToUpdate.updatedAt.toISOString()}; return { success: true, data: currentItem }; }
    const updatedItem = await prisma.deviceDictionary.update({ where: { id }, data: updatePayload });
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'update_device_dictionary', details: `更新了设备字典条目: ${updatedItem.deviceName}` } });
    revalidatePath("/dictionaries/device");
    revalidatePath("/ip-addresses");
    const appItem: AppDeviceDictionary = {...updatedItem, createdAt: updatedItem.createdAt.toISOString(), updatedAt: updatedItem.updatedAt.toISOString()};
    return { success: true, data: appItem };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

export async function deleteDeviceDictionaryAction(id: string, performingUserId?: string): Promise<ActionResponse> {
  const actionName = 'deleteDeviceDictionaryAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    const itemToDelete = await prisma.deviceDictionary.findUnique({ where: { id } }); if (!itemToDelete) throw new NotFoundError(`设备字典 ID: ${id}`, `设备字典 ID ${id} 未找到。`);
    const localDeviceInUse = await prisma.iPAddress.count({ where: { selectedLocalDeviceName: itemToDelete.deviceName }});
    if (localDeviceInUse > 0) throw new ResourceError(`设备 "${itemToDelete.deviceName}" 正在被 ${localDeviceInUse} 个 IP 地址的“本端设备”字段使用，无法删除。`, 'DEVICE_DICT_IN_USE_LOCAL', `设备 "${itemToDelete.deviceName}" 正在被 ${localDeviceInUse} 个 IP 地址的“本端设备”字段使用，无法删除。`);
    const peerDeviceInUse = await prisma.iPAddress.count({ where: { peerDeviceName: itemToDelete.deviceName }});
    if (peerDeviceInUse > 0) throw new ResourceError(`设备 "${itemToDelete.deviceName}" 正在被 ${peerDeviceInUse} 个 IP 地址的“对端设备”字段使用，无法删除。`, 'DEVICE_DICT_IN_USE_PEER', `设备 "${itemToDelete.deviceName}" 正在被 ${peerDeviceInUse} 个 IP 地址的“对端设备”字段使用，无法删除。`);

    await prisma.deviceDictionary.delete({ where: { id } });
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'delete_device_dictionary', details: `删除了设备字典条目: ${itemToDelete.deviceName}` } });
    revalidatePath("/dictionaries/device");
    revalidatePath("/ip-addresses");
    return { success: true };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

export async function batchDeleteDeviceDictionariesAction(ids: string[], performingUserId?: string): Promise<BatchDeleteResult> {
  const actionName = 'batchDeleteDeviceDictionariesAction';
  const auditUser = await getAuditUserInfo(performingUserId);
  const failureDetails: BatchOperationFailure[] = [];
  const successfullyDeletedItemNames: string[] = [];

  const itemsToProcess = await prisma.deviceDictionary.findMany({
      where: { id: { in: ids } },
      select: { id: true, deviceName: true }
  });
  const itemMap = new Map(itemsToProcess.map(item => [item.id, item]));
  
  const validDeletes: Array<{id: string, deviceName: string}> = [];

  // Pre-validation loop
  for (const id of ids) {
      const item = itemMap.get(id);
      const itemIdentifier = item?.deviceName || `ID ${id}`; 
      if (!item) {
          failureDetails.push({ id, itemIdentifier, error: '未找到条目。' });
          continue;
      }
      try {
          const localDeviceInUse = await prisma.iPAddress.count({ where: { selectedLocalDeviceName: item.deviceName }});
          if (localDeviceInUse > 0) throw new ResourceError(`设备 "${item.deviceName}" 正在被 ${localDeviceInUse} 个 IP 地址的“本端设备”字段使用。`, 'DEVICE_DICT_IN_USE_LOCAL_BATCH', `设备 "${item.deviceName}" 正在被 ${localDeviceInUse} 个 IP 地址的“本端设备”字段使用。`);
          const peerDeviceInUse = await prisma.iPAddress.count({ where: { peerDeviceName: item.deviceName }});
          if (peerDeviceInUse > 0) throw new ResourceError(`设备 "${item.deviceName}" 正在被 ${peerDeviceInUse} 个 IP 地址的“对端设备”字段使用。`, 'DEVICE_DICT_IN_USE_PEER_BATCH', `设备 "${item.deviceName}" 正在被 ${peerDeviceInUse} 个 IP 地址的“对端设备”字段使用。`);
          
          validDeletes.push({ id: item.id, deviceName: item.deviceName });
      } catch (e: unknown) {
          const errRes = createActionErrorResponse(e, `${actionName}_single_check`);
          failureDetails.push({ id, itemIdentifier, error: errRes.userMessage });
      }
  }
  
  let successCount = 0;
  const BATCH_SIZE = 100;

  // Batch processing loop
  for (let i = 0; i < validDeletes.length; i += BATCH_SIZE) {
    const batch = validDeletes.slice(i, i + BATCH_SIZE);
    const batchIds = batch.map(item => item.id);
    
    try {
        const result = await prisma.deviceDictionary.deleteMany({ where: { id: { in: batchIds } } });
        successCount += result.count;
        batch.forEach(item => successfullyDeletedItemNames.push(item.deviceName));
    } catch (transactionError: unknown) {
        const errRes = createActionErrorResponse(transactionError, `${actionName}_transaction`);
        batch.forEach(item => {
            if (!failureDetails.some(f => f.id === item.id)) {
                failureDetails.push({ id: item.id, itemIdentifier: item.deviceName, error: `事务失败: ${errRes.userMessage}` });
            }
        });
    }
  }

  if (successCount > 0) {
      await prisma.auditLog.create({data: {userId: auditUser.userId, username: auditUser.username, action: 'batch_delete_device_dictionary', details: `批量成功删除了 ${successCount} 个设备字典条目: ${successfullyDeletedItemNames.join(', ')}。最初选中 ${ids.length} 个。`}});
      revalidatePath("/dictionaries/device");
      revalidatePath("/ip-addresses");
  }
  return { successCount, failureCount: failureDetails.length, failureDetails };
}

export async function getPaymentSourceDictionariesAction(params?: FetchParams): Promise<PaginatedResponse<AppPaymentSourceDictionary>> {
  const actionName = 'getPaymentSourceDictionariesAction';
  try {
      const page = params?.page || 1;
      const pageSize = params?.pageSize || DEFAULT_PAGE_SIZE;
      const skip = (page - 1) * pageSize;
      const totalCount = await prisma.paymentSourceDictionary.count();
      const totalPages = Math.ceil(totalCount / pageSize) || 1;

      const itemsFromDb = await prisma.paymentSourceDictionary.findMany({
          orderBy: { sourceName: 'asc' },
          skip,
          take: pageSize
      });
      
      const appItems: AppPaymentSourceDictionary[] = itemsFromDb.map(item => ({ 
          ...item, 
          createdAt: item.createdAt.toISOString(), 
          updatedAt: item.updatedAt.toISOString() 
      }));
      
      return { data: appItems, totalCount, currentPage: page, totalPages, pageSize };
  } catch (error: unknown) {
      logger.error(`Error in ${actionName}`, error as Error, undefined, actionName);
      throw new AppError("获取付费来源字典数据时发生服务器错误。", 500, "GET_PAYMENT_SOURCE_DICTS_FAILED", "无法加载付费来源字典数据。");
  }
}

export async function createPaymentSourceDictionaryAction(data: Omit<AppPaymentSourceDictionary, 'id' | 'createdAt' | 'updatedAt'>, performingUserId?: string): Promise<ActionResponse<AppPaymentSourceDictionary>> {
  const actionName = 'createPaymentSourceDictionaryAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    if (!data.sourceName || data.sourceName.trim() === "") throw new ValidationError("费用来源名称是必需的。", "sourceName", undefined, "费用来源名称是必需的。");
    if (await prisma.paymentSourceDictionary.findUnique({ where: { sourceName: data.sourceName } })) throw new ResourceError(`费用来源 "${data.sourceName}" 已存在。`, 'PAYMENT_SOURCE_DICT_NAME_EXISTS', `费用来源 "${data.sourceName}" 已存在。`, 'sourceName');
    const newItem = await prisma.paymentSourceDictionary.create({ data: { sourceName: data.sourceName } });
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'create_payment_source_dictionary', details: `创建了付费字典条目: ${newItem.sourceName}` } });
    revalidatePath("/dictionaries/payment-source");
    revalidatePath("/ip-addresses");
    const appItem: AppPaymentSourceDictionary = {...newItem, createdAt: newItem.createdAt.toISOString(), updatedAt: newItem.updatedAt.toISOString()};
    return { success: true, data: appItem };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

export async function updatePaymentSourceDictionaryAction(id: string, data: Partial<Omit<AppPaymentSourceDictionary, 'id' | 'createdAt' | 'updatedAt'>>, performingUserId?: string): Promise<ActionResponse<AppPaymentSourceDictionary>> {
  const actionName = 'updatePaymentSourceDictionaryAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    const itemToUpdate = await prisma.paymentSourceDictionary.findUnique({ where: { id } }); if (!itemToUpdate) throw new NotFoundError(`付费字典 ID: ${id}`, `付费字典 ID ${id} 未找到。`);
    const updatePayload: Prisma.PaymentSourceDictionaryUpdateInput = {};
    if (data.sourceName && data.sourceName !== itemToUpdate.sourceName) { if (await prisma.paymentSourceDictionary.findFirst({ where: { sourceName: data.sourceName, NOT: { id } } })) throw new ResourceError(`费用来源 "${data.sourceName}" 已存在。`, 'PAYMENT_SOURCE_DICT_NAME_EXISTS', `费用来源 "${data.sourceName}" 已存在。`, 'sourceName'); updatePayload.sourceName = data.sourceName; }
    if (Object.keys(updatePayload).length === 0) { const currentItem: AppPaymentSourceDictionary = {...itemToUpdate, createdAt: itemToUpdate.createdAt.toISOString(), updatedAt: itemToUpdate.updatedAt.toISOString()}; return { success: true, data: currentItem }; }
    const updatedItem = await prisma.paymentSourceDictionary.update({ where: { id }, data: updatePayload });
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'update_payment_source_dictionary', details: `更新了付费字典条目: ${updatedItem.sourceName}` } });
    revalidatePath("/dictionaries/payment-source");
    revalidatePath("/ip-addresses");
    const appItem: AppPaymentSourceDictionary = {...updatedItem, createdAt: updatedItem.createdAt.toISOString(), updatedAt: updatedItem.updatedAt.toISOString()};
    return { success: true, data: appItem };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

export async function deletePaymentSourceDictionaryAction(id: string, performingUserId?: string): Promise<ActionResponse> {
  const actionName = 'deletePaymentSourceDictionaryAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    const itemToDelete = await prisma.paymentSourceDictionary.findUnique({ where: { id } }); if (!itemToDelete) throw new NotFoundError(`付费字典 ID: ${id}`, `付费字典 ID ${id} 未找到。`);
    if (await prisma.iPAddress.count({where: {selectedPaymentSource: itemToDelete.sourceName}}) > 0) throw new ResourceError(`付费来源 "${itemToDelete.sourceName}" 正在被 IP 地址使用，无法删除。`, 'PAYMENT_SOURCE_IN_USE', `付费来源 "${itemToDelete.sourceName}" 正在被 IP 地址使用，无法删除。`);
    await prisma.paymentSourceDictionary.delete({ where: { id } });
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'delete_payment_source_dictionary', details: `删除了付费字典条目: ${itemToDelete.sourceName}` } });
    revalidatePath("/dictionaries/payment-source");
    revalidatePath("/ip-addresses");
    return { success: true };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

export async function batchDeletePaymentSourceDictionariesAction(ids: string[], performingUserId?: string): Promise<BatchDeleteResult> {
  const actionName = 'batchDeletePaymentSourceDictionariesAction';
  const auditUser = await getAuditUserInfo(performingUserId);
  const failureDetails: BatchOperationFailure[] = [];
  const successfullyDeletedItemNames: string[] = [];

  const itemsToProcess = await prisma.paymentSourceDictionary.findMany({
      where: { id: { in: ids } },
      select: { id: true, sourceName: true }
  });
  const itemMap = new Map(itemsToProcess.map(item => [item.id, item]));

  const validDeletes: Array<{id: string, sourceName: string}> = [];

  // Pre-validation loop
  for (const id of ids) {
      const item = itemMap.get(id);
      const itemIdentifier = item?.sourceName || `ID ${id}`; 
      if (!item) {
          failureDetails.push({ id, itemIdentifier, error: '未找到条目。' });
          continue;
      }
      try {
          if (await prisma.iPAddress.count({ where: { selectedPaymentSource: item.sourceName } }) > 0) {
              throw new ResourceError(`付费来源 "${item.sourceName}" 正在被 IP 地址使用。`, 'PAYMENT_SOURCE_IN_USE_BATCH', `付费来源 "${item.sourceName}" 正在被 IP 地址使用。`);
          }
          validDeletes.push({ id: item.id, sourceName: item.sourceName});
      } catch (e: unknown) {
          const errRes = createActionErrorResponse(e, `${actionName}_single_check`);
          failureDetails.push({ id, itemIdentifier, error: errRes.userMessage });
      }
  }

  let successCount = 0;
  const BATCH_SIZE = 100;

  // Batch processing loop
  for (let i = 0; i < validDeletes.length; i += BATCH_SIZE) {
    const batch = validDeletes.slice(i, i + BATCH_SIZE);
    const batchIds = batch.map(item => item.id);

    try {
        const result = await prisma.paymentSourceDictionary.deleteMany({ where: { id: { in: batchIds } } });
        successCount += result.count;
        batch.forEach(item => successfullyDeletedItemNames.push(item.sourceName));
    } catch (transactionError: unknown) {
        const errRes = createActionErrorResponse(transactionError, `${actionName}_transaction`);
        batch.forEach(item => {
            if (!failureDetails.some(f => f.id === item.id)) {
                failureDetails.push({ id: item.id, itemIdentifier: item.sourceName, error: `事务失败: ${errRes.userMessage}` });
            }
        });
    }
  }

  if (successCount > 0) {
      await prisma.auditLog.create({data: {userId: auditUser.userId, username: auditUser.username, action: 'batch_delete_payment_source_dictionary', details: `批量成功删除了 ${successCount} 个付费字典条目: ${successfullyDeletedItemNames.join(', ')}。最初选中 ${ids.length} 个。`}});
      revalidatePath("/dictionaries/payment-source");
      revalidatePath("/ip-addresses");
  }
  return { successCount, failureCount: failureDetails.length, failureDetails };
}

export async function getAccessTypeDictionariesAction(params?: FetchParams): Promise<PaginatedResponse<AppAccessTypeDictionary>> {
    const actionName = 'getAccessTypeDictionariesAction';
    try {
        const page = params?.page || 1;
        const pageSize = params?.pageSize || DEFAULT_PAGE_SIZE;
        const skip = (page - 1) * pageSize;
        const totalCount = await prisma.accessTypeDictionary.count();
        const totalPages = Math.ceil(totalCount / pageSize) || 1;
        
        const itemsFromDb = await prisma.accessTypeDictionary.findMany({
            orderBy: { name: 'asc' },
            skip,
            take: pageSize
        });
        
        const appItems: AppAccessTypeDictionary[] = itemsFromDb.map(item => ({ 
            ...item, 
            createdAt: item.createdAt.toISOString(), 
            updatedAt: item.updatedAt.toISOString() 
        }));

        return { data: appItems, totalCount, currentPage: page, totalPages, pageSize };
    } catch (error: unknown) {
        logger.error(`Error in ${actionName}`, error as Error, undefined, actionName);
        throw new AppError("获取接入方式字典数据时发生服务器错误。", 500, "GET_ACCESS_TYPE_DICTS_FAILED", "无法加载接入方式字典数据。");
    }
}


export async function createAccessTypeDictionaryAction(data: Omit<AppAccessTypeDictionary, 'id' | 'createdAt' | 'updatedAt'>, performingUserId?: string): Promise<ActionResponse<AppAccessTypeDictionary>> {
  const actionName = 'createAccessTypeDictionaryAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    if (!data.name || data.name.trim() === "") throw new ValidationError("接入方式名称是必需的。", "name", undefined, "接入方式名称是必需的。");
    if (await prisma.accessTypeDictionary.findUnique({ where: { name: data.name } })) throw new ResourceError(`接入方式 "${data.name}" 已存在。`, 'ACCESS_TYPE_DICT_NAME_EXISTS', `接入方式 "${data.name}" 已存在。`, 'name');
    const newItem = await prisma.accessTypeDictionary.create({ data: { name: data.name } });
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'create_access_type_dictionary', details: `创建了接入方式字典条目: ${newItem.name}` } });
    revalidatePath("/dictionaries/access-type"); revalidatePath("/ip-addresses");
    const appItem: AppAccessTypeDictionary = { ...newItem, createdAt: newItem.createdAt.toISOString(), updatedAt: newItem.updatedAt.toISOString() };
    return { success: true, data: appItem };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

export async function updateAccessTypeDictionaryAction(id: string, data: Partial<Omit<AppAccessTypeDictionary, 'id' | 'createdAt' | 'updatedAt'>>, performingUserId?: string): Promise<ActionResponse<AppAccessTypeDictionary>> {
  const actionName = 'updateAccessTypeDictionaryAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    const itemToUpdate = await prisma.accessTypeDictionary.findUnique({ where: { id } }); if (!itemToUpdate) throw new NotFoundError(`接入方式字典 ID: ${id}`, `接入方式字典 ID ${id} 未找到。`);
    const updatePayload: Prisma.AccessTypeDictionaryUpdateInput = {};
    if (data.name && data.name !== itemToUpdate.name) { if (await prisma.accessTypeDictionary.findFirst({ where: { name: data.name, NOT: { id } } })) throw new ResourceError(`接入方式 "${data.name}" 已存在。`, 'ACCESS_TYPE_DICT_NAME_EXISTS', `接入方式 "${data.name}" 已存在。`, 'name'); updatePayload.name = data.name; }
    if (Object.keys(updatePayload).length === 0) { const currentItem: AppAccessTypeDictionary = { ...itemToUpdate, createdAt: itemToUpdate.createdAt.toISOString(), updatedAt: itemToUpdate.updatedAt.toISOString() }; return { success: true, data: currentItem }; }
    const updatedItem = await prisma.accessTypeDictionary.update({ where: { id }, data: updatePayload });
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'update_access_type_dictionary', details: `更新了接入方式字典条目: ${updatedItem.name}` } });
    revalidatePath("/dictionaries/access-type"); revalidatePath("/ip-addresses");
    const appItem: AppAccessTypeDictionary = { ...updatedItem, createdAt: updatedItem.createdAt.toISOString(), updatedAt: updatedItem.updatedAt.toISOString() };
    return { success: true, data: appItem };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

export async function deleteAccessTypeDictionaryAction(id: string, performingUserId?: string): Promise<ActionResponse> {
  const actionName = 'deleteAccessTypeDictionaryAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    const itemToDelete = await prisma.accessTypeDictionary.findUnique({ where: { id } }); if (!itemToDelete) throw new NotFoundError(`接入方式字典 ID: ${id}`, `接入方式字典 ID ${id} 未找到。`);
    if (await prisma.iPAddress.count({where: {selectedAccessType: itemToDelete.name}}) > 0) throw new ResourceError(`接入方式 "${itemToDelete.name}" 正在被 IP 地址使用，无法删除。`, 'ACCESS_TYPE_IN_USE', `接入方式 "${itemToDelete.name}" 正在被 IP 地址使用，无法删除。`);
    await prisma.accessTypeDictionary.delete({ where: { id } });
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'delete_access_type_dictionary', details: `删除了接入方式字典条目: ${itemToDelete.name}` } });
    revalidatePath("/dictionaries/access-type"); revalidatePath("/ip-addresses");
    return { success: true };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

export async function batchDeleteAccessTypeDictionariesAction(ids: string[], performingUserId?: string): Promise<BatchDeleteResult> {
  const actionName = 'batchDeleteAccessTypeDictionariesAction';
  const auditUser = await getAuditUserInfo(performingUserId);
  const failureDetails: BatchOperationFailure[] = [];
  const successfullyDeletedItemNames: string[] = [];

  const itemsToProcess = await prisma.accessTypeDictionary.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true }
  });
  const itemMap = new Map(itemsToProcess.map(item => [item.id, item]));

  const validDeletes: Array<{id: string, name: string}> = [];

  // Pre-validation loop
  for (const id of ids) {
      const item = itemMap.get(id);
      const itemIdentifier = item?.name || `ID ${id}`; 
      if (!item) {
          failureDetails.push({ id, itemIdentifier, error: '未找到条目。' });
          continue;
      }
      try {
          if (await prisma.iPAddress.count({ where: { selectedAccessType: item.name } }) > 0) {
              throw new ResourceError(`接入方式 "${item.name}" 正在被 IP 地址使用。`, 'ACCESS_TYPE_IN_USE_BATCH', `接入方式 "${item.name}" 正在被 IP 地址使用。`);
          }
          validDeletes.push({ id: item.id, name: item.name });
      } catch (e: unknown) {
          const errRes = createActionErrorResponse(e, `${actionName}_single_check`);
          failureDetails.push({ id, itemIdentifier, error: errRes.userMessage });
      }
  }

  let successCount = 0;
  const BATCH_SIZE = 100;

  // Batch processing loop
  for (let i = 0; i < validDeletes.length; i += BATCH_SIZE) {
    const batch = validDeletes.slice(i, i + BATCH_SIZE);
    const batchIds = batch.map(item => item.id);

    try {
        const result = await prisma.accessTypeDictionary.deleteMany({ where: { id: { in: batchIds } } });
        successCount += result.count;
        batch.forEach(item => successfullyDeletedItemNames.push(item.name));
    } catch (transactionError: unknown) {
        const errRes = createActionErrorResponse(transactionError, `${actionName}_transaction`);
        batch.forEach(item => {
            if (!failureDetails.some(f => f.id === item.id)) { 
                failureDetails.push({ id: item.id, itemIdentifier: item.name, error: `事务失败: ${errRes.userMessage}` });
            }
        });
    }
  }

  if (successCount > 0) {
      await prisma.auditLog.create({data: {userId: auditUser.userId, username: auditUser.username, action: 'batch_delete_access_type_dictionary', details: `批量成功删除了 ${successCount} 个接入方式字典条目: ${successfullyDeletedItemNames.join(', ')}。最初选中 ${ids.length} 个。`}});
      revalidatePath("/dictionaries/access-type");
      revalidatePath("/ip-addresses");
  }
  return { successCount, failureCount: failureDetails.length, failureDetails };
}

export async function getInterfaceTypeDictionariesAction(params?: FetchParams): Promise<PaginatedResponse<AppInterfaceTypeDictionary>> {
    const actionName = 'getInterfaceTypeDictionariesAction';
    try {
        const page = params?.page || 1;
        const pageSize = params?.pageSize || DEFAULT_PAGE_SIZE;
        const skip = (page - 1) * pageSize;
        const totalCount = await prisma.interfaceTypeDictionary.count();
        const totalPages = Math.ceil(totalCount / pageSize) || 1;
        
        const itemsFromDb = await prisma.interfaceTypeDictionary.findMany({
            orderBy: { name: 'asc' },
            skip,
            take: pageSize
        });

        const appItems: AppInterfaceTypeDictionary[] = itemsFromDb.map(item => ({ 
            ...item, 
            description: item.description || undefined, 
            createdAt: item.createdAt.toISOString(), 
            updatedAt: item.updatedAt.toISOString() 
        }));
        
        return { data: appItems, totalCount, currentPage: page, totalPages, pageSize };
    } catch (error: unknown) {
        logger.error(`Error in ${actionName}`, error as Error, undefined, actionName);
        throw new AppError("获取接口类型字典数据时发生服务器错误。", 500, "GET_INTERFACE_TYPE_DICTS_FAILED", "无法加载接口类型字典数据。");
    }
}

export async function createInterfaceTypeDictionaryAction(data: Omit<AppInterfaceTypeDictionary, 'id' | 'createdAt' | 'updatedAt'>, performingUserId?: string): Promise<ActionResponse<AppInterfaceTypeDictionary>> {
  const actionName = 'createInterfaceTypeDictionaryAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    if (!data.name || data.name.trim() === "") throw new ValidationError("接口类型名称是必需的。", "name", undefined, "接口类型名称是必需的。");
    if (await prisma.interfaceTypeDictionary.findUnique({ where: { name: data.name } })) throw new ResourceError(`接口类型 "${data.name}" 已存在。`, 'INTERFACE_TYPE_DICT_NAME_EXISTS', `接口类型 "${data.name}" 已存在。`, 'name');
    const newItem = await prisma.interfaceTypeDictionary.create({ data: { name: data.name, description: data.description || null } });
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'create_interface_type_dictionary', details: `创建了接口类型字典条目: ${newItem.name}` } });
    revalidatePath("/dictionaries/interface-type");
    revalidatePath("/ip-addresses"); 
    revalidatePath("/query");
    const appItem: AppInterfaceTypeDictionary = { ...newItem, description: newItem.description || undefined, createdAt: newItem.createdAt.toISOString(), updatedAt: newItem.updatedAt.toISOString() };
    return { success: true, data: appItem };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

export async function updateInterfaceTypeDictionaryAction(id: string, data: Partial<Omit<AppInterfaceTypeDictionary, 'id' | 'createdAt' | 'updatedAt'>>, performingUserId?: string): Promise<ActionResponse<AppInterfaceTypeDictionary>> {
  const actionName = 'updateInterfaceTypeDictionaryAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    const itemToUpdate = await prisma.interfaceTypeDictionary.findUnique({ where: { id } }); if (!itemToUpdate) throw new NotFoundError(`接口类型字典 ID: ${id}`, `接口类型字典 ID ${id} 未找到。`);
    const updatePayload: Prisma.InterfaceTypeDictionaryUpdateInput = {};
    if (data.name && data.name !== itemToUpdate.name) { if (await prisma.interfaceTypeDictionary.findFirst({ where: { name: data.name, NOT: { id } } })) throw new ResourceError(`接口类型 "${data.name}" 已存在。`, 'INTERFACE_TYPE_DICT_NAME_EXISTS', `接口类型 "${data.name}" 已存在。`, 'name'); updatePayload.name = data.name; }
    if (data.hasOwnProperty('description')) updatePayload.description = data.description || null;
    if (Object.keys(updatePayload).length === 0) { const currentItem: AppInterfaceTypeDictionary = { ...itemToUpdate, description: itemToUpdate.description || undefined, createdAt: itemToUpdate.createdAt.toISOString(), updatedAt: itemToUpdate.updatedAt.toISOString() }; return { success: true, data: currentItem }; }
    const updatedItem = await prisma.interfaceTypeDictionary.update({ where: { id }, data: updatePayload });
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'update_interface_type_dictionary', details: `更新了接口类型字典条目: ${updatedItem.name}` } });
    revalidatePath("/dictionaries/interface-type");
    revalidatePath("/ip-addresses");
    revalidatePath("/query");
    const appItem: AppInterfaceTypeDictionary = { ...updatedItem, description: updatedItem.description || undefined, createdAt: updatedItem.createdAt.toISOString(), updatedAt: updatedItem.updatedAt.toISOString() };
    return { success: true, data: appItem };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

export async function deleteInterfaceTypeDictionaryAction(id: string, performingUserId?: string): Promise<ActionResponse> {
  const actionName = 'deleteInterfaceTypeDictionaryAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    const itemToDelete = await prisma.interfaceTypeDictionary.findUnique({ where: { id } }); 
    if (!itemToDelete) throw new NotFoundError(`接口类型字典 ID: ${id}`, `接口类型字典 ID ${id} 未找到。`);
    await checkInterfaceTypeUsage(itemToDelete.name, itemToDelete.name);
    await prisma.interfaceTypeDictionary.delete({ where: { id } });
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'delete_interface_type_dictionary', details: `删除了接口类型字典条目: ${itemToDelete.name}` } });
    revalidatePath("/dictionaries/interface-type");
    revalidatePath("/ip-addresses");
    revalidatePath("/query");
    return { success: true };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

export async function batchDeleteInterfaceTypeDictionariesAction(ids: string[], performingUserId?: string): Promise<BatchDeleteResult> {
  const actionName = 'batchDeleteInterfaceTypeDictionariesAction';
  const auditUser = await getAuditUserInfo(performingUserId);
  const failureDetails: BatchOperationFailure[] = [];
  const successfullyDeletedItemNames: string[] = [];

  const itemsToProcess = await prisma.interfaceTypeDictionary.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true }
  });
  const itemMap = new Map(itemsToProcess.map(item => [item.id, item]));

  const validDeletes: Array<{id: string, name: string}> = [];

  // Pre-validation loop
  for (const id of ids) {
      const item = itemMap.get(id);
      const itemIdentifier = item?.name || `ID ${id}`; 
      if (!item) {
          failureDetails.push({ id, itemIdentifier, error: '未找到条目。' });
          continue;
      }
      try {
          await checkInterfaceTypeUsage(item.name, itemIdentifier);
          validDeletes.push({ id: item.id, name: item.name });
      } catch (e: unknown) {
          const errRes = createActionErrorResponse(e, `${actionName}_single_check`);
          failureDetails.push({ id, itemIdentifier, error: errRes.userMessage });
      }
  }
  
  let successCount = 0;
  const BATCH_SIZE = 100;

  // Batch processing loop
  for (let i = 0; i < validDeletes.length; i += BATCH_SIZE) {
    const batch = validDeletes.slice(i, i + BATCH_SIZE);
    const batchIds = batch.map(item => item.id);

    try {
        const result = await prisma.interfaceTypeDictionary.deleteMany({ where: { id: { in: batchIds } } });
        successCount += result.count;
        batch.forEach(item => successfullyDeletedItemNames.push(item.name));
    } catch (transactionError: unknown) {
        const errRes = createActionErrorResponse(transactionError, `${actionName}_transaction`);
        batch.forEach(item => {
            if (!failureDetails.some(f => f.id === item.id)) { 
                failureDetails.push({ id: item.id, itemIdentifier: item.name, error: `事务失败: ${errRes.userMessage}` });
            }
        });
    }
  }

  if (successCount > 0) { 
    await prisma.auditLog.create({data: {userId: auditUser.userId, username: auditUser.username, action: 'batch_delete_interface_type_dictionary', details: `批量成功删除了 ${successCount} 个接口类型字典条目: ${successfullyDeletedItemNames.join(', ')}。最初选中 ${ids.length} 个。`}}); 
    revalidatePath("/dictionaries/interface-type"); 
    revalidatePath("/ip-addresses");
    revalidatePath("/query");
  }
  return { successCount, failureCount: failureDetails.length, failureDetails };
}
