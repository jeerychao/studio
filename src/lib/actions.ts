
"use server";

import { revalidatePath } from "next/cache";
import type {
  Subnet as AppSubnet, VLAN as AppVLAN, IPAddress as AppIPAddress, User as AppUser, Role as AppRole, AuditLog as AppAuditLog,
  IPAddressStatus as AppIPAddressStatusType, RoleName as AppRoleNameType, PermissionId as AppPermissionIdType,
  Permission as AppPermission, SubnetQueryResult, VlanQueryResult, BatchDeleteResult, BatchOperationFailure,
  SubnetFreeIpDetails, PaginatedResponse,
  OperatorDictionary as AppOperatorDictionary,
  LocalDeviceDictionary as AppLocalDeviceDictionary,
  PaymentSourceDictionary as AppPaymentSourceDictionary,
  AccessTypeDictionary as AppAccessTypeDictionary, 
  NetworkInterfaceTypeDictionary as AppNetworkInterfaceTypeDictionary, 
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
import { validateCIDR as validateCidrInput } from "./error-utils";
import { logger } from './logger';
import { AppError, ValidationError, ResourceError, NotFoundError, AuthError, type ActionErrorResponse } from './errors';
import { createActionErrorResponse } from './error-utils';
import { mockPermissions as seedPermissionsData } from "./data";
import { Prisma } from '@prisma/client';
import { encrypt, decrypt } from '../app/api/auth/[...nextauth]/route';
import { DASHBOARD_TOP_N_COUNT, DASHBOARD_AUDIT_LOG_COUNT } from "./constants";


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

const DEFAULT_PAGE_SIZE = 10;
const DEFAULT_QUERY_PAGE_SIZE = 10;


interface FetchParams { page?: number; pageSize?: number; subnetId?: string; status?: AppIPAddressStatusType | 'all'; }
export interface FetchedUserDetails { id: string; username: string; email: string; roleId: string; roleName: AppRoleNameType; avatar?: string; permissions: AppPermissionIdType[]; lastLogin?: string | undefined; }
interface LoginPayload { email: string; password?: string; }
interface LoginResponse { success: boolean; user?: FetchedUserDetails; message?: string; }

export async function loginAction(payload: LoginPayload): Promise<LoginResponse> {
  const actionName = 'loginAction'; const { email, password: passwordAttempt } = payload;
  if (!email || !passwordAttempt) { return { success: false, message: "邮箱和密码是必需的。" }; }
  try {
    const userFromDb = await prisma.user.findUnique({ where: { email }, include: { role: { include: { permissions: true } } } });
    if (!userFromDb) { logger.error(`[${actionName}] Login failed: User not found for email ${email}.`, new AuthError(`User with email ${email} not found.`), { email }, actionName); return { success: false, message: "邮箱或密码无效。" }; }
    
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

    if (!userFromDb.role || !userFromDb.role.name) { logger.error(`[${actionName}] User ${userFromDb.id} (${userFromDb.username}) missing role.`, new AppError('User role data incomplete'), { userId: userFromDb.id }, actionName); return { success: false, message: "用户角色信息不完整。" }; }
    let permissionsList: AppPermissionIdType[] = userFromDb.role.permissions.map(p => p.id as AppPermissionIdType);
    await prisma.user.update({ where: { id: userFromDb.id }, data: { lastLogin: new Date() } });
    await prisma.auditLog.create({ data: { userId: userFromDb.id, username: userFromDb.username, action: 'user_login', details: `用户 ${userFromDb.username} 成功登录。` } });
    return { success: true, user: { id: userFromDb.id, username: userFromDb.username, email: userFromDb.email, roleId: userFromDb.roleId, roleName: userFromDb.role.name as AppRoleNameType, avatar: userFromDb.avatar || '/images/avatars/default_avatar.png', permissions: permissionsList, lastLogin: userFromDb.lastLogin?.toISOString() } };
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
    const userFromDb = await prisma.user.findUnique({ where: { id: userId }, include: { role: { include: { permissions: true } } } });
    if (!userFromDb || !userFromDb.role || !userFromDb.role.name) { logger.error(`[${actionName}] User ${userId} or role invalid.`, new AppError("User role data invalid"), { userId }, actionName); return null; }
    let permissionsList: AppPermissionIdType[] = userFromDb.role.permissions.map(p => p.id as AppPermissionIdType);
    return { id: userFromDb.id, username: userFromDb.username, email: userFromDb.email, roleId: userFromDb.roleId, roleName: userFromDb.role.name as AppRoleNameType, avatar: userFromDb.avatar || '/images/avatars/default_avatar.png', permissions: permissionsList, lastLogin: userFromDb.lastLogin?.toISOString() || undefined };
  } catch (error) { logger.error(`[${actionName}] Error for userId ${userId}`, error as Error, { userId }, actionName); return null; }
}

export async function getUsersAction(params?: FetchParams): Promise<PaginatedResponse<FetchedUserDetails>> {
  const actionName = 'getUsersAction';
  try {
    const page = params?.page || 1; const pageSize = params?.pageSize || DEFAULT_PAGE_SIZE; const skip = (page - 1) * pageSize;
    const totalCount = await prisma.user.count(); const totalPages = Math.ceil(totalCount / pageSize);
    const usersFromDb = await prisma.user.findMany({ include: { role: { include: { permissions: true } } }, orderBy: { username: 'asc' }, skip, take: pageSize });
    const appUsers: FetchedUserDetails[] = usersFromDb.map(user => ({ id: user.id, username: user.username, email: user.email, roleId: user.roleId, roleName: user.role.name as AppRoleNameType, avatar: user.avatar || undefined, lastLogin: user.lastLogin?.toISOString() || undefined, permissions: user.role.permissions.map(p => p.id as AppPermissionIdType) }));
    return { data: appUsers, totalCount, currentPage: page, totalPages, pageSize };
  } catch (error) { logger.error(`Error in ${actionName}`, error as Error, undefined, actionName); throw new AppError("获取用户数据时发生服务器错误。", 500, "GET_USERS_FAILED", "无法加载用户数据。"); }
}

export async function createUserAction(data: Omit<AppUser, "id" | "lastLogin" | "roleName"> & { password: string, avatar?: string, phone?: string }, performingUserId?: string): Promise<ActionResponse<FetchedUserDetails>> {
  const actionName = 'createUserAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    if (!data.password) throw new ValidationError("新用户需要密码。", "password");
    if (await prisma.user.findUnique({ where: { email: data.email } })) throw new ResourceError(`邮箱 ${data.email} 已被使用。`, 'EMAIL_ALREADY_EXISTS', undefined, 'email');
    if (await prisma.user.findUnique({ where: { username: data.username } })) throw new ResourceError(`用户名 ${data.username} 已被使用。`, 'USERNAME_ALREADY_EXISTS', undefined, 'username');
    if (!(await prisma.role.findUnique({ where: { id: data.roleId } }))) throw new NotFoundError(`角色 ID: ${data.roleId}`, undefined, 'roleId');
    
    const encryptedPassword = encrypt(data.password);

    const newUser = await prisma.user.create({ data: { username: data.username, email: data.email, password: encryptedPassword, phone: data.phone || null, roleId: data.roleId, avatar: data.avatar || '/images/avatars/default_avatar.png' }, include: { role: { include: { permissions: true } } } });
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'create_user', details: `创建了用户 ${newUser.username}` } });
    revalidatePath("/users");
    const fetchedUser: FetchedUserDetails = { id: newUser.id, username: newUser.username, email: newUser.email, roleId: newUser.roleId, roleName: newUser.role.name as AppRoleNameType, avatar: newUser.avatar || undefined, permissions: newUser.role.permissions.map(p => p.id as AppPermissionIdType), lastLogin: newUser.lastLogin?.toISOString() || undefined };
    return { success: true, data: fetchedUser };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

export async function updateUserAction(id: string, data: Partial<Omit<AppUser, "id" | "roleName" | "phone">> & { password?: string, phone?: string }, performingUserId?: string): Promise<ActionResponse<FetchedUserDetails>> {
  const actionName = 'updateUserAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    const userToUpdate = await prisma.user.findUnique({ where: { id } });
    if (!userToUpdate) throw new NotFoundError(`用户 ID: ${id}`);
    const updateData: Prisma.UserUpdateInput = {};
    if (data.username && data.username !== userToUpdate.username) { if (await prisma.user.findFirst({ where: { username: data.username, NOT: { id } } })) throw new ResourceError(`用户名 ${data.username} 已被使用。`, 'USERNAME_ALREADY_EXISTS', undefined, 'username'); updateData.username = data.username; }
    if (data.email && data.email !== userToUpdate.email) { if (await prisma.user.findFirst({ where: { email: data.email, NOT: { id } } })) throw new ResourceError(`邮箱 ${data.email} 已被使用。`, 'EMAIL_ALREADY_EXISTS', undefined, 'email'); updateData.email = data.email; }
    if (data.roleId && data.roleId !== userToUpdate.roleId) { if (!(await prisma.role.findUnique({ where: { id: data.roleId } }))) throw new NotFoundError(`角色 ID: ${data.roleId}`, undefined, 'roleId'); updateData.roleId = data.roleId; }
    if (data.password) updateData.password = encrypt(data.password);
    if (data.hasOwnProperty('phone')) updateData.phone = data.phone || null; 
    if (data.avatar) updateData.avatar = data.avatar;
    if (Object.keys(updateData).length === 0) { const currentUserDetails = await fetchCurrentUserDetailsAction(id); if(!currentUserDetails) throw new NotFoundError(`用户 ID: ${id}`); return { success: true, data: currentUserDetails }; }
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
        if (!currentPassword || !newPassword) throw new ValidationError("当前密码和新密码都是必需的。", "currentPassword");
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
    if (!userToDelete) throw new NotFoundError(`用户 ID: ${id}`);
    if (userToDelete.id === performingUserId) throw new ResourceError("无法删除当前登录的用户。", "CANNOT_DELETE_SELF");
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
    const appRoles: AppRole[] = rolesFromDb.map(role => ({ id: role.id, name: role.name as AppRoleNameType, description: role.description || undefined, permissions: role.permissions.map(p => p.id as AppPermissionIdType), userCount: role._count.users }));
    return { data: appRoles, totalCount, currentPage: page, totalPages, pageSize };
  } catch (error) { logger.error(`Error in ${actionName}`, error as Error, undefined, actionName); throw new AppError("获取角色数据时发生服务器错误。", 500, "GET_ROLES_FAILED", "无法加载角色数据。"); }
}

export async function updateRoleAction(id: string, data: Partial<Omit<AppRole, "id" | "userCount" | "name">> & { permissions?: AppPermissionIdType[] }, performingUserId?: string): Promise<ActionResponse<AppRole>> {
  const actionName = 'updateRoleAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    const roleToUpdate = await prisma.role.findUnique({ where: { id } });
    if (!roleToUpdate) throw new NotFoundError(`角色 ID: ${id}`);
    const updatePayload: Prisma.RoleUpdateInput = {};
    if (data.description !== undefined) updatePayload.description = data.description || null;
    if (data.permissions) {
        if (roleToUpdate.name === 'Administrator') throw new ResourceError("不能修改 Administrator 角色的权限。", "ADMIN_ROLE_PERMISSIONS_PROTECTED");
        const validPermissions = await prisma.permission.findMany({ where: { id: { in: data.permissions } } });
        if (validPermissions.length !== data.permissions.length) throw new ValidationError("一个或多个提供的权限 ID 无效。", "permissions");
        updatePayload.permissions = { set: data.permissions.map(pid => ({ id: pid })) };
    }
    if (Object.keys(updatePayload).length === 0) { const currentRoleData = await prisma.role.findUnique({ where: { id }, include: {permissions: true, _count: {select: {users: true}}} }); if (!currentRoleData) throw new NotFoundError(`角色 ID: ${id}`); const appRole : AppRole = { id: currentRoleData.id, name: currentRoleData.name as AppRoleNameType, description: currentRoleData.description || undefined, permissions: currentRoleData.permissions.map(p=>p.id as AppPermissionIdType), userCount: currentRoleData._count.users }; return { success: true, data: appRole }; }
    const updatedRole = await prisma.role.update({ where: { id }, data: updatePayload, include: { permissions: true, _count: {select: {users: true}} } });
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'update_role', details: `更新了角色 ${updatedRole.name}` } });
    revalidatePath("/roles");
    const appRole : AppRole = { id: updatedRole.id, name: updatedRole.name as AppRoleNameType, description: updatedRole.description || undefined, permissions: updatedRole.permissions.map(p=>p.id as AppPermissionIdType), userCount: updatedRole._count.users };
    return { success: true, data: appRole };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

export async function getAllPermissionsAction(): Promise<AppPermission[]> { return seedPermissionsData.map(p => ({ ...p, description: p.description || undefined })); } 

export async function getAuditLogsAction(params?: FetchParams): Promise<PaginatedResponse<AppAuditLog>> {
  const actionName = 'getAuditLogsAction';
  try {
    const page = params?.page || 1; const pageSize = params?.pageSize || DEFAULT_AUDIT_LOG_COUNT; const skip = (page - 1) * pageSize;
    const totalCount = await prisma.auditLog.count(); const totalPages = Math.ceil(totalCount / pageSize);
    const logsFromDb = await prisma.auditLog.findMany({ orderBy: { timestamp: 'desc' }, skip, take: pageSize });
    const appLogs: AppAuditLog[] = logsFromDb.map(log => ({ id: log.id, userId: log.userId || undefined, username: log.username || '系统', action: log.action, timestamp: log.timestamp.toISOString(), details: log.details || undefined }));
    return { data: appLogs, totalCount, currentPage: page, totalPages, pageSize };
  } catch (error) { logger.error(`Error in ${actionName}`, error as Error, undefined, actionName); throw new AppError("获取审计日志数据时发生服务器错误。", 500, "GET_AUDIT_LOGS_FAILED", "无法加载审计日志数据。"); }
}

export async function deleteAuditLogAction(id: string, performingUserId?: string): Promise<ActionResponse> {
  const actionName = 'deleteAuditLogAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    if (!(await prisma.auditLog.findUnique({ where: { id } }))) throw new NotFoundError(`审计日志 ID: ${id}`);
    await prisma.auditLog.delete({ where: { id } });
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'delete_audit_log_entry', details: `删除了审计日志条目 ID ${id}` } });
    revalidatePath("/audit-logs");
    return { success: true };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

export async function batchDeleteAuditLogsAction(ids: string[], performingUserId?: string): Promise<BatchDeleteResult> {
  const actionName = 'batchDeleteAuditLogsAction';
  const auditUser = await getAuditUserInfo(performingUserId);
  let successCount = 0; const failureDetails: BatchOperationFailure[] = [];
  for (const id of ids) {
    try {
      if (!(await prisma.auditLog.findUnique({ where: { id } }))) throw new NotFoundError(`审计日志 ID: ${id}`);
      await prisma.auditLog.delete({ where: { id } }); successCount++;
    } catch (error: unknown) { const errRes = createActionErrorResponse(error, `${actionName}_single`); failureDetails.push({ id, itemIdentifier: `ID ${id}`, error: errRes.userMessage }); }
  }
  if (successCount > 0) { await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'batch_delete_audit_log', details: `批量删除了 ${successCount} 条审计日志。失败 ${failureDetails.length} 条。` } }); revalidatePath("/audit-logs"); }
  return { successCount, failureCount: failureDetails.length, failureDetails };
}

export async function getSubnetsAction(params?: FetchParams): Promise<PaginatedResponse<AppSubnet>> {
  const actionName = 'getSubnetsAction';
  try {
    const page = params?.page || 1; const pageSize = params?.pageSize || DEFAULT_PAGE_SIZE; const skip = (page - 1) * pageSize;
    const whereClause = {}; const totalCount = await prisma.subnet.count({ where: whereClause }); const totalPages = Math.ceil(totalCount / pageSize);
    const subnetsFromDb = params?.page && params?.pageSize ? await prisma.subnet.findMany({ where: whereClause, orderBy: { cidr: 'asc' }, skip, take: pageSize }) : await prisma.subnet.findMany({ where: whereClause, orderBy: { cidr: 'asc' } });
    const appSubnets: AppSubnet[] = await Promise.all(subnetsFromDb.map(async (subnet) => {
      if (!subnet.cidr || typeof subnet.cidr !== 'string' || subnet.cidr.trim() === "") { logger.warn(`[${actionName}] Subnet ID ${subnet.id} invalid CIDR.`, undefined, { subnetId: subnet.id, cidrFromDb: subnet.cidr }); return { ...subnet, cidr: subnet.cidr || "Invalid/Missing CIDR", networkAddress: subnet.networkAddress || "N/A", subnetMask: subnet.subnetMask || "N/A", ipRange: subnet.ipRange || undefined, name: subnet.name || undefined, dhcpEnabled: subnet.dhcpEnabled ?? false, vlanId: subnet.vlanId || undefined, description: subnet.description || undefined, utilization: 0 }; }
      const subnetProperties = getSubnetPropertiesFromCidr(subnet.cidr); let utilization = 0; let networkAddress = subnet.networkAddress; let subnetMask = subnet.subnetMask; let ipRange: string | null = subnet.ipRange;
      if (subnetProperties && typeof subnetProperties.prefix === 'number') { const totalUsableIps = getUsableIpCount(subnetProperties.prefix); const allocatedIpsCount = await prisma.iPAddress.count({ where: { subnetId: subnet.id, status: "allocated" } }); if (totalUsableIps > 0) utilization = Math.round((allocatedIpsCount / totalUsableIps) * 100); networkAddress = subnetProperties.networkAddress; subnetMask = subnetProperties.subnetMask; ipRange = subnetProperties.ipRange !== undefined ? subnetProperties.ipRange : null; }
      else { logger.warn(`[${actionName}] Could not parse CIDR for subnet ID ${subnet.id}.`, undefined, { subnetId: subnet.id, cidr: subnet.cidr }); networkAddress = subnet.networkAddress || "N/A"; subnetMask = subnet.subnetMask || "N/A"; ipRange = subnet.ipRange || null; }
      return { ...subnet, networkAddress, subnetMask, ipRange: ipRange || undefined, name: subnet.name || undefined, dhcpEnabled: subnet.dhcpEnabled ?? false, vlanId: subnet.vlanId || undefined, description: subnet.description || undefined, utilization };
    }));
    return { data: appSubnets, totalCount: params?.page && params?.pageSize ? totalCount : appSubnets.length, currentPage: page, totalPages: params?.page && params?.pageSize ? totalPages : 1, pageSize };
  } catch (error: unknown) { logger.error(`Error in ${actionName}`, error as Error, undefined, actionName); if (error instanceof AppError) throw error; throw new AppError("获取子网数据时发生服务器错误。", 500, "GET_SUBNETS_FAILED", "无法加载子网数据。"); }
}

export interface CreateSubnetData { cidr: string; name?: string | null | undefined; dhcpEnabled?: boolean | null | undefined; vlanId?: string | null | undefined; description?: string | null | undefined; }
export async function createSubnetAction(data: CreateSubnetData, performingUserId?: string): Promise<ActionResponse<AppSubnet>> {
  const actionName = 'createSubnetAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId); validateCidrInput(data.cidr, 'cidr');
    const newSubnetProperties = getSubnetPropertiesFromCidr(data.cidr); if (!newSubnetProperties) throw new AppError('Failed to parse CIDR properties.', 500, 'CIDR_PARSE_UNEXPECTED_ERROR');
    const canonicalCidrToStore = data.cidr; if (await prisma.subnet.findUnique({ where: { cidr: canonicalCidrToStore } })) throw new ResourceError(`子网 ${canonicalCidrToStore} 已存在。`, 'SUBNET_ALREADY_EXISTS', undefined, 'cidr');
    const allExistingSubnets = await prisma.subnet.findMany();
    for (const existingSub of allExistingSubnets) { if (doSubnetsOverlap(newSubnetProperties, getSubnetPropertiesFromCidr(existingSub.cidr)!)) throw new ResourceError(`子网 ${canonicalCidrToStore} 与现有子网 ${existingSub.cidr} 重叠。`, 'SUBNET_OVERLAP_ERROR', undefined, 'cidr'); }
    const createPayload: Prisma.SubnetCreateInput = { cidr: canonicalCidrToStore, networkAddress: newSubnetProperties.networkAddress, subnetMask: newSubnetProperties.subnetMask, ipRange: newSubnetProperties.ipRange || null, name: (data.name === undefined || data.name === "") ? null : data.name, dhcpEnabled: data.dhcpEnabled ?? false, description: (data.description === undefined || data.description === "") ? null : data.description, };
    if (data.vlanId) { if (!(await prisma.vLAN.findUnique({ where: { id: data.vlanId } }))) throw new NotFoundError(`VLAN ID: ${data.vlanId}`, undefined, 'vlanId'); createPayload.vlan = { connect: { id: data.vlanId } }; }
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
    const subnetToUpdate = await prisma.subnet.findUnique({ where: { id } }); if (!subnetToUpdate) throw new NotFoundError(`子网 ID: ${id}`);
    const updateData: Prisma.SubnetUpdateInput = {}; const originalCidrForLog = subnetToUpdate.cidr; let newCanonicalCidrForLog = subnetToUpdate.cidr;
    if (data.cidr && data.cidr !== subnetToUpdate.cidr) {
      validateCidrInput(data.cidr, 'cidr'); const newSubnetProperties = getSubnetPropertiesFromCidr(data.cidr); if (!newSubnetProperties) throw new AppError('Failed to parse new CIDR properties.', 500, 'CIDR_PARSE_UNEXPECTED_ERROR');
      newCanonicalCidrForLog = data.cidr; if (await prisma.subnet.findFirst({ where: { cidr: newCanonicalCidrForLog, NOT: { id } } })) throw new ResourceError(`子网 ${newCanonicalCidrForLog} 已存在。`, 'SUBNET_ALREADY_EXISTS', undefined, 'cidr');
      const otherExistingSubnets = await prisma.subnet.findMany({ where: { NOT: { id } } });
      for (const existingSub of otherExistingSubnets) { if (doSubnetsOverlap(newSubnetProperties, getSubnetPropertiesFromCidr(existingSub.cidr)!)) throw new ResourceError(`更新后的子网 ${newCanonicalCidrForLog} 与现有子网 ${existingSub.cidr} 重叠。`, 'SUBNET_OVERLAP_ERROR', undefined, 'cidr'); }
      updateData.cidr = newCanonicalCidrForLog; updateData.networkAddress = newSubnetProperties.networkAddress; updateData.subnetMask = newSubnetProperties.subnetMask; updateData.ipRange = newSubnetProperties.ipRange || null;
      const allocatedIpsInSubnet = await prisma.iPAddress.findMany({ where: { subnetId: id, status: "allocated" } }); const ipsToDisassociateDetails: string[] = [];
      for (const ip of allocatedIpsInSubnet) { if (!isIpInCidrRange(ip.ipAddress, newSubnetProperties)) { await prisma.iPAddress.update({ where: { id: ip.id }, data: { status: "free", allocatedTo: null, subnet: { disconnect: true }, directVlan: { disconnect: true } } }); ipsToDisassociateDetails.push(`${ip.ipAddress} (原状态: ${ip.status})`); } }
      if (ipsToDisassociateDetails.length > 0) await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'auto_handle_ip_on_subnet_resize', details: `子网 ${originalCidrForLog} 调整大小为 ${newCanonicalCidrForLog}。已解除关联的 IP：${ipsToDisassociateDetails.join('; ')}。` } });
    }
    if (data.hasOwnProperty('name')) updateData.name = (data.name === undefined || data.name === "") ? null : data.name;
    if (data.hasOwnProperty('dhcpEnabled')) updateData.dhcpEnabled = data.dhcpEnabled ?? false;
    if (data.hasOwnProperty('vlanId')) { const newVlanId = data.vlanId; if (newVlanId === null) { updateData.vlan = { disconnect: true }; } else if (newVlanId) { if (!(await prisma.vLAN.findUnique({where: {id: newVlanId}}))) throw new NotFoundError(`VLAN ID: ${newVlanId}`, undefined, 'vlanId'); updateData.vlan = { connect: { id: newVlanId } }; } else { updateData.vlan = { disconnect: true };} }
    if (data.hasOwnProperty('description')) updateData.description = (data.description === undefined || data.description === "") ? null : data.description;
    if (Object.keys(updateData).length === 0) { const currentAppSubnet: AppSubnet = { ...subnetToUpdate, name: subnetToUpdate.name || undefined, dhcpEnabled: subnetToUpdate.dhcpEnabled ?? false, vlanId: subnetToUpdate.vlanId || undefined, description: subnetToUpdate.description || undefined, ipRange: subnetToUpdate.ipRange || undefined, utilization: await calculateSubnetUtilization(id) }; return { success: true, data: currentAppSubnet }; }
    const updatedSubnetPrisma = await prisma.subnet.update({ where: { id }, data: updateData, include: { vlan: true } });
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'update_subnet', details: `更新了子网 ID ${id} (旧 CIDR: ${originalCidrForLog}, 新 CIDR: ${newCanonicalCidrForLog})` } });
    revalidatePath("/subnets"); revalidatePath("/dashboard"); revalidatePath("/ip-addresses"); revalidatePath("/query");
    const utilization = await calculateSubnetUtilization(updatedSubnetPrisma.id);
    const appSubnet: AppSubnet = { ...updatedSubnetPrisma, name: updatedSubnetPrisma.name || undefined, dhcpEnabled: updatedSubnetPrisma.dhcpEnabled ?? false, vlanId: updatedSubnetPrisma.vlanId || undefined, description: updatedSubnetPrisma.description || undefined, ipRange: updatedSubnetPrisma.ipRange || undefined, utilization };
    return { success: true, data: appSubnet };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

async function calculateSubnetUtilization(subnetId: string): Promise<number> {
  const subnet = await prisma.subnet.findUnique({ where: { id: subnetId } }); if (!subnet || !subnet.cidr) return 0;
  const subnetProperties = getSubnetPropertiesFromCidr(subnet.cidr); if (!subnetProperties || typeof subnetProperties.prefix !== 'number') return 0;
  const totalUsableIps = getUsableIpCount(subnetProperties.prefix); if (totalUsableIps === 0) return 0;
  const allocatedIpsCount = await prisma.iPAddress.count({ where: { subnetId: subnetId, status: "allocated" } });
  return Math.round((allocatedIpsCount / totalUsableIps) * 100);
}

export async function deleteSubnetAction(id: string, performingUserId?: string): Promise<ActionResponse> {
  const actionName = 'deleteSubnetAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    const subnetToDelete = await prisma.subnet.findUnique({ where: { id }, include: { vlan: true } }); if (!subnetToDelete) throw new NotFoundError(`子网 ID: ${id}`);
    if (subnetToDelete.vlanId && subnetToDelete.vlanId.trim() !== "") { const vlanMsg = subnetToDelete.vlan ? `VLAN ${subnetToDelete.vlan.vlanNumber}` : `VLAN (ID: ${subnetToDelete.vlanId})`; throw new ResourceError(`子网 ${subnetToDelete.cidr} 已关联到 ${vlanMsg}。`, 'SUBNET_HAS_VLAN_ASSOCIATION'); }
    if (await prisma.iPAddress.count({ where: { subnetId: id, status: 'allocated' } }) > 0) throw new ResourceError(`子网 ${subnetToDelete.cidr} 中仍有已分配的 IP。`, 'SUBNET_HAS_ALLOCATED_IPS');
    if (await prisma.iPAddress.count({ where: { subnetId: id, status: 'reserved' } }) > 0) throw new ResourceError(`子网 ${subnetToDelete.cidr} 中仍有预留的 IP。`, 'SUBNET_HAS_RESERVED_IPS');
    for (const ip of await prisma.iPAddress.findMany({ where: { subnetId: id, status: 'free' } })) { await prisma.iPAddress.update({ where: { id: ip.id }, data: { subnet: { disconnect: true }, directVlan: { disconnect: true } } }); await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'auto_disassociate_ip_on_subnet_delete', details: `IP ${ip.ipAddress} 已从子网 ${subnetToDelete.cidr} 解除关联。` } }); }
    await prisma.subnet.delete({ where: { id } });
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'delete_subnet', details: `删除了子网 ${subnetToDelete.cidr}` } });
    revalidatePath("/subnets"); revalidatePath("/ip-addresses"); revalidatePath("/dashboard"); revalidatePath("/query");
    return { success: true };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

export async function batchDeleteSubnetsAction(ids: string[], performingUserId?: string): Promise<BatchDeleteResult> {
  const actionName = 'batchDeleteSubnetsAction';
  const auditUser = await getAuditUserInfo(performingUserId); let successCount = 0; const failureDetails: BatchOperationFailure[] = []; const deletedSubnetCidrs: string[] = [];
  for (const id of ids) {
    try {
      const subnetToDelete = await prisma.subnet.findUnique({ where: { id }, include: { vlan: true } }); if (!subnetToDelete) { failureDetails.push({ id, itemIdentifier: `ID ${id}`, error: '子网未找到。' }); continue; }
      if (subnetToDelete.vlanId && subnetToDelete.vlanId.trim() !== "") { const vlanMsg = subnetToDelete.vlan ? `VLAN ${subnetToDelete.vlan.vlanNumber}` : `VLAN (ID: ${subnetToDelete.vlanId})`; throw new ResourceError(`子网 ${subnetToDelete.cidr} 已关联到 ${vlanMsg}。`, 'SUBNET_HAS_VLAN_ASSOCIATION_BATCH'); }
      if (await prisma.iPAddress.count({ where: { subnetId: id, status: 'allocated' } }) > 0) throw new ResourceError(`子网 ${subnetToDelete.cidr} 中仍有已分配的 IP。`, 'SUBNET_HAS_ALLOCATED_IPS_BATCH');
      if (await prisma.iPAddress.count({ where: { subnetId: id, status: 'reserved' } }) > 0) throw new ResourceError(`子网 ${subnetToDelete.cidr} 中仍有预留的 IP。`, 'SUBNET_HAS_RESERVED_IPS_BATCH');
      for (const ip of await prisma.iPAddress.findMany({ where: { subnetId: id, status: 'free' } })) { await prisma.iPAddress.update({ where: { id: ip.id }, data: { subnet: { disconnect: true }, directVlan: { disconnect: true } } }); }
      await prisma.subnet.delete({ where: { id } }); deletedSubnetCidrs.push(subnetToDelete.cidr); successCount++;
    } catch (error: unknown) { const errRes = createActionErrorResponse(error, `${actionName}_single`); failureDetails.push({ id, itemIdentifier: (await prisma.subnet.findUnique({ where: { id } }))?.cidr || `ID ${id}`, error: errRes.userMessage }); }
  }
  if (deletedSubnetCidrs.length > 0) { await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'batch_delete_subnet', details: `批量删除了 ${deletedSubnetCidrs.length} 个子网: ${deletedSubnetCidrs.join(', ')}。失败 ${failureDetails.length} 个。` } }); revalidatePath("/subnets"); revalidatePath("/ip-addresses"); revalidatePath("/dashboard"); revalidatePath("/query"); }
  return { successCount, failureCount: failureDetails.length, failureDetails };
}

export async function getVLANsAction(params?: FetchParams): Promise<PaginatedResponse<AppVLAN>> {
  const page = params?.page || 1; const pageSize = params?.pageSize || DEFAULT_PAGE_SIZE; const skip = (page - 1) * pageSize; const whereClause = {};
  const totalCount = await prisma.vLAN.count({ where: whereClause }); const totalPages = Math.ceil(totalCount / pageSize);
  const vlansFromDb = params?.page && params?.pageSize ? await prisma.vLAN.findMany({ where: whereClause, orderBy: { vlanNumber: 'asc' }, skip, take: pageSize }) : await prisma.vLAN.findMany({ where: whereClause, orderBy: { vlanNumber: 'asc' } });
  const appVlans: AppVLAN[] = await Promise.all(vlansFromDb.map(async (vlan) => ({ ...vlan, name: vlan.name || undefined, description: vlan.description || undefined, subnetCount: (await prisma.subnet.count({ where: { vlanId: vlan.id } })) + (await prisma.iPAddress.count({ where: { directVlanId: vlan.id } })) })));
  return { data: appVlans, totalCount: params?.page && params?.pageSize ? totalCount : appVlans.length, currentPage: page, totalPages: params?.page && params?.pageSize ? totalPages : 1, pageSize };
}

export async function createVLANAction(data: Omit<AppVLAN, "id" | "subnetCount">, performingUserId?: string): Promise<ActionResponse<AppVLAN>> {
  const actionName = 'createVLANAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    if (isNaN(data.vlanNumber) || data.vlanNumber < 1 || data.vlanNumber > 4094) throw new ValidationError("VLAN 号码必须是 1 到 4094 之间的整数。", 'vlanNumber', data.vlanNumber);
    if (await prisma.vLAN.findUnique({ where: { vlanNumber: data.vlanNumber } })) throw new ResourceError(`VLAN ${data.vlanNumber} 已存在。`, 'VLAN_EXISTS', undefined, 'vlanNumber');
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
  for (const vlanInput of vlansToCreateInput) {
    try {
      if (isNaN(vlanInput.vlanNumber) || vlanInput.vlanNumber < 1 || vlanInput.vlanNumber > 4094) throw new ValidationError("VLAN 号码必须是 1 到 4094 之间的整数。", 'vlanNumber', vlanInput.vlanNumber);
      if (await prisma.vLAN.findUnique({ where: { vlanNumber: vlanInput.vlanNumber } })) throw new ResourceError(`VLAN ${vlanInput.vlanNumber} 已存在。`, 'VLAN_EXISTS', undefined, 'startVlanNumber');
      const newVlan = await prisma.vLAN.create({ data: { vlanNumber: vlanInput.vlanNumber, name: vlanInput.name || null, description: vlanInput.description || null } });
      createdVlanSummaries.push(`${newVlan.vlanNumber}${newVlan.name ? ` (${newVlan.name})` : ''}`); successCount++;
    } catch (e: unknown) { const errRes = createActionErrorResponse(e, 'batchCreateVLANsAction_single'); failureDetails.push({ vlanNumberAttempted: vlanInput.vlanNumber, error: errRes.userMessage }); }
  }
  if (createdVlanSummaries.length > 0) await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'batch_create_vlan', details: `批量创建了 ${createdVlanSummaries.length} 个 VLAN：${createdVlanSummaries.join(', ')}。失败：${failureDetails.length} 个。` } });
  if (successCount > 0) { revalidatePath("/vlans"); revalidatePath("/query"); }
  return { successCount, failureDetails };
}

export async function updateVLANAction(id: string, data: Partial<Omit<AppVLAN, "id" | "subnetCount">>, performingUserId?: string): Promise<ActionResponse<AppVLAN>> {
  const actionName = 'updateVLANAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    const vlanToUpdate = await prisma.vLAN.findUnique({ where: { id } }); if (!vlanToUpdate) throw new NotFoundError(`VLAN ID: ${id}`);
    const updatePayload: Prisma.VLANUpdateInput = {};
    if (data.hasOwnProperty('vlanNumber') && data.vlanNumber !== undefined) { if (isNaN(data.vlanNumber) || data.vlanNumber < 1 || data.vlanNumber > 4094) throw new ValidationError("VLAN 号码必须是 1 到 4094 之间的整数。", 'vlanNumber', data.vlanNumber); if (data.vlanNumber !== vlanToUpdate.vlanNumber) { const existingVLAN = await prisma.vLAN.findUnique({ where: { vlanNumber: data.vlanNumber } }); if (existingVLAN && existingVLAN.id !== id) throw new ResourceError(`已存在另一个 VLAN 号码为 ${data.vlanNumber} 的 VLAN。`, 'VLAN_EXISTS', undefined, 'vlanNumber'); } updatePayload.vlanNumber = data.vlanNumber; }
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
    const vlanToDelete = await prisma.vLAN.findUnique({ where: { id } }); if (!vlanToDelete) throw new NotFoundError(`VLAN ID: ${id}`);
    if (await prisma.subnet.count({ where: { vlanId: id } }) > 0) throw new ResourceError(`无法删除 VLAN ${vlanToDelete.vlanNumber}。它已分配给子网。`, 'VLAN_IN_USE_SUBNET');
    if (await prisma.iPAddress.count({ where: { directVlanId: id } }) > 0) throw new ResourceError(`无法删除 VLAN ${vlanToDelete.vlanNumber}。它已直接分配给 IP 地址。`, 'VLAN_IN_USE_IP');
    await prisma.vLAN.delete({ where: { id } });
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'delete_vlan', details: `删除了 VLAN ${vlanToDelete.vlanNumber} (${vlanToDelete.name || '无名称'})` } });
    revalidatePath("/vlans"); revalidatePath("/subnets"); revalidatePath("/ip-addresses"); revalidatePath("/query");
    return { success: true };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

export async function batchDeleteVLANsAction(ids: string[], performingUserId?: string): Promise<BatchDeleteResult> {
  const actionName = 'batchDeleteVLANsAction';
  const auditUser = await getAuditUserInfo(performingUserId); let successCount = 0; const failureDetails: BatchOperationFailure[] = []; const deletedVlanSummaries: string[] = [];
  for (const id of ids) {
    try {
      const vlanToDelete = await prisma.vLAN.findUnique({ where: { id } }); if (!vlanToDelete) { failureDetails.push({ id, itemIdentifier: `ID ${id}`, error: 'VLAN 未找到。' }); continue; }
      if (await prisma.subnet.count({ where: { vlanId: id } }) > 0) throw new ResourceError(`VLAN ${vlanToDelete.vlanNumber} 已分配给子网。`, 'VLAN_IN_USE_SUBNET_BATCH');
      if (await prisma.iPAddress.count({ where: { directVlanId: id } }) > 0) throw new ResourceError(`VLAN ${vlanToDelete.vlanNumber} 已直接分配给 IP 地址。`, 'VLAN_IN_USE_IP_BATCH');
      await prisma.vLAN.delete({ where: { id } }); deletedVlanSummaries.push(`${vlanToDelete.vlanNumber}${vlanToDelete.name ? ` (${vlanToDelete.name})` : ''}`); successCount++;
    } catch (error: unknown) { const errRes = createActionErrorResponse(error, `${actionName}_single`); failureDetails.push({ id, itemIdentifier: (await prisma.vLAN.findUnique({ where: { id } }))?.vlanNumber.toString() || `ID ${id}`, error: errRes.userMessage }); }
  }
  if (deletedVlanSummaries.length > 0) { await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'batch_delete_vlan', details: `批量删除了 ${deletedVlanSummaries.length} 个 VLAN: ${deletedVlanSummaries.join(', ')}。失败 ${failureDetails.length} 个。` } }); revalidatePath("/vlans"); revalidatePath("/subnets"); revalidatePath("/ip-addresses"); revalidatePath("/query"); }
  return { successCount, failureCount: failureDetails.length, failureDetails };
}

type PrismaIPAddressWithRelations = Prisma.IPAddressGetPayload<{ include: { subnet: { include: { vlan: true } }; directVlan: true; }; }>;
export type AppIPAddressWithRelations = AppIPAddress & {
  subnet?: { id: string; cidr: string; name?: string; networkAddress: string; vlan?: { vlanNumber: number; name?: string; } | null } | null;
  directVlan?: { vlanNumber: number; name?: string; } | null;
};

export async function getIPAddressesAction(params?: FetchParams): Promise<PaginatedResponse<AppIPAddressWithRelations>> {
  const page = params?.page || 1; const pageSize = params?.pageSize || DEFAULT_PAGE_SIZE; const skip = (page - 1) * pageSize;
  const whereClause: Prisma.IPAddressWhereInput = {};
  if (params?.subnetId) whereClause.subnetId = params.subnetId;
  if (params?.status && params.status !== 'all') whereClause.status = params.status as AppIPAddressStatusType;
  const includeClause = { subnet: { include: { vlan: { select: { vlanNumber: true, name: true } } } }, directVlan: { select: { vlanNumber: true, name: true } } };
  let paginatedDbItems: PrismaIPAddressWithRelations[]; let finalTotalCount: number;
  if (params?.subnetId) {
    const allIpsInSubnetUnsorted = await prisma.iPAddress.findMany({ where: whereClause, include: includeClause }) as PrismaIPAddressWithRelations[];
    const allIpsInSubnetSorted = allIpsInSubnetUnsorted.sort((a, b) => compareIpStrings(a.ipAddress, b.ipAddress));
    finalTotalCount = allIpsInSubnetSorted.length; paginatedDbItems = allIpsInSubnetSorted.slice(skip, skip + pageSize);
  } else {
    const orderByClause: Prisma.IPAddressOrderByWithRelationInput[] = [ { subnet: { networkAddress: 'asc' } }, { ipAddress: 'asc' } ];
    if (params?.page && params?.pageSize) { finalTotalCount = await prisma.iPAddress.count({ where: whereClause }); paginatedDbItems = await prisma.iPAddress.findMany({ where: whereClause, include: includeClause, orderBy: orderByClause, skip: skip, take: pageSize }) as PrismaIPAddressWithRelations[]; }
    else { const allIPs = await prisma.iPAddress.findMany({ where: whereClause, include: includeClause, orderBy: orderByClause }) as PrismaIPAddressWithRelations[]; finalTotalCount = allIPs.length; paginatedDbItems = allIPs; }
  }
  const totalPages = (pageSize > 0 && finalTotalCount > 0) ? Math.ceil(finalTotalCount / pageSize) : 1;
  const appIps: AppIPAddressWithRelations[] = paginatedDbItems.map(ip => ({
    id: ip.id, ipAddress: ip.ipAddress, status: ip.status as AppIPAddressStatusType, isGateway: ip.isGateway ?? false,
    allocatedTo: ip.allocatedTo || undefined, usageUnit: ip.usageUnit || undefined, contactPerson: ip.contactPerson || undefined, phone: ip.phone || undefined,
    description: ip.description || undefined, lastSeen: ip.lastSeen?.toISOString() || undefined,
    subnetId: ip.subnetId || undefined, directVlanId: ip.directVlanId || undefined,
    subnet: ip.subnet ? { id: ip.subnet.id, cidr: ip.subnet.cidr, name: ip.subnet.name || undefined, networkAddress: ip.subnet.networkAddress, vlan: ip.subnet.vlan ? { vlanNumber: ip.subnet.vlan.vlanNumber, name: ip.subnet.vlan.name || undefined } : null } : null,
    directVlan: ip.directVlan ? { vlanNumber: ip.directVlan.vlanNumber, name: ip.directVlan.name || undefined } : null,
    selectedOperatorName: ip.selectedOperatorName || undefined, selectedOperatorDevice: ip.selectedOperatorDevice || undefined, selectedAccessType: ip.selectedAccessType || undefined,
    selectedLocalDeviceName: ip.selectedLocalDeviceName || undefined, selectedDevicePort: ip.selectedDevicePort || undefined, selectedPaymentSource: ip.selectedPaymentSource || undefined,
  }));
  return { data: appIps, totalCount: finalTotalCount, currentPage: page, totalPages: totalPages, pageSize: pageSize };
}

export async function createIPAddressAction(data: Omit<AppIPAddress, "id">, performingUserId?: string): Promise<ActionResponse<AppIPAddress>> {
  const actionName = 'createIPAddressAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    if (data.ipAddress.split('.').map(Number).some(p => isNaN(p) || p < 0 || p > 255) || data.ipAddress.split('.').length !== 4) throw new ValidationError(`无效的 IP 地址格式: ${data.ipAddress}`, 'ipAddress', data.ipAddress);
    if (!data.subnetId && (data.status === 'allocated' || data.status === 'reserved')) throw new ValidationError("对于'已分配'或'预留'状态的 IP，必须选择一个子网。", 'subnetId');
    if (data.subnetId) {
      const targetSubnet = await prisma.subnet.findUnique({ where: { id: data.subnetId } }); if (!targetSubnet) throw new NotFoundError(`子网 ID: ${data.subnetId}`, undefined, 'subnetId');
      const parsedCidr = getSubnetPropertiesFromCidr(targetSubnet.cidr); if (!parsedCidr) throw new AppError(`目标子网 ${targetSubnet.cidr} 的 CIDR 无效。`, 500, 'SUBNET_CIDR_INVALID_FOR_IP_CHECK');
      if (!isIpInCidrRange(data.ipAddress, parsedCidr)) throw new ValidationError(`IP ${data.ipAddress} 不在子网 ${targetSubnet.cidr} 的范围内。`, 'ipAddress', data.ipAddress);
      if (await prisma.iPAddress.findFirst({ where: { ipAddress: data.ipAddress, subnetId: data.subnetId } })) throw new ResourceError(`IP ${data.ipAddress} 已存在于子网 ${targetSubnet.networkAddress} 中。`, 'IP_EXISTS_IN_SUBNET', undefined, 'ipAddress');
    } else { if (await prisma.iPAddress.findFirst({ where: { ipAddress: data.ipAddress, subnetId: null } })) throw new ResourceError(`IP ${data.ipAddress} 已存在于全局池中。`, 'IP_EXISTS_GLOBALLY', undefined, 'ipAddress'); }
    
    const createPayload: Prisma.IPAddressCreateInput = {
      ipAddress: data.ipAddress, status: data.status as string, isGateway: data.isGateway ?? false,
      allocatedTo: data.allocatedTo || null, usageUnit: data.usageUnit || null, 
      contactPerson: data.contactPerson || null, 
      phone: data.phone || null, 
      description: data.description || null, 
      lastSeen: data.lastSeen ? new Date(data.lastSeen) : new Date(),
      selectedOperatorName: data.selectedOperatorName || null, 
      selectedOperatorDevice: data.selectedOperatorDevice || null, 
      selectedAccessType: data.selectedAccessType || null,
      selectedLocalDeviceName: data.selectedLocalDeviceName || null, 
      selectedDevicePort: data.selectedDevicePort || null, 
      selectedPaymentSource: data.selectedPaymentSource || null,
    };

    if (data.subnetId) createPayload.subnet = { connect: { id: data.subnetId } };
    if (data.directVlanId) { if (!(await prisma.vLAN.findUnique({ where: { id: data.directVlanId } }))) throw new NotFoundError(`VLAN ID: ${data.directVlanId}`, undefined, 'directVlanId'); createPayload.directVlan = { connect: { id: data.directVlanId } }; }
    
    const newIP = await prisma.iPAddress.create({ data: createPayload });
    const subnetCidr = data.subnetId ? (await prisma.subnet.findUnique({where: {id: data.subnetId}}))?.cidr : null;
    const subnetInfo = subnetCidr ? ` 在子网 ${subnetCidr} 中` : ' 在全局池中';
    const vlanInfoLog = data.directVlanId ? ` 使用 VLAN ${(await prisma.vLAN.findUnique({where: {id:data.directVlanId}}))?.vlanNumber}`: '';
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'create_ip_address', details: `创建了 IP ${newIP.ipAddress}${subnetInfo}${vlanInfoLog}，状态为 ${data.status}。` } });
    revalidatePath("/ip-addresses"); revalidatePath("/dashboard"); revalidatePath("/subnets"); revalidatePath("/query");
    const appIp: AppIPAddress = { ...newIP, isGateway: newIP.isGateway ?? false, subnetId: newIP.subnetId || undefined, directVlanId: newIP.directVlanId || undefined, allocatedTo: newIP.allocatedTo || undefined, usageUnit: newIP.usageUnit || undefined, contactPerson: newIP.contactPerson || undefined, phone: newIP.phone || undefined, description: newIP.description || undefined, lastSeen: newIP.lastSeen?.toISOString(), status: newIP.status as AppIPAddressStatusType, selectedOperatorName: newIP.selectedOperatorName || undefined, selectedOperatorDevice: newIP.selectedOperatorDevice || undefined, selectedAccessType: newIP.selectedAccessType || undefined, selectedLocalDeviceName: newIP.selectedLocalDeviceName || undefined, selectedDevicePort: newIP.selectedDevicePort || undefined, selectedPaymentSource: newIP.selectedPaymentSource || undefined };
    return { success: true, data: appIp };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

export interface BatchIpCreationResult { successCount: number; failureDetails: Array<{ ipAttempted: string; error: string; }>; }
export async function batchCreateIPAddressesAction(payload: { startIp: string; endIp: string; subnetId: string; directVlanId?: string | null; description?: string; status: AppIPAddressStatusType; isGateway?: boolean; usageUnit?:string; contactPerson?:string; phone?:string; selectedOperatorName?: string; selectedOperatorDevice?: string; selectedAccessType?: string; selectedLocalDeviceName?: string; selectedDevicePort?: string; selectedPaymentSource?: string; }, performingUserId?: string): Promise<BatchIpCreationResult> {
  const auditUser = await getAuditUserInfo(performingUserId); let successCount = 0; const failureDetails: BatchIpCreationResult['failureDetails'] = []; const createdIpAddressesForAudit: string[] = [];
  const { startIp, endIp, subnetId, directVlanId, description, status, isGateway, usageUnit, contactPerson, phone, selectedOperatorName, selectedOperatorDevice, selectedAccessType, selectedLocalDeviceName, selectedDevicePort, selectedPaymentSource } = payload;
  try {
    const targetSubnet = await prisma.subnet.findUnique({ where: { id: subnetId } }); if (!targetSubnet) throw new NotFoundError(`子网 ID: ${subnetId}`, "未找到批量创建的目标子网。", 'subnetId');
    const parsedTargetSubnetCidr = getSubnetPropertiesFromCidr(targetSubnet.cidr); if (!parsedTargetSubnetCidr) throw new AppError(`目标子网 ${targetSubnet.cidr} 的 CIDR 配置无效。`, 500, 'SUBNET_CIDR_INVALID_FOR_BATCH');
    if (directVlanId && directVlanId.trim() !== "") { if (!(await prisma.vLAN.findUnique({ where: { id: directVlanId } }))) throw new NotFoundError(`VLAN ID: ${directVlanId}`, "为批量 IP 创建选择的 VLAN 不存在。", 'directVlanId'); }
    let currentIpNum = ipToNumber(startIp); let endIpNum = ipToNumber(endIp); if (currentIpNum > endIpNum) throw new ValidationError("起始 IP 必须小于或等于结束 IP。", 'endIp');
    for (; currentIpNum <= endIpNum; currentIpNum++) {
      const currentIpStr = numberToIp(currentIpNum);
      try {
        if (!isIpInCidrRange(currentIpStr, parsedTargetSubnetCidr)) throw new ValidationError(`IP ${currentIpStr} 不在子网 ${targetSubnet.cidr} 的范围内。`, 'startIp/endIp', currentIpStr);
        if (await prisma.iPAddress.findFirst({ where: { ipAddress: currentIpStr, subnetId: subnetId } })) throw new ResourceError(`IP ${currentIpStr} 已存在于子网 ${targetSubnet.networkAddress} 中。`, 'IP_EXISTS_IN_SUBNET', undefined, 'startIp/endIp');
        const createPayload: Prisma.IPAddressCreateInput = {
            ipAddress: currentIpStr, status: status, isGateway: isGateway ?? false, allocatedTo: status === 'allocated' ? (description || '批量分配') : null,
            usageUnit: usageUnit||null, contactPerson: contactPerson||null, 
            phone: phone || null, 
            description: description || null,
            lastSeen: new Date(),
            selectedOperatorName: selectedOperatorName || null, selectedOperatorDevice: selectedOperatorDevice || null, selectedAccessType: selectedAccessType || null,
            selectedLocalDeviceName: selectedLocalDeviceName || null, selectedDevicePort: selectedDevicePort || null, selectedPaymentSource: selectedPaymentSource || null,
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

export interface UpdateIPAddressData { ipAddress?: string; subnetId?: string | undefined; directVlanId?: string | null | undefined; status?: AppIPAddressStatusType; isGateway?: boolean | null | undefined; allocatedTo?: string | null | undefined; usageUnit?: string | null | undefined; contactPerson?: string | null | undefined; phone?: string | null | undefined; description?: string | null | undefined; lastSeen?: string | null | undefined; selectedOperatorName?: string | null | undefined; selectedOperatorDevice?: string | null | undefined; selectedAccessType?: string | null | undefined; selectedLocalDeviceName?: string | null | undefined; selectedDevicePort?: string | null | undefined; selectedPaymentSource?: string | null | undefined; }
export async function updateIPAddressAction(id: string, data: UpdateIPAddressData, performingUserId?: string): Promise<ActionResponse<AppIPAddress>> {
  const actionName = 'updateIPAddressAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    const ipToUpdate = await prisma.iPAddress.findUnique({ where: { id } }); if (!ipToUpdate) throw new NotFoundError(`IP 地址 ID: ${id}`);
    const updateData: Prisma.IPAddressUpdateInput = { lastSeen: new Date() }; 
    let finalIpAddress = ipToUpdate.ipAddress;
    if (data.hasOwnProperty('ipAddress') && data.ipAddress !== undefined && data.ipAddress !== ipToUpdate.ipAddress) { if (data.ipAddress.split('.').map(Number).some(p => isNaN(p) || p < 0 || p > 255) || data.ipAddress.split('.').length !== 4) throw new ValidationError(`无效的 IP 地址格式更新: ${data.ipAddress}`, 'ipAddress', data.ipAddress); updateData.ipAddress = data.ipAddress; finalIpAddress = data.ipAddress; }
    if (data.hasOwnProperty('status') && data.status !== undefined) updateData.status = data.status as string;
    if (data.hasOwnProperty('isGateway')) updateData.isGateway = data.isGateway ?? false;
    if (data.hasOwnProperty('allocatedTo')) updateData.allocatedTo = (data.allocatedTo === undefined || data.allocatedTo === "") ? null : data.allocatedTo;
    if (data.hasOwnProperty('usageUnit')) updateData.usageUnit = (data.usageUnit === undefined || data.usageUnit === "") ? null : data.usageUnit;
    if (data.hasOwnProperty('contactPerson')) updateData.contactPerson = (data.contactPerson === undefined || data.contactPerson === "") ? null : data.contactPerson;
    if (data.hasOwnProperty('phone')) updateData.phone = data.phone || null; 
    if (data.hasOwnProperty('description')) updateData.description = (data.description === undefined || data.description === "") ? null : data.description;
    if (data.hasOwnProperty('directVlanId')) { const vlanIdToSet = data.directVlanId; if (vlanIdToSet === null) updateData.directVlan = { disconnect: true }; else if (vlanIdToSet) { if (!(await prisma.vLAN.findUnique({where: {id: vlanIdToSet}}))) throw new NotFoundError(`VLAN ID: ${vlanIdToSet}`, undefined, 'directVlanId'); updateData.directVlan = { connect: { id: vlanIdToSet } }; } }
    if (data.hasOwnProperty('selectedOperatorName')) updateData.selectedOperatorName = data.selectedOperatorName || null;
    if (data.hasOwnProperty('selectedOperatorDevice')) updateData.selectedOperatorDevice = data.selectedOperatorDevice || null;
    if (data.hasOwnProperty('selectedAccessType')) updateData.selectedAccessType = data.selectedAccessType || null; 
    if (data.hasOwnProperty('selectedLocalDeviceName')) updateData.selectedLocalDeviceName = data.selectedLocalDeviceName || null;
    if (data.hasOwnProperty('selectedDevicePort')) updateData.selectedDevicePort = data.selectedDevicePort || null;
    if (data.hasOwnProperty('selectedPaymentSource')) updateData.selectedPaymentSource = data.selectedPaymentSource || null;

    const newSubnetId = data.hasOwnProperty('subnetId') ? (data.subnetId || undefined) : ipToUpdate.subnetId;
    const finalStatus = data.status ? data.status as string : ipToUpdate.status;
    if (data.hasOwnProperty('subnetId')) {
      if (newSubnetId) {
        const targetSubnet = await prisma.subnet.findUnique({ where: { id: newSubnetId } }); if (!targetSubnet) throw new NotFoundError(`子网 ID: ${newSubnetId}`, "目标子网不存在。", 'subnetId');
        const parsedCidr = getSubnetPropertiesFromCidr(targetSubnet.cidr); if (!parsedCidr) throw new AppError(`目标子网 ${targetSubnet.cidr} 的 CIDR 无效。`, 500, 'SUBNET_CIDR_INVALID_FOR_IP_CHECK');
        if (!isIpInCidrRange(finalIpAddress, parsedCidr)) throw new ValidationError(`IP ${finalIpAddress} 不在子网 ${targetSubnet.cidr} 的范围内。`, 'ipAddress/subnetId', finalIpAddress);
        if (finalIpAddress !== ipToUpdate.ipAddress || newSubnetId !== ipToUpdate.subnetId) { if (await prisma.iPAddress.findFirst({ where: { ipAddress: finalIpAddress, subnetId: newSubnetId, NOT: { id } } })) throw new ResourceError(`IP ${finalIpAddress} 已存在于子网 ${targetSubnet.networkAddress} 中。`, 'IP_EXISTS_IN_SUBNET', undefined, 'ipAddress'); }
        updateData.subnet = { connect: { id: newSubnetId } };
      } else {
        if (finalStatus === 'allocated' || finalStatus === 'reserved') throw new ValidationError("对于'已分配'或'预留'状态的 IP，必须选择一个子网。", 'subnetId', finalStatus);
        if (finalIpAddress !== ipToUpdate.ipAddress || ipToUpdate.subnetId !== null) { if (await prisma.iPAddress.findFirst({ where: { ipAddress: finalIpAddress, subnetId: null, NOT: { id } } })) throw new ResourceError(`IP ${finalIpAddress} 已存在于全局池中。`, 'IP_EXISTS_GLOBALLY', undefined, 'ipAddress'); }
        updateData.subnet = { disconnect: true };
      }
    } else if (newSubnetId && (finalIpAddress !== ipToUpdate.ipAddress)) {
      const currentSubnet = await prisma.subnet.findUnique({ where: { id: newSubnetId } }); if (!currentSubnet) throw new NotFoundError(`当前子网 ID: ${newSubnetId}`, "IP 的当前子网未找到。", 'subnetId');
      const parsedCidr = getSubnetPropertiesFromCidr(currentSubnet.cidr); if (!parsedCidr) throw new AppError(`当前子网 ${currentSubnet.cidr} 的 CIDR 无效。`, 500, 'SUBNET_CIDR_INVALID_FOR_IP_CHECK');
      if (!isIpInCidrRange(finalIpAddress, parsedCidr)) throw new ValidationError(`新 IP ${finalIpAddress} 不在当前子网 ${currentSubnet.cidr} 的范围内。`, 'ipAddress', finalIpAddress);
      if (await prisma.iPAddress.findFirst({ where: { ipAddress: finalIpAddress, subnetId: newSubnetId, NOT: { id } } })) throw new ResourceError(`新 IP ${finalIpAddress} 已存在于子网 ${currentSubnet.networkAddress} 中。`, 'IP_EXISTS_IN_SUBNET', undefined, 'ipAddress');
    }
    const updatedIP = await prisma.iPAddress.update({ where: { id }, data: updateData });
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'update_ip_address', details: `更新了 IP ${updatedIP.ipAddress}` } });
    revalidatePath("/ip-addresses"); revalidatePath("/dashboard"); revalidatePath("/subnets"); revalidatePath("/query");
    const appIp: AppIPAddress = { ...updatedIP, isGateway: updatedIP.isGateway ?? false, subnetId: updatedIP.subnetId || undefined, directVlanId: updatedIP.directVlanId || undefined, allocatedTo: updatedIP.allocatedTo || undefined, usageUnit: updatedIP.usageUnit || undefined, contactPerson: updatedIP.contactPerson || undefined, phone: updatedIP.phone || undefined, description: updatedIP.description || undefined, lastSeen: updatedIP.lastSeen?.toISOString(), status: updatedIP.status as AppIPAddressStatusType, selectedOperatorName: updatedIP.selectedOperatorName || undefined, selectedOperatorDevice: updatedIP.selectedOperatorDevice || undefined, selectedAccessType: updatedIP.selectedAccessType || undefined, selectedLocalDeviceName: updatedIP.selectedLocalDeviceName || undefined, selectedDevicePort: updatedIP.selectedDevicePort || undefined, selectedPaymentSource: updatedIP.selectedPaymentSource || undefined };
    return { success: true, data: appIp };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

export async function deleteIPAddressAction(id: string, performingUserId?: string): Promise<ActionResponse> {
  const actionName = 'deleteIPAddressAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    const ipToDelete = await prisma.iPAddress.findUnique({ where: { id }, include: { directVlan: { select: { vlanNumber: true } } } }); if (!ipToDelete) throw new NotFoundError(`IP 地址 ID: ${id}`);
    if (ipToDelete.status === 'allocated' || ipToDelete.status === 'reserved') throw new ResourceError(`IP 地址 ${ipToDelete.ipAddress} 状态为 "${ipToDelete.status}"。`, 'IP_ADDRESS_IN_USE_STATUS');
    if (ipToDelete.directVlanId) { const directVlanNumber = ipToDelete.directVlan?.vlanNumber || ipToDelete.directVlanId; throw new ResourceError(`IP 地址 ${ipToDelete.ipAddress} 直接关联到 VLAN ${directVlanNumber}。`, 'IP_ADDRESS_HAS_DIRECT_VLAN'); }
    await prisma.iPAddress.delete({ where: { id } });
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'delete_ip_address', details: `删除了 IP ${ipToDelete.ipAddress}` } });
    revalidatePath("/ip-addresses"); revalidatePath("/dashboard"); revalidatePath("/subnets"); revalidatePath("/query");
    return { success: true };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

export async function batchDeleteIPAddressesAction(ids: string[], performingUserId?: string): Promise<BatchDeleteResult> {
  const actionName = 'batchDeleteIPAddressesAction';
  const auditUser = await getAuditUserInfo(performingUserId); let successCount = 0; const failureDetails: BatchOperationFailure[] = []; const deletedIpAddresses: string[] = [];
  for (const id of ids) {
    try {
      const ipToDelete = await prisma.iPAddress.findUnique({ where: { id }, include: { directVlan: { select: { vlanNumber: true } } } }); if (!ipToDelete) { failureDetails.push({ id, itemIdentifier: `ID ${id}`, error: 'IP 地址未找到。' }); continue; }
      if (ipToDelete.status === 'allocated' || ipToDelete.status === 'reserved') throw new ResourceError(`IP 地址 ${ipToDelete.ipAddress} 状态为 "${ipToDelete.status}"。`, 'IP_ADDRESS_IN_USE_STATUS_BATCH');
      if (ipToDelete.directVlanId) { const directVlanNumber = ipToDelete.directVlan?.vlanNumber || ipToDelete.directVlanId; throw new ResourceError(`IP 地址 ${ipToDelete.ipAddress} 直接关联到 VLAN ${directVlanNumber}。`, 'IP_ADDRESS_HAS_DIRECT_VLAN_BATCH'); }
      await prisma.iPAddress.delete({ where: { id } }); deletedIpAddresses.push(ipToDelete.ipAddress); successCount++;
    } catch (error: unknown) { const errRes = createActionErrorResponse(error, `${actionName}_single`); failureDetails.push({ id, itemIdentifier: (await prisma.iPAddress.findUnique({ where: { id } }))?.ipAddress || `ID ${id}`, error: errRes.userMessage }); }
  }
  if (deletedIpAddresses.length > 0) { await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'batch_delete_ip_address', details: `批量删除了 ${deletedIpAddresses.length} 个 IP 地址: ${deletedIpAddresses.join(', ')}。失败 ${failureDetails.length} 个。` } }); revalidatePath("/ip-addresses"); revalidatePath("/dashboard"); revalidatePath("/subnets"); revalidatePath("/query"); }
  return { successCount, failureCount: failureDetails.length, failureDetails };
}

interface QueryToolParams { page?: number; pageSize?: number; queryString?: string; searchTerm?: string; status?: AppIPAddressStatusType | 'all'; }
export async function querySubnetsAction(params: QueryToolParams): Promise<ActionResponse<PaginatedResponse<SubnetQueryResult>>> {
  const actionName = 'querySubnetsAction';
  try {
    const page = params.page || 1; const pageSize = params.pageSize || DEFAULT_QUERY_PAGE_SIZE; const skip = (page - 1) * pageSize;
    const queryString = params.queryString?.trim(); if (!queryString) return { success: true, data: { data: [], totalCount: 0, currentPage: page, totalPages: 0, pageSize } };
    const orConditions: Prisma.SubnetWhereInput[] = [ { cidr: { contains: queryString } }, { name: { contains: queryString } }, { description: { contains: queryString } }, { networkAddress: { contains: queryString } }, ];
    let whereClause: Prisma.SubnetWhereInput = { OR: orConditions }; if (orConditions.length === 0) whereClause = { id: "IMPOSSIBLE_ID_TO_MATCH_ANYTHING_SUBNET" };
    const totalCount = await prisma.subnet.count({ where: whereClause }); const totalPages = Math.ceil(totalCount / pageSize) || 1;
    const subnetsFromDb = await prisma.subnet.findMany({ where: whereClause, include: { vlan: { select: { vlanNumber: true, name: true } } }, orderBy: { cidr: 'asc' }, skip, take: pageSize });
    const results: SubnetQueryResult[] = await Promise.all(subnetsFromDb.map(async (s) => { const props = getSubnetPropertiesFromCidr(s.cidr); const totalUsableIPs = props ? getUsableIpCount(props.prefix) : 0; const allocatedIPsCount = await prisma.iPAddress.count({ where: { subnetId: s.id, status: 'allocated' } }); const dbFreeIPsCount = await prisma.iPAddress.count({ where: { subnetId: s.id, status: 'free' } }); const reservedIPsCount = await prisma.iPAddress.count({ where: { subnetId: s.id, status: 'reserved' } }); return { id: s.id, cidr: s.cidr, name: s.name || undefined, description: s.description || undefined, dhcpEnabled: s.dhcpEnabled ?? false, vlanNumber: s.vlan?.vlanNumber, vlanName: s.vlan?.name || undefined, totalUsableIPs, allocatedIPsCount, dbFreeIPsCount, reservedIPsCount }; }));
    return { success: true, data: { data: results, totalCount, currentPage: page, totalPages, pageSize } };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

export async function queryVlansAction(params: QueryToolParams): Promise<ActionResponse<PaginatedResponse<VlanQueryResult>>> {
  const actionName = 'queryVlansAction';
  try {
    const page = params.page || 1; const pageSize = params.pageSize || DEFAULT_QUERY_PAGE_SIZE; const skip = (page - 1) * pageSize;
    const queryString = params.queryString?.trim(); if (!queryString) return { success: true, data: { data: [], totalCount: 0, currentPage: page, totalPages: 0, pageSize } };
    const isNumericQuery = /^\d+$/.test(queryString); const vlanNumberQuery = isNumericQuery ? parseInt(queryString, 10) : null;
    const orConditions: Prisma.VLANWhereInput[] = [];
    if (vlanNumberQuery !== null && vlanNumberQuery >= 1 && vlanNumberQuery <= 4094) orConditions.push({ vlanNumber: vlanNumberQuery });
    orConditions.push({ name: { contains: queryString } }); orConditions.push({ description: { contains: queryString } });
    let whereClause: Prisma.VLANWhereInput = { OR: orConditions }; if (orConditions.length === 0) whereClause = { id: "IMPOSSIBLE_ID_TO_MATCH_ANYTHING_VLAN" };
    const totalCount = await prisma.vLAN.count({ where: whereClause }); const totalPages = Math.ceil(totalCount / pageSize) || 1;
    const vlansFromDb = await prisma.vLAN.findMany({ where: whereClause, include: { subnets: { select: { id: true, cidr: true, name: true, description: true } } , ipAddresses: { select: { id: true, ipAddress: true, description: true } } }, orderBy: { vlanNumber: 'asc' }, skip, take: pageSize, });
    const results: VlanQueryResult[] = vlansFromDb.map(v => ({ id: v.id, vlanNumber: v.vlanNumber, name: v.name || undefined, description: v.description || undefined, associatedSubnets: v.subnets.map(s => ({id: s.id, cidr: s.cidr, name: s.name || undefined, description: s.description || undefined})), associatedDirectIPs: v.ipAddresses.map(ip => ({id: ip.id, ipAddress: ip.ipAddress, description: ip.description || undefined})), resourceCount: v.subnets.length + v.ipAddresses.length }));
    return { success: true, data: { data: results, totalCount, currentPage: page, totalPages, pageSize } };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

export async function queryIpAddressesAction(params: QueryToolParams): Promise<ActionResponse<PaginatedResponse<AppIPAddressWithRelations>>> {
  const actionName = 'queryIpAddressesAction';
  try {
    const page = params.page || 1; const pageSize = params.pageSize || DEFAULT_QUERY_PAGE_SIZE; const skip = (page - 1) * pageSize;
    const trimmedSearchTerm = params.searchTerm?.trim(); const statusFilter = params.status;
    const andConditions: Prisma.IPAddressWhereInput[] = []; const orConditionsForSearchTerm: Prisma.IPAddressWhereInput[] = [];
    if (trimmedSearchTerm) {
      const ipWildcardPatterns = [ { regex: /^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\*$/, prefixBuilder: (m: RegExpMatchArray) => `${m[1]}.` }, { regex: /^(\d{1,3}\.\d{1,3})\.\*$/, prefixBuilder: (m: RegExpMatchArray) => `${m[1]}.` }, { regex: /^(\d{1,3})\.\*$/, prefixBuilder: (m: RegExpMatchArray) => `${m[1]}.` } ];
      let matchedIpPattern = false; for (const p of ipWildcardPatterns) { const m = trimmedSearchTerm.match(p.regex); if (m) { orConditionsForSearchTerm.push({ ipAddress: { startsWith: p.prefixBuilder(m) } }); matchedIpPattern = true; break; } }
      const isPotentiallyIpSegment = !matchedIpPattern && trimmedSearchTerm.length > 0 && trimmedSearchTerm.length <= 15 && /[\d]/.test(trimmedSearchTerm) && /^[0-9.*]+$/.test(trimmedSearchTerm) && !/^\.+$/.test(trimmedSearchTerm) && !/^\*+$/.test(trimmedSearchTerm);
      if (isPotentiallyIpSegment && !matchedIpPattern) orConditionsForSearchTerm.push({ ipAddress: { startsWith: trimmedSearchTerm } });
      orConditionsForSearchTerm.push({ allocatedTo: { contains: trimmedSearchTerm } }); orConditionsForSearchTerm.push({ description: { contains: trimmedSearchTerm } });
      orConditionsForSearchTerm.push({ usageUnit: { contains: trimmedSearchTerm } }); orConditionsForSearchTerm.push({ contactPerson: { contains: trimmedSearchTerm } }); 
      orConditionsForSearchTerm.push({ phone: { contains: trimmedSearchTerm } }); 
      orConditionsForSearchTerm.push({ selectedOperatorName: { contains: trimmedSearchTerm } }); orConditionsForSearchTerm.push({ selectedOperatorDevice: { contains: trimmedSearchTerm } }); orConditionsForSearchTerm.push({ selectedAccessType: { contains: trimmedSearchTerm } });
      orConditionsForSearchTerm.push({ selectedLocalDeviceName: { contains: trimmedSearchTerm } }); orConditionsForSearchTerm.push({ selectedDevicePort: { contains: trimmedSearchTerm } }); orConditionsForSearchTerm.push({ selectedPaymentSource: { contains: trimmedSearchTerm } });
    }
    if (orConditionsForSearchTerm.length > 0) andConditions.push({ OR: orConditionsForSearchTerm }); else if (trimmedSearchTerm) andConditions.push({ id: "IMPOSSIBLE_ID_TO_MATCH_ANYTHING_IP_SEARCH" });
    if (statusFilter && statusFilter !== 'all') andConditions.push({ status: statusFilter as AppIPAddressStatusType });
    let whereClause: Prisma.IPAddressWhereInput = {};
    if (andConditions.length > 0) whereClause = { AND: andConditions }; else if (!trimmedSearchTerm && (!statusFilter || statusFilter === 'all')) return { success: true, data: { data: [], totalCount: 0, currentPage: page, totalPages: 0, pageSize } };
    const totalCount = await prisma.iPAddress.count({ where: whereClause }); const totalPages = Math.ceil(totalCount / pageSize) || 1;
    const includeClauseForQuery = { subnet: { include: { vlan: { select: { vlanNumber: true, name: true } } } }, directVlan: { select: {vlanNumber: true, name: true} } };
    const ipsFromDb = await prisma.iPAddress.findMany({ where: whereClause, include: includeClauseForQuery, orderBy: [ { subnet: { networkAddress: 'asc' } }, { ipAddress: 'asc' } ], skip, take: pageSize }) as PrismaIPAddressWithRelations[];
    const results: AppIPAddressWithRelations[] = ipsFromDb.map(ip => ({ id: ip.id, ipAddress: ip.ipAddress, status: ip.status as AppIPAddressStatusType, isGateway: ip.isGateway ?? false, allocatedTo: ip.allocatedTo || undefined, usageUnit: ip.usageUnit || undefined, contactPerson: ip.contactPerson || undefined, phone: ip.phone || undefined, description: ip.description || undefined, lastSeen: ip.lastSeen?.toISOString() || undefined, subnetId: ip.subnetId || undefined, directVlanId: ip.directVlanId || undefined, subnet: ip.subnet ? { id: ip.subnet.id, cidr: ip.subnet.cidr, name: ip.subnet.name || undefined, networkAddress: ip.subnet.networkAddress, vlan: ip.subnet.vlan ? { vlanNumber: ip.subnet.vlan.vlanNumber, name: ip.subnet.vlan.name || undefined } : null } : null, directVlan: ip.directVlan ? { vlanNumber: ip.directVlan.vlanNumber, name: ip.directVlan.name || undefined } : null, selectedOperatorName: ip.selectedOperatorName || undefined, selectedOperatorDevice: ip.selectedOperatorDevice || undefined, selectedAccessType: ip.selectedAccessType || undefined, selectedLocalDeviceName: ip.selectedLocalDeviceName || undefined, selectedDevicePort: ip.selectedDevicePort || undefined, selectedPaymentSource: ip.selectedPaymentSource || undefined }));
    return { success: true, data: { data: results, totalCount, currentPage: page, totalPages, pageSize } };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

export async function getSubnetFreeIpDetailsAction(subnetId: string): Promise<ActionResponse<SubnetFreeIpDetails>> {
  const actionName = 'getSubnetFreeIpDetailsAction';
  try {
    const subnet = await prisma.subnet.findUnique({ where: { id: subnetId } }); if (!subnet) throw new NotFoundError(`子网 ID: ${subnetId}`);
    const subnetProperties = getSubnetPropertiesFromCidr(subnet.cidr); if (!subnetProperties) throw new AppError(`子网 ${subnet.cidr} 的 CIDR 配置无效。`, 500, 'SUBNET_CIDR_INVALID_FOR_FREE_IP_CALC');
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

export async function getOperatorDictionariesAction(params?: FetchParams): Promise<ActionResponse<PaginatedResponse<AppOperatorDictionary>>> {
  const actionName = 'getOperatorDictionariesAction';
  try {
    const page = params?.page || 1; const pageSize = params?.pageSize || DEFAULT_PAGE_SIZE; const skip = (page - 1) * pageSize;
    const totalCount = await prisma.operatorDictionary.count(); const totalPages = Math.ceil(totalCount / pageSize) || 1;
    const itemsFromDb = params?.page && params?.pageSize 
        ? await prisma.operatorDictionary.findMany({ orderBy: { operatorName: 'asc' }, skip, take: pageSize })
        : await prisma.operatorDictionary.findMany({ orderBy: { operatorName: 'asc' } });
    const appItems: AppOperatorDictionary[] = itemsFromDb.map(item => ({ id: item.id, operatorName: item.operatorName, operatorDevice: item.operatorDevice || undefined, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() }));
    return { success: true, data: { data: appItems, totalCount: params?.page && params?.pageSize ? totalCount : appItems.length, currentPage: page, totalPages: params?.page && params?.pageSize ? totalPages : 1, pageSize } };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

export async function createOperatorDictionaryAction(data: { operatorName: string; operatorDevice?: string }): Promise<ActionResponse<AppOperatorDictionary>> {
  try {
    const result = await prisma.operatorDictionary.create({
      data: {
        operatorName: data.operatorName,
        operatorDevice: data.operatorDevice,
      },
    });
    const { ...restOfResult } = result;
    return { success: true, data: restOfResult };
  } catch (error) {
    return handlePrismaError(error, { operatorName: "运营商名称" });
  }
}

export async function updateOperatorDictionaryAction(id: string, data: { operatorName: string; operatorDevice?: string }): Promise<ActionResponse<AppOperatorDictionary>> {
  try {
    const result = await prisma.operatorDictionary.update({
      where: { id },
      data: {
        operatorName: data.operatorName,
        operatorDevice: data.operatorDevice,
      },
    });
    const { ...restOfResult } = result;
    return { success: true, data: restOfResult };
  } catch (error) {
    return handlePrismaError(error, { operatorName: "运营商名称" });
  }
}

export async function deleteOperatorDictionaryAction(id: string, performingUserId?: string): Promise<ActionResponse> {
  const actionName = 'deleteOperatorDictionaryAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    const itemToDelete = await prisma.operatorDictionary.findUnique({ where: { id } }); if (!itemToDelete) throw new NotFoundError(`运营商字典 ID: ${id}`);
    if (await prisma.iPAddress.count({where: {OR: [{selectedOperatorName: itemToDelete.operatorName}, {selectedOperatorDevice: itemToDelete.operatorDevice ?? undefined}]}}) > 0) throw new ResourceError(`运营商字典条目 "${itemToDelete.operatorName}" 正在被 IP 地址使用。`);
    await prisma.operatorDictionary.delete({ where: { id } });
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'delete_operator_dictionary', details: `删除了运营商字典条目: ${itemToDelete.operatorName}` } });
    revalidatePath("/dictionaries/operator");
    revalidatePath("/ip-addresses");
    return { success: true };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

export async function batchDeleteOperatorDictionariesAction(ids: string[], performingUserId?: string): Promise<BatchDeleteResult> {
  const actionName = 'batchDeleteOperatorDictionariesAction';
  const auditUser = await getAuditUserInfo(performingUserId); let successCount = 0; const failureDetails: BatchOperationFailure[] = [];
  for (const id of ids) {
    try {
      const item = await prisma.operatorDictionary.findUnique({where: {id}}); if (!item) { failureDetails.push({id, itemIdentifier: `ID ${id}`, error: '未找到条目。'}); continue; }
      if (await prisma.iPAddress.count({where: {OR: [{selectedOperatorName: item.operatorName}, {selectedOperatorDevice: item.operatorDevice ?? undefined}]}}) > 0) throw new ResourceError(`运营商字典条目 "${item.operatorName}" 正在被 IP 地址使用。`);
      await prisma.operatorDictionary.delete({ where: { id } }); successCount++;
    } catch (e: unknown) { const errRes = createActionErrorResponse(e, `${actionName}_single`); failureDetails.push({id, itemIdentifier: (await prisma.operatorDictionary.findUnique({where: {id}}))?.operatorName || `ID ${id}`, error: errRes.userMessage}); }
  }
  if (successCount > 0) { await prisma.auditLog.create({data: {userId: auditUser.userId, username: auditUser.username, action: 'batch_delete_operator_dictionary', details: `批量删除了 ${successCount} 个运营商字典条目。`}}); revalidatePath("/dictionaries/operator"); revalidatePath("/ip-addresses"); }
  return { successCount, failureCount: failureDetails.length, failureDetails };
}

export async function getLocalDeviceDictionariesAction(params?: FetchParams): Promise<ActionResponse<PaginatedResponse<AppLocalDeviceDictionary>>> {
  const actionName = 'getLocalDeviceDictionariesAction';
  try {
    const page = params?.page || 1; const pageSize = params?.pageSize || DEFAULT_PAGE_SIZE; const skip = (page - 1) * pageSize;
    const totalCount = await prisma.localDeviceDictionary.count(); const totalPages = Math.ceil(totalCount / pageSize) || 1;
    const itemsFromDb = params?.page && params?.pageSize
        ? await prisma.localDeviceDictionary.findMany({ orderBy: { deviceName: 'asc' }, skip, take: pageSize })
        : await prisma.localDeviceDictionary.findMany({ orderBy: { deviceName: 'asc' } });
    const appItems: AppLocalDeviceDictionary[] = itemsFromDb.map(item => ({ ...item, port: item.port || undefined, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString()}));
    return { success: true, data: { data: appItems, totalCount: params?.page && params?.pageSize ? totalCount : appItems.length, currentPage: page, totalPages: params?.page && params?.pageSize ? totalPages : 1, pageSize } };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

export async function createLocalDeviceDictionaryAction(data: Omit<AppLocalDeviceDictionary, 'id' | 'createdAt' | 'updatedAt'>, performingUserId?: string): Promise<ActionResponse<AppLocalDeviceDictionary>> {
  const actionName = 'createLocalDeviceDictionaryAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    if (!data.deviceName || data.deviceName.trim() === "") throw new ValidationError("设备名称是必需的。", "deviceName");
    if (await prisma.localDeviceDictionary.findUnique({ where: { deviceName: data.deviceName } })) throw new ResourceError(`设备名称 "${data.deviceName}" 已存在。`, 'LOCAL_DEVICE_DICT_NAME_EXISTS', undefined, 'deviceName');
    const newItem = await prisma.localDeviceDictionary.create({ data: { deviceName: data.deviceName, port: data.port || null } });
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'create_local_device_dictionary', details: `创建了本地设备字典条目: ${newItem.deviceName}` } });
    revalidatePath("/dictionaries/local-device");
    revalidatePath("/ip-addresses");
    const appItem: AppLocalDeviceDictionary = {...newItem, port: newItem.port || undefined, createdAt: newItem.createdAt.toISOString(), updatedAt: newItem.updatedAt.toISOString()};
    return { success: true, data: appItem };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

export async function updateLocalDeviceDictionaryAction(id: string, data: Partial<Omit<AppLocalDeviceDictionary, 'id' | 'createdAt' | 'updatedAt'>>, performingUserId?: string): Promise<ActionResponse<AppLocalDeviceDictionary>> {
  const actionName = 'updateLocalDeviceDictionaryAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    const itemToUpdate = await prisma.localDeviceDictionary.findUnique({ where: { id } }); if (!itemToUpdate) throw new NotFoundError(`本地设备字典 ID: ${id}`);
    const updatePayload: Prisma.LocalDeviceDictionaryUpdateInput = {};
    if (data.deviceName && data.deviceName !== itemToUpdate.deviceName) { if (await prisma.localDeviceDictionary.findFirst({ where: { deviceName: data.deviceName, NOT: { id } } })) throw new ResourceError(`设备名称 "${data.deviceName}" 已存在。`, 'LOCAL_DEVICE_DICT_NAME_EXISTS', undefined, 'deviceName'); updatePayload.deviceName = data.deviceName; }
    if (data.hasOwnProperty('port')) updatePayload.port = data.port || null;
    if (Object.keys(updatePayload).length === 0) { const currentItem: AppLocalDeviceDictionary = {...itemToUpdate, port: itemToUpdate.port || undefined, createdAt: itemToUpdate.createdAt.toISOString(), updatedAt: itemToUpdate.updatedAt.toISOString()}; return { success: true, data: currentItem }; }
    const updatedItem = await prisma.localDeviceDictionary.update({ where: { id }, data: updatePayload });
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'update_local_device_dictionary', details: `更新了本地设备字典条目: ${updatedItem.deviceName}` } });
    revalidatePath("/dictionaries/local-device");
    revalidatePath("/ip-addresses");
    const appItem: AppLocalDeviceDictionary = {...updatedItem, port: updatedItem.port || undefined, createdAt: updatedItem.createdAt.toISOString(), updatedAt: updatedItem.updatedAt.toISOString()};
    return { success: true, data: appItem };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

export async function deleteLocalDeviceDictionaryAction(id: string, performingUserId?: string): Promise<ActionResponse> {
  const actionName = 'deleteLocalDeviceDictionaryAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    const itemToDelete = await prisma.localDeviceDictionary.findUnique({ where: { id } }); if (!itemToDelete) throw new NotFoundError(`本地设备字典 ID: ${id}`);
    await prisma.localDeviceDictionary.delete({ where: { id } });
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'delete_local_device_dictionary', details: `删除了本地设备字典条目: ${itemToDelete.deviceName}` } });
    revalidatePath("/dictionaries/local-device");
    revalidatePath("/ip-addresses");
    return { success: true };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

export async function batchDeleteLocalDeviceDictionariesAction(ids: string[], performingUserId?: string): Promise<BatchDeleteResult> {
  const actionName = 'batchDeleteLocalDeviceDictionariesAction';
  const auditUser = await getAuditUserInfo(performingUserId); let successCount = 0; const failureDetails: BatchOperationFailure[] = [];
  for (const id of ids) {
    try {
      const item = await prisma.localDeviceDictionary.findUnique({where: {id}}); if (!item) { failureDetails.push({id, itemIdentifier: `ID ${id}`, error: '未找到条目。'}); continue; }
      await prisma.localDeviceDictionary.delete({ where: { id } }); successCount++;
    } catch (e: unknown) { const errRes = createActionErrorResponse(e, `${actionName}_single`); failureDetails.push({id, itemIdentifier: (await prisma.localDeviceDictionary.findUnique({where: {id}}))?.deviceName || `ID ${id}`, error: errRes.userMessage}); }
  }
  if (successCount > 0) { await prisma.auditLog.create({data: {userId: auditUser.userId, username: auditUser.username, action: 'batch_delete_local_device_dictionary', details: `批量删除了 ${successCount} 个本地设备字典条目。`}}); revalidatePath("/dictionaries/local-device"); revalidatePath("/ip-addresses"); }
  return { successCount, failureCount: failureDetails.length, failureDetails };
}

export async function getPaymentSourceDictionariesAction(params?: FetchParams): Promise<ActionResponse<PaginatedResponse<AppPaymentSourceDictionary>>> {
  const actionName = 'getPaymentSourceDictionariesAction';
  try {
    const page = params?.page || 1; const pageSize = params?.pageSize || DEFAULT_PAGE_SIZE; const skip = (page - 1) * pageSize;
    const totalCount = await prisma.paymentSourceDictionary.count(); const totalPages = Math.ceil(totalCount / pageSize) || 1;
    const itemsFromDb = params?.page && params?.pageSize
        ? await prisma.paymentSourceDictionary.findMany({ orderBy: { sourceName: 'asc' }, skip, take: pageSize })
        : await prisma.paymentSourceDictionary.findMany({ orderBy: { sourceName: 'asc' } });
    const appItems: AppPaymentSourceDictionary[] = itemsFromDb.map(item => ({ ...item, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString()}));
    return { success: true, data: { data: appItems, totalCount: params?.page && params?.pageSize ? totalCount : appItems.length, currentPage: page, totalPages: params?.page && params?.pageSize ? totalPages : 1, pageSize } };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

export async function createPaymentSourceDictionaryAction(data: Omit<AppPaymentSourceDictionary, 'id' | 'createdAt' | 'updatedAt'>, performingUserId?: string): Promise<ActionResponse<AppPaymentSourceDictionary>> {
  const actionName = 'createPaymentSourceDictionaryAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    if (!data.sourceName || data.sourceName.trim() === "") throw new ValidationError("费用来源名称是必需的。", "sourceName");
    if (await prisma.paymentSourceDictionary.findUnique({ where: { sourceName: data.sourceName } })) throw new ResourceError(`费用来源 "${data.sourceName}" 已存在。`, 'PAYMENT_SOURCE_DICT_NAME_EXISTS', undefined, 'sourceName');
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
    const itemToUpdate = await prisma.paymentSourceDictionary.findUnique({ where: { id } }); if (!itemToUpdate) throw new NotFoundError(`付费字典 ID: ${id}`);
    const updatePayload: Prisma.PaymentSourceDictionaryUpdateInput = {};
    if (data.sourceName && data.sourceName !== itemToUpdate.sourceName) { if (await prisma.paymentSourceDictionary.findFirst({ where: { sourceName: data.sourceName, NOT: { id } } })) throw new ResourceError(`费用来源 "${data.sourceName}" 已存在。`, 'PAYMENT_SOURCE_DICT_NAME_EXISTS', undefined, 'sourceName'); updatePayload.sourceName = data.sourceName; }
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
    const itemToDelete = await prisma.paymentSourceDictionary.findUnique({ where: { id } }); if (!itemToDelete) throw new NotFoundError(`付费字典 ID: ${id}`);
    await prisma.paymentSourceDictionary.delete({ where: { id } });
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'delete_payment_source_dictionary', details: `删除了付费字典条目: ${itemToDelete.sourceName}` } });
    revalidatePath("/dictionaries/payment-source");
    revalidatePath("/ip-addresses");
    return { success: true };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

export async function batchDeletePaymentSourceDictionariesAction(ids: string[], performingUserId?: string): Promise<BatchDeleteResult> {
  const actionName = 'batchDeletePaymentSourceDictionariesAction';
  const auditUser = await getAuditUserInfo(performingUserId); let successCount = 0; const failureDetails: BatchOperationFailure[] = [];
  for (const id of ids) {
    try {
      const item = await prisma.paymentSourceDictionary.findUnique({where: {id}}); if (!item) { failureDetails.push({id, itemIdentifier: `ID ${id}`, error: '未找到条目。'}); continue; }
      await prisma.paymentSourceDictionary.delete({ where: { id } }); successCount++;
    } catch (e: unknown) { const errRes = createActionErrorResponse(e, `${actionName}_single`); failureDetails.push({id, itemIdentifier: (await prisma.paymentSourceDictionary.findUnique({where: {id}}))?.sourceName || `ID ${id}`, error: errRes.userMessage}); }
  }
  if (successCount > 0) { await prisma.auditLog.create({data: {userId: auditUser.userId, username: auditUser.username, action: 'batch_delete_payment_source_dictionary', details: `批量删除了 ${successCount} 个付费字典条目。`}}); revalidatePath("/dictionaries/payment-source"); revalidatePath("/ip-addresses"); }
  return { successCount, failureCount: failureDetails.length, failureDetails };
}

// --- AccessTypeDictionary Actions ---
export async function getAccessTypeDictionariesAction(params?: FetchParams): Promise<ActionResponse<PaginatedResponse<AppAccessTypeDictionary>>> {
  const actionName = 'getAccessTypeDictionariesAction';
  try {
    const page = params?.page || 1; const pageSize = params?.pageSize || DEFAULT_PAGE_SIZE; const skip = (page - 1) * pageSize;
    const totalCount = await prisma.accessTypeDictionary.count(); const totalPages = Math.ceil(totalCount / pageSize) || 1;
    const itemsFromDb = params?.page && params?.pageSize
        ? await prisma.accessTypeDictionary.findMany({ orderBy: { name: 'asc' }, skip, take: pageSize })
        : await prisma.accessTypeDictionary.findMany({ orderBy: { name: 'asc' } });
    const appItems: AppAccessTypeDictionary[] = itemsFromDb.map(item => ({ ...item, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() }));
    return { success: true, data: { data: appItems, totalCount: params?.page && params?.pageSize ? totalCount : appItems.length, currentPage: page, totalPages: params?.page && params?.pageSize ? totalPages : 1, pageSize } };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

export async function createAccessTypeDictionaryAction(data: Omit<AppAccessTypeDictionary, 'id' | 'createdAt' | 'updatedAt'>, performingUserId?: string): Promise<ActionResponse<AppAccessTypeDictionary>> {
  const actionName = 'createAccessTypeDictionaryAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    if (!data.name || data.name.trim() === "") throw new ValidationError("接入方式名称是必需的。", "name");
    if (await prisma.accessTypeDictionary.findUnique({ where: { name: data.name } })) throw new ResourceError(`接入方式 "${data.name}" 已存在。`, 'ACCESS_TYPE_DICT_NAME_EXISTS', undefined, 'name');
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
    const itemToUpdate = await prisma.accessTypeDictionary.findUnique({ where: { id } }); if (!itemToUpdate) throw new NotFoundError(`接入方式字典 ID: ${id}`);
    const updatePayload: Prisma.AccessTypeDictionaryUpdateInput = {};
    if (data.name && data.name !== itemToUpdate.name) { if (await prisma.accessTypeDictionary.findFirst({ where: { name: data.name, NOT: { id } } })) throw new ResourceError(`接入方式 "${data.name}" 已存在。`, 'ACCESS_TYPE_DICT_NAME_EXISTS', undefined, 'name'); updatePayload.name = data.name; }
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
    const itemToDelete = await prisma.accessTypeDictionary.findUnique({ where: { id } }); if (!itemToDelete) throw new NotFoundError(`接入方式字典 ID: ${id}`);
    await prisma.accessTypeDictionary.delete({ where: { id } });
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'delete_access_type_dictionary', details: `删除了接入方式字典条目: ${itemToDelete.name}` } });
    revalidatePath("/dictionaries/access-type"); revalidatePath("/ip-addresses");
    return { success: true };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

export async function batchDeleteAccessTypeDictionariesAction(ids: string[], performingUserId?: string): Promise<BatchDeleteResult> {
  const actionName = 'batchDeleteAccessTypeDictionariesAction';
  const auditUser = await getAuditUserInfo(performingUserId); let successCount = 0; const failureDetails: BatchOperationFailure[] = [];
  for (const id of ids) {
    try {
      const item = await prisma.accessTypeDictionary.findUnique({where: {id}}); if (!item) { failureDetails.push({id, itemIdentifier: `ID ${id}`, error: '未找到条目。'}); continue; }
      await prisma.accessTypeDictionary.delete({ where: { id } }); successCount++;
    } catch (e: unknown) { const errRes = createActionErrorResponse(e, `${actionName}_single`); failureDetails.push({id, itemIdentifier: (await prisma.accessTypeDictionary.findUnique({where: {id}}))?.name || `ID ${id}`, error: errRes.userMessage}); }
  }
  if (successCount > 0) { await prisma.auditLog.create({data: {userId: auditUser.userId, username: auditUser.username, action: 'batch_delete_access_type_dictionary', details: `批量删除了 ${successCount} 个接入方式字典条目。`}}); revalidatePath("/dictionaries/access-type"); revalidatePath("/ip-addresses"); }
  return { successCount, failureCount: failureDetails.length, failureDetails };
}

// --- NetworkInterfaceTypeDictionary Actions ---
export async function getNetworkInterfaceTypeDictionariesAction(params?: FetchParams): Promise<ActionResponse<PaginatedResponse<AppNetworkInterfaceTypeDictionary>>> {
  const actionName = 'getNetworkInterfaceTypeDictionariesAction';
  try {
    const page = params?.page || 1; const pageSize = params?.pageSize || DEFAULT_PAGE_SIZE; const skip = (page - 1) * pageSize;
    const totalCount = await prisma.networkInterfaceTypeDictionary.count(); const totalPages = Math.ceil(totalCount / pageSize) || 1;
    const itemsFromDb = params?.page && params?.pageSize
        ? await prisma.networkInterfaceTypeDictionary.findMany({ orderBy: { name: 'asc' }, skip, take: pageSize })
        : await prisma.networkInterfaceTypeDictionary.findMany({ orderBy: { name: 'asc' } });
    const appItems: AppNetworkInterfaceTypeDictionary[] = itemsFromDb.map(item => ({ ...item, description: item.description || undefined, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() }));
    return { success: true, data: { data: appItems, totalCount: params?.page && params?.pageSize ? totalCount : appItems.length, currentPage: page, totalPages: params?.page && params?.pageSize ? totalPages : 1, pageSize } };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

export async function createNetworkInterfaceTypeDictionaryAction(data: Omit<AppNetworkInterfaceTypeDictionary, 'id' | 'createdAt' | 'updatedAt'>, performingUserId?: string): Promise<ActionResponse<AppNetworkInterfaceTypeDictionary>> {
  const actionName = 'createNetworkInterfaceTypeDictionaryAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    if (!data.name || data.name.trim() === "") throw new ValidationError("接口类型名称是必需的。", "name");
    if (await prisma.networkInterfaceTypeDictionary.findUnique({ where: { name: data.name } })) throw new ResourceError(`网络接口类型 "${data.name}" 已存在。`, 'NETWORK_INTERFACE_TYPE_DICT_NAME_EXISTS', undefined, 'name');
    const newItem = await prisma.networkInterfaceTypeDictionary.create({ data: { name: data.name, description: data.description || null } });
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'create_network_interface_type_dictionary', details: `创建了网络接口类型字典条目: ${newItem.name}` } });
    revalidatePath("/dictionaries/network-interface-type");
    const appItem: AppNetworkInterfaceTypeDictionary = { ...newItem, description: newItem.description || undefined, createdAt: newItem.createdAt.toISOString(), updatedAt: newItem.updatedAt.toISOString() };
    return { success: true, data: appItem };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

export async function updateNetworkInterfaceTypeDictionaryAction(id: string, data: Partial<Omit<AppNetworkInterfaceTypeDictionary, 'id' | 'createdAt' | 'updatedAt'>>, performingUserId?: string): Promise<ActionResponse<AppNetworkInterfaceTypeDictionary>> {
  const actionName = 'updateNetworkInterfaceTypeDictionaryAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    const itemToUpdate = await prisma.networkInterfaceTypeDictionary.findUnique({ where: { id } }); if (!itemToUpdate) throw new NotFoundError(`网络接口类型字典 ID: ${id}`);
    const updatePayload: Prisma.NetworkInterfaceTypeDictionaryUpdateInput = {};
    if (data.name && data.name !== itemToUpdate.name) { if (await prisma.networkInterfaceTypeDictionary.findFirst({ where: { name: data.name, NOT: { id } } })) throw new ResourceError(`网络接口类型 "${data.name}" 已存在。`, 'NETWORK_INTERFACE_TYPE_DICT_NAME_EXISTS', undefined, 'name'); updatePayload.name = data.name; }
    if (data.hasOwnProperty('description')) updatePayload.description = data.description || null;
    if (Object.keys(updatePayload).length === 0) { const currentItem: AppNetworkInterfaceTypeDictionary = { ...itemToUpdate, description: itemToUpdate.description || undefined, createdAt: itemToUpdate.createdAt.toISOString(), updatedAt: itemToUpdate.updatedAt.toISOString() }; return { success: true, data: currentItem }; }
    const updatedItem = await prisma.networkInterfaceTypeDictionary.update({ where: { id }, data: updatePayload });
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'update_network_interface_type_dictionary', details: `更新了网络接口类型字典条目: ${updatedItem.name}` } });
    revalidatePath("/dictionaries/network-interface-type");
    const appItem: AppNetworkInterfaceTypeDictionary = { ...updatedItem, description: updatedItem.description || undefined, createdAt: updatedItem.createdAt.toISOString(), updatedAt: updatedItem.updatedAt.toISOString() };
    return { success: true, data: appItem };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

export async function deleteNetworkInterfaceTypeDictionaryAction(id: string, performingUserId?: string): Promise<ActionResponse> {
  const actionName = 'deleteNetworkInterfaceTypeDictionaryAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    const itemToDelete = await prisma.networkInterfaceTypeDictionary.findUnique({ where: { id } }); if (!itemToDelete) throw new NotFoundError(`网络接口类型字典 ID: ${id}`);
    // Add check if this dictionary entry is in use by LocalDeviceDictionary.port prefixes if necessary
    await prisma.networkInterfaceTypeDictionary.delete({ where: { id } });
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'delete_network_interface_type_dictionary', details: `删除了网络接口类型字典条目: ${itemToDelete.name}` } });
    revalidatePath("/dictionaries/network-interface-type");
    return { success: true };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

export async function batchDeleteNetworkInterfaceTypeDictionariesAction(ids: string[], performingUserId?: string): Promise<BatchDeleteResult> {
  const actionName = 'batchDeleteNetworkInterfaceTypeDictionariesAction';
  const auditUser = await getAuditUserInfo(performingUserId); let successCount = 0; const failureDetails: BatchOperationFailure[] = [];
  for (const id of ids) {
    try {
      const item = await prisma.networkInterfaceTypeDictionary.findUnique({where: {id}}); if (!item) { failureDetails.push({id, itemIdentifier: `ID ${id}`, error: '未找到条目。'}); continue; }
      // Add check if in use
      await prisma.networkInterfaceTypeDictionary.delete({ where: { id } }); successCount++;
    } catch (e: unknown) { const errRes = createActionErrorResponse(e, `${actionName}_single`); failureDetails.push({id, itemIdentifier: (await prisma.networkInterfaceTypeDictionary.findUnique({where: {id}}))?.name || `ID ${id}`, error: errRes.userMessage}); }
  }
  if (successCount > 0) { await prisma.auditLog.create({data: {userId: auditUser.userId, username: auditUser.username, action: 'batch_delete_network_interface_type_dictionary', details: `批量删除了 ${successCount} 个网络接口类型字典条目。`}}); revalidatePath("/dictionaries/network-interface-type"); }
  return { successCount, failureCount: failureDetails.length, failureDetails };
}


function handlePrismaError(error: any, fieldNameMap: Record<string, string>): ActionResponse<any> {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    const target = (error.meta?.target as string[]) || [];
    const conflictingField = target.length > 0 ? target[0] : "未知字段";
    const userFriendlyFieldName = fieldNameMap[conflictingField] || conflictingField;
    return {
      success: false,
      error: {
        userMessage: `${userFriendlyFieldName}已存在，请使用不同的值。`,
        code: 'UNIQUE_CONSTRAINT_FAILED',
        field: conflictingField,
      },
    };
  }
  return createActionErrorResponse(error, 'DICTIONARY_DB_ERROR');
}

const CHART_COLORS_REMAINDER = [
  "hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))",
  "hsl(var(--chart-4))", "hsl(var(--chart-5))", "hsl(var(--muted))"
];

export async function getDashboardDataAction(): Promise<ActionResponse<DashboardData>> {
  const actionName = 'getDashboardDataAction';
  try {
    const totalIpCount = await prisma.iPAddress.count();
    const ipStatusGroups = await prisma.iPAddress.groupBy({
      by: ['status'],
      _count: { status: true },
    });
    const ipStatusCounts: IPStatusCounts = { allocated: 0, free: 0, reserved: 0 };
    ipStatusGroups.forEach(group => {
      const statusKey = group.status as keyof IPStatusCounts;
      if (statusKey in ipStatusCounts) {
        ipStatusCounts[statusKey] = group._count.status;
      }
    });

    const totalVlanCount = await prisma.vLAN.count();
    const totalSubnetCount = await prisma.subnet.count();

    const usageUnitGroups = await prisma.iPAddress.groupBy({
      by: ['usageUnit'],
      _count: { usageUnit: true }, 
      where: { usageUnit: { not: null, not: "" } },
      orderBy: { _count: { usageUnit: 'desc' } },
    });
    let ipUsageByUnit: TopNItemCount[] = usageUnitGroups
      .map((g, index) => ({ item: g.usageUnit!, count: g._count.usageUnit, fill: CHART_COLORS_REMAINDER[index % CHART_COLORS_REMAINDER.length] }))
      .slice(0, DASHBOARD_TOP_N_COUNT);
    const otherUsageUnitCount = usageUnitGroups.slice(DASHBOARD_TOP_N_COUNT).reduce((sum, g) => sum + g._count.usageUnit, 0);
    if (otherUsageUnitCount > 0) ipUsageByUnit.push({ item: "其他", count: otherUsageUnitCount, fill: CHART_COLORS_REMAINDER[DASHBOARD_TOP_N_COUNT % CHART_COLORS_REMAINDER.length] });
    const unspecifiedUsageUnitCount = await prisma.iPAddress.count({ where: { OR: [{ usageUnit: null }, { usageUnit: "" }] } });
    if (unspecifiedUsageUnitCount > 0) {
        const unspecifiedExists = ipUsageByUnit.find(item => item.item === "未指定");
        if (!unspecifiedExists && ipUsageByUnit.length < DASHBOARD_TOP_N_COUNT + (otherUsageUnitCount > 0 ? 1: 0) ) ipUsageByUnit.push({ item: "未指定", count: unspecifiedUsageUnitCount, fill: CHART_COLORS_REMAINDER[(ipUsageByUnit.length) % CHART_COLORS_REMAINDER.length]});
        else if (!unspecifiedExists && ipUsageByUnit.length >= DASHBOARD_TOP_N_COUNT + (otherUsageUnitCount > 0 ? 1: 0)) {
            const otherIndex = ipUsageByUnit.findIndex(item => item.item === "其他");
            if (otherIndex !== -1) ipUsageByUnit[otherIndex].count += unspecifiedUsageUnitCount;
            else ipUsageByUnit.push({ item: "其他", count: unspecifiedUsageUnitCount, fill: CHART_COLORS_REMAINDER[(ipUsageByUnit.length) % CHART_COLORS_REMAINDER.length]});
        }
    }
    ipUsageByUnit.sort((a, b) => { if (a.item === "其他" || a.item === "未指定") return 1; if (b.item === "其他" || b.item === "未指定") return -1; return b.count - a.count; });

    const operatorGroups = await prisma.iPAddress.groupBy({
      by: ['selectedOperatorName'],
      _count: { selectedOperatorName: true },
      where: { selectedOperatorName: { not: null, not: "" } },
      orderBy: { _count: { selectedOperatorName: 'desc' } },
    });
     let ipUsageByOperator: TopNItemCount[] = operatorGroups
      .map((g, index) => ({ item: g.selectedOperatorName!, count: g._count.selectedOperatorName, fill: CHART_COLORS_REMAINDER[index % CHART_COLORS_REMAINDER.length] }))
      .slice(0, DASHBOARD_TOP_N_COUNT);
    const otherOperatorCount = operatorGroups.slice(DASHBOARD_TOP_N_COUNT).reduce((sum, g) => sum + g._count.selectedOperatorName, 0);
    if (otherOperatorCount > 0) ipUsageByOperator.push({ item: "其他", count: otherOperatorCount, fill: CHART_COLORS_REMAINDER[DASHBOARD_TOP_N_COUNT % CHART_COLORS_REMAINDER.length] });
    const unspecifiedOperatorCount = await prisma.iPAddress.count({ where: { OR: [{ selectedOperatorName: null }, { selectedOperatorName: "" }] } });
    if (unspecifiedOperatorCount > 0) {
        const unspecifiedOpExists = ipUsageByOperator.find(item => item.item === "未指定");
        if (!unspecifiedOpExists && ipUsageByOperator.length < DASHBOARD_TOP_N_COUNT + (otherOperatorCount > 0 ? 1:0) ) ipUsageByOperator.push({ item: "未指定", count: unspecifiedOperatorCount, fill: CHART_COLORS_REMAINDER[(ipUsageByOperator.length) % CHART_COLORS_REMAINDER.length]});
        else if (!unspecifiedOpExists && ipUsageByOperator.length >= DASHBOARD_TOP_N_COUNT + (otherOperatorCount > 0 ? 1:0)) {
            const otherOpIndex = ipUsageByOperator.findIndex(item => item.item === "其他");
            if (otherOpIndex !== -1) ipUsageByOperator[otherOpIndex].count += unspecifiedOperatorCount;
            else ipUsageByOperator.push({ item: "其他", count: unspecifiedOperatorCount, fill: CHART_COLORS_REMAINDER[(ipUsageByOperator.length) % CHART_COLORS_REMAINDER.length]});
        }
    }
    ipUsageByOperator.sort((a, b) => { if (a.item === "其他" || a.item === "未指定") return 1; if (b.item === "其他" || b.item === "未指定") return -1; return b.count - a.count; });

    const allVlansFromDb = await prisma.vLAN.findMany({ include: { _count: { select: { subnets: true, ipAddresses: true } } }, orderBy: { vlanNumber: 'asc' } });
    const vlanResourceCounts: VLANResourceInfo[] = allVlansFromDb.map(vlan => ({ id: vlan.id, vlanNumber: vlan.vlanNumber, name: vlan.name || undefined, resourceCount: (vlan._count?.subnets || 0) + (vlan._count?.ipAddresses || 0), }));
    const busiestVlans = [...vlanResourceCounts].sort((a, b) => b.resourceCount - a.resourceCount).slice(0, DASHBOARD_TOP_N_COUNT);

    const allSubnets = await prisma.subnet.findMany();
    const subnetsWithUtilization: SubnetUtilizationInfo[] = await Promise.all( allSubnets.map(async (subnet) => ({ id: subnet.id, cidr: subnet.cidr, name: subnet.name || undefined, utilization: await calculateSubnetUtilization(subnet.id) })) );
    const subnetsNeedingAttention = subnetsWithUtilization.filter(s => s.utilization > 80).sort((a, b) => b.utilization - a.utilization).slice(0, DASHBOARD_TOP_N_COUNT);

    const recentAuditLogs = await prisma.auditLog.findMany({ orderBy: { timestamp: 'desc' }, take: DASHBOARD_AUDIT_LOG_COUNT });
    const appAuditLogs: AppAuditLog[] = recentAuditLogs.map(log => ({ id: log.id, userId: log.userId || undefined, username: log.username || '系统', action: log.action, timestamp: log.timestamp.toISOString(), details: log.details || undefined }));

    const dashboardData: DashboardData = {
      totalIpCount, ipStatusCounts, totalVlanCount, totalSubnetCount,
      ipUsageByUnit, ipUsageByOperator, busiestVlans,
      subnetsNeedingAttention, recentAuditLogs: appAuditLogs,
    };
    revalidatePath("/dashboard"); 
    return { success: true, data: dashboardData };
  } catch (error: unknown) {
    logger.error(actionName, error as Error, { context: actionName });
    return { success: false, error: createActionErrorResponse(error, actionName) };
  }
}

