
"use server";

import { revalidatePath } from "next/cache";
import type { Subnet as AppSubnet, VLAN as AppVLAN, IPAddress as AppIPAddress, User as AppUser, Role as AppRole, AuditLog as AppAuditLog, IPAddressStatus as AppIPAddressStatusType, RoleName as AppRoleNameType, PermissionId as AppPermissionIdType, Permission as AppPermission, SubnetQueryResult, VlanQueryResult, BatchDeleteResult, BatchOperationFailure, SubnetFreeIpDetails, PaginatedResponse, ISP as AppISP, Device as AppDevice, DeviceType as AppDeviceType } from '@/types';
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
import { Prisma, type IPAddress as PrismaIPAddress, type Subnet as PrismaSubnet, type VLAN as PrismaVLAN, DeviceType as PrismaDeviceType } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';

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
const DEFAULT_QUERY_PAGE_SIZE = 10;

interface FetchParams {
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
  const actionName = 'loginAction';
  const { email, password } = payload;
  if (!email || !password) { return { success: false, message: "邮箱和密码是必需的。" }; }
  try {
    const userFromDb = await prisma.user.findUnique({ where: { email }, include: { role: { include: { permissions: true } } } });
    if (!userFromDb) { logger.error(`[${actionName}] Login attempt failed: User not found for email ${email}.`, new AuthError(`User with email ${email} not found.`), { email }, actionName); return { success: false, message: "邮箱或密码无效。" }; }
    if (userFromDb.password !== password) { logger.warn(`[${actionName}] Login attempt failed: Invalid password for user ${userFromDb.username}.`, new AuthError('Invalid password attempt.'), { userId: userFromDb.id }, actionName); return { success: false, message: "邮箱或密码无效。" }; }
    if (!userFromDb.role || !userFromDb.role.name) { logger.error(`[${actionName}] User ${userFromDb.id} (${userFromDb.username}) is missing role or role name.`, new AppError('User role data incomplete'), { userId: userFromDb.id }, actionName); return { success: false, message: "用户角色信息不完整。" }; }
    let permissionsList: AppPermissionIdType[] = []; if (Array.isArray(userFromDb.role.permissions)) { permissionsList = userFromDb.role.permissions.map(p => p.id as AppPermissionIdType); } else { logger.error(`[${actionName}] User ${userFromDb.id}'s role permissions data incomplete.`, new AppError('User role permissions data malformed'), { userId: userFromDb.id, roleId: userFromDb.role.id }, actionName); }
    await prisma.user.update({ where: { id: userFromDb.id }, data: { lastLogin: new Date() } });
    const loggedInUser: FetchedUserDetails = { id: userFromDb.id, username: userFromDb.username, email: userFromDb.email, roleId: userFromDb.roleId, roleName: userFromDb.role.name as AppRoleNameType, avatar: userFromDb.avatar || '/images/avatars/default_avatar.png', permissions: permissionsList, lastLogin: userFromDb.lastLogin?.toISOString() };
    await prisma.auditLog.create({ data: { userId: userFromDb.id, username: userFromDb.username, action: 'user_login', details: `用户 ${userFromDb.username} 成功登录。` } });
    return { success: true, user: loggedInUser };
  } catch (error) { logger.error(`[${actionName}] Login action unexpected error`, error as Error, { email }, actionName); return { success: false, message: "登录过程中发生意外错误。" }; }
}

export async function fetchCurrentUserDetailsAction(userId: string): Promise<FetchedUserDetails | null> {
  const actionName = 'fetchCurrentUserDetailsAction';
  if (!userId) { return null; }
  try {
    const userFromDb = await prisma.user.findUnique({ where: { id: userId }, include: { role: { include: { permissions: true } } } });
    if (!userFromDb) { return null; }
    if (!userFromDb.role || !userFromDb.role.name) { logger.error(`[${actionName}] User ${userId} is missing valid role or role name.`, new AppError("User role data invalid"), { userId }, actionName); return null; }
    let permissionsList: AppPermissionIdType[] = []; if (Array.isArray(userFromDb.role.permissions)) { permissionsList = userFromDb.role.permissions.map(p => p.id as AppPermissionIdType); } else { logger.error(`[${actionName}] User ${userFromDb.id}'s role permissions data malformed.`, new AppError('User role permissions data malformed'), { userId: userFromDb.id, roleId: userFromDb.role.id }, actionName); }
    const fetchedUser: FetchedUserDetails = { id: userFromDb.id, username: userFromDb.username, email: userFromDb.email, roleId: userFromDb.roleId, roleName: userFromDb.role.name as AppRoleNameType, avatar: userFromDb.avatar || '/images/avatars/default_avatar.png', permissions: permissionsList, lastLogin: userFromDb.lastLogin?.toISOString() || undefined };
    return fetchedUser;
  } catch (error) { logger.error(`[${actionName}] Error for userId ${userId}`, error as Error, { userId }, actionName); return null; }
}

// Subnet Actions
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
      await prisma.subnet.findMany({ where: whereClause, orderBy: { cidr: 'asc' }, skip, take: pageSize }) :
      await prisma.subnet.findMany({ where: whereClause, orderBy: { cidr: 'asc' } });
    const appSubnets: AppSubnet[] = await Promise.all(subnetsFromDb.map(async (subnet) => {
      if (!subnet.cidr || typeof subnet.cidr !== 'string' || subnet.cidr.trim() === "") {
        logger.warn(`[${actionName}] Subnet ID ${subnet.id} has invalid CIDR.`, undefined, { subnetId: subnet.id, cidrFromDb: subnet.cidr });
        return { ...subnet, cidr: subnet.cidr || "Invalid/Missing CIDR", networkAddress: subnet.networkAddress || "N/A", subnetMask: subnet.subnetMask || "N/A", ipRange: subnet.ipRange || undefined, name: subnet.name || undefined, dhcpEnabled: subnet.dhcpEnabled ?? false, vlanId: subnet.vlanId || undefined, description: subnet.description || undefined, utilization: 0 };
      }
      const subnetProperties = getSubnetPropertiesFromCidr(subnet.cidr);
      let utilization = 0; let networkAddress = subnet.networkAddress; let subnetMask = subnet.subnetMask; let ipRange: string | null = subnet.ipRange;
      if (subnetProperties && typeof subnetProperties.prefix === 'number') {
        const totalUsableIps = getUsableIpCount(subnetProperties.prefix);
        const allocatedIpsCount = await prisma.iPAddress.count({ where: { subnetId: subnet.id, status: "allocated" } });
        if (totalUsableIps > 0) { utilization = Math.round((allocatedIpsCount / totalUsableIps) * 100); }
        networkAddress = subnetProperties.networkAddress; subnetMask = subnetProperties.subnetMask; ipRange = subnetProperties.ipRange !== undefined ? subnetProperties.ipRange : null;
      } else { logger.warn(`[${actionName}] Could not parse CIDR for subnet ID ${subnet.id}.`, undefined, { subnetId: subnet.id, cidr: subnet.cidr }); networkAddress = subnet.networkAddress || "N/A"; subnetMask = subnet.subnetMask || "N/A"; ipRange = subnet.ipRange || null; }
      return { ...subnet, networkAddress, subnetMask, ipRange: ipRange || undefined, name: subnet.name || undefined, dhcpEnabled: subnet.dhcpEnabled ?? false, vlanId: subnet.vlanId || undefined, description: subnet.description || undefined, utilization };
    }));
    return { data: appSubnets, totalCount: params?.page && params?.pageSize ? totalCount : appSubnets.length, currentPage: page, totalPages: params?.page && params?.pageSize ? totalPages : 1, pageSize };
  } catch (error: unknown) { logger.error(`Error in ${actionName}`, error as Error, undefined, actionName); if (error instanceof AppError) throw error; throw new AppError("获取子网数据时发生服务器错误。", 500, "GET_SUBNETS_FAILED", "无法加载子网数据。"); }
}

export interface CreateSubnetData { cidr: string; name?: string | null | undefined; dhcpEnabled?: boolean | null | undefined; vlanId?: string | null | undefined; description?: string | null | undefined; }
export async function createSubnetAction(data: CreateSubnetData, performingUserId?: string): Promise<ActionResponse<AppSubnet>> {
  const actionName = 'createSubnetAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    validateCidrInput(data.cidr, 'cidr');
    const newSubnetProperties = getSubnetPropertiesFromCidr(data.cidr);
    if (!newSubnetProperties) { throw new AppError('Failed to parse CIDR properties.', 500, 'CIDR_PARSE_UNEXPECTED_ERROR', '无法解析有效的 CIDR 属性。'); }
    const canonicalCidrToStore = data.cidr;
    if (await prisma.subnet.findUnique({ where: { cidr: canonicalCidrToStore } })) { throw new ResourceError(`子网 ${canonicalCidrToStore} 已存在。`, 'SUBNET_ALREADY_EXISTS', `子网 ${canonicalCidrToStore} 已存在。`, 'cidr'); }
    const allExistingSubnets = await prisma.subnet.findMany();
    for (const existingSub of allExistingSubnets) { if (doSubnetsOverlap(newSubnetProperties, getSubnetPropertiesFromCidr(existingSub.cidr)!)) { throw new ResourceError(`子网 ${canonicalCidrToStore} 与现有子网 ${existingSub.cidr} 重叠。`, 'SUBNET_OVERLAP_ERROR', `子网 ${canonicalCidrToStore} 与现有子网 ${existingSub.cidr} 重叠。`, 'cidr'); } }
    const createPayload: Prisma.SubnetCreateInput = { cidr: canonicalCidrToStore, networkAddress: newSubnetProperties.networkAddress, subnetMask: newSubnetProperties.subnetMask, ipRange: newSubnetProperties.ipRange || null, name: (data.name === undefined || data.name === "") ? null : data.name, dhcpEnabled: data.dhcpEnabled ?? false, description: (data.description === undefined || data.description === "") ? null : data.description, };
    if (data.vlanId) { if (!(await prisma.vLAN.findUnique({ where: { id: data.vlanId } }))) { throw new NotFoundError(`VLAN ID: ${data.vlanId}`, `选择的 VLAN 不存在。`, 'vlanId'); } createPayload.vlan = { connect: { id: data.vlanId } }; }
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
    if (!subnetToUpdate) { throw new NotFoundError(`子网 ID: ${id}`, `要更新的子网未找到。`); }
    const updateData: Prisma.SubnetUpdateInput = {};
    const originalCidrForLog = subnetToUpdate.cidr; let newCanonicalCidrForLog = subnetToUpdate.cidr;
    if (data.cidr && data.cidr !== subnetToUpdate.cidr) {
      validateCidrInput(data.cidr, 'cidr');
      const newSubnetProperties = getSubnetPropertiesFromCidr(data.cidr);
      if (!newSubnetProperties) { throw new AppError('Failed to parse new CIDR properties.', 500, 'CIDR_PARSE_UNEXPECTED_ERROR', '无法解析新的有效 CIDR 属性。'); }
      newCanonicalCidrForLog = data.cidr;
      if (await prisma.subnet.findFirst({ where: { cidr: newCanonicalCidrForLog, NOT: { id } } })) { throw new ResourceError(`子网 ${newCanonicalCidrForLog} 已存在。`, 'SUBNET_ALREADY_EXISTS', `新的 CIDR ${newCanonicalCidrForLog} 与现有子网冲突。`, 'cidr'); }
      const otherExistingSubnets = await prisma.subnet.findMany({ where: { NOT: { id } } });
      for (const existingSub of otherExistingSubnets) { if (doSubnetsOverlap(newSubnetProperties, getSubnetPropertiesFromCidr(existingSub.cidr)!)) { throw new ResourceError(`更新后的子网 ${newCanonicalCidrForLog} 与现有子网 ${existingSub.cidr} 重叠。`, 'SUBNET_OVERLAP_ERROR', `更新后的子网 ${newCanonicalCidrForLog} 与现有子网 ${existingSub.cidr} 重叠。`, 'cidr'); } }
      updateData.cidr = newCanonicalCidrForLog; updateData.networkAddress = newSubnetProperties.networkAddress; updateData.subnetMask = newSubnetProperties.subnetMask; updateData.ipRange = newSubnetProperties.ipRange || null;
      const allocatedIpsInSubnet = await prisma.iPAddress.findMany({ where: { subnetId: id, status: "allocated" } });
      const ipsToDisassociateDetails: string[] = [];
      for (const ip of allocatedIpsInSubnet) { if (!isIpInCidrRange(ip.ipAddress, newSubnetProperties)) { await prisma.iPAddress.update({ where: { id: ip.id }, data: { status: "free", allocatedTo: null, subnet: { disconnect: true }, directVlan: { disconnect: true } } }); ipsToDisassociateDetails.push(`${ip.ipAddress} (原状态: ${ip.status})`); } }
      if (ipsToDisassociateDetails.length > 0) { await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'auto_handle_ip_on_subnet_resize', details: `子网 ${originalCidrForLog} 调整大小为 ${newCanonicalCidrForLog}。已解除关联的 IP：${ipsToDisassociateDetails.join('; ')}。` } }); }
    }
    if (data.hasOwnProperty('name')) { updateData.name = (data.name === undefined || data.name === "") ? null : data.name; }
    if (data.hasOwnProperty('dhcpEnabled')) { updateData.dhcpEnabled = data.dhcpEnabled ?? false; }
    if (data.hasOwnProperty('vlanId')) { const newVlanId = data.vlanId; if (newVlanId === null) { /* handle disconnect */ } else if (newVlanId) { if (!(await prisma.vLAN.findUnique({ where: { id: newVlanId } }))) { throw new NotFoundError(`VLAN ID: ${newVlanId}`, `选择的 VLAN 不存在。`, 'vlanId'); } updateData.vlan = { connect: { id: newVlanId } }; } else { updateData.vlan = { disconnect: true };} }
    if (data.hasOwnProperty('description')) { updateData.description = (data.description === undefined || data.description === "") ? null : data.description; }
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
  const subnet = await prisma.subnet.findUnique({ where: { id: subnetId } });
  if (!subnet || !subnet.cidr) return 0;
  const subnetProperties = getSubnetPropertiesFromCidr(subnet.cidr);
  if (!subnetProperties || typeof subnetProperties.prefix !== 'number') return 0;
  const totalUsableIps = getUsableIpCount(subnetProperties.prefix);
  if (totalUsableIps === 0) return 0;
  const allocatedIpsCount = await prisma.iPAddress.count({ where: { subnetId: subnetId, status: "allocated" } });
  return Math.round((allocatedIpsCount / totalUsableIps) * 100);
}

export async function deleteSubnetAction(id: string, performingUserId?: string): Promise<ActionResponse> {
  const actionName = 'deleteSubnetAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    const subnetToDelete = await prisma.subnet.findUnique({ where: { id }, include: { vlan: true } });
    if (!subnetToDelete) { throw new NotFoundError(`子网 ID: ${id}`, `要删除的子网未找到。`); }
    if (subnetToDelete.vlanId && subnetToDelete.vlanId.trim() !== "") { const vlanMsg = subnetToDelete.vlan ? `VLAN ${subnetToDelete.vlan.vlanNumber}` : `VLAN (ID: ${subnetToDelete.vlanId})`; throw new ResourceError(`子网 ${subnetToDelete.cidr} 已关联到 ${vlanMsg}。`, 'SUBNET_HAS_VLAN_ASSOCIATION', `无法删除子网 ${subnetToDelete.cidr}，因为它已关联到 ${vlanMsg}。`); }
    const allocatedIpsCount = await prisma.iPAddress.count({ where: { subnetId: id, status: 'allocated' } });
    if (allocatedIpsCount > 0) { throw new ResourceError(`子网 ${subnetToDelete.cidr} 中仍有 ${allocatedIpsCount} 个已分配的 IP。`, 'SUBNET_HAS_ALLOCATED_IPS', `无法删除子网 ${subnetToDelete.cidr}，因为它仍包含已分配的 IP 地址。`); }
    const reservedIpsCount = await prisma.iPAddress.count({ where: { subnetId: id, status: 'reserved' } });
    if (reservedIpsCount > 0) { throw new ResourceError(`子网 ${subnetToDelete.cidr} 中仍有 ${reservedIpsCount} 个预留的 IP。`, 'SUBNET_HAS_RESERVED_IPS', `无法删除子网 ${subnetToDelete.cidr}，因为它仍包含预留状态的 IP 地址。`); }
    const freeIpsInSubnet = await prisma.iPAddress.findMany({ where: { subnetId: id, status: 'free' } });
    for (const ip of freeIpsInSubnet) { await prisma.iPAddress.update({ where: { id: ip.id }, data: { subnet: { disconnect: true }, directVlan: { disconnect: true } } }); await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'auto_disassociate_ip_on_subnet_delete', details: `IP ${ip.ipAddress} 已从子网 ${subnetToDelete.cidr} 解除关联，因为子网被删除。` } }); }
    await prisma.subnet.delete({ where: { id } });
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'delete_subnet', details: `删除了子网 ${subnetToDelete.cidr}` } });
    revalidatePath("/subnets"); revalidatePath("/ip-addresses"); revalidatePath("/dashboard"); revalidatePath("/query");
    return { success: true };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

export async function batchDeleteSubnetsAction(ids: string[], performingUserId?: string): Promise<BatchDeleteResult> {
  const actionName = 'batchDeleteSubnetsAction';
  const auditUser = await getAuditUserInfo(performingUserId);
  let successCount = 0; const failureDetails: BatchOperationFailure[] = []; const deletedSubnetCidrs: string[] = [];
  for (const id of ids) {
    try {
      const subnetToDelete = await prisma.subnet.findUnique({ where: { id }, include: { vlan: true } });
      if (!subnetToDelete) { failureDetails.push({ id, itemIdentifier: `ID ${id}`, error: '子网未找到。' }); continue; }
      if (subnetToDelete.vlanId && subnetToDelete.vlanId.trim() !== "") { const vlanMsg = subnetToDelete.vlan ? `VLAN ${subnetToDelete.vlan.vlanNumber}` : `VLAN (ID: ${subnetToDelete.vlanId})`; throw new ResourceError(`子网 ${subnetToDelete.cidr} 已关联到 ${vlanMsg}。`, 'SUBNET_HAS_VLAN_ASSOCIATION_BATCH', `子网 ${subnetToDelete.cidr} 已关联到 ${vlanMsg}。`); }
      if (await prisma.iPAddress.count({ where: { subnetId: id, status: 'allocated' } }) > 0) { throw new ResourceError(`子网 ${subnetToDelete.cidr} 中仍有已分配的 IP。`, 'SUBNET_HAS_ALLOCATED_IPS_BATCH', `子网 ${subnetToDelete.cidr} 仍包含已分配的 IP 地址。`); }
      if (await prisma.iPAddress.count({ where: { subnetId: id, status: 'reserved' } }) > 0) { throw new ResourceError(`子网 ${subnetToDelete.cidr} 中仍有预留的 IP。`, 'SUBNET_HAS_RESERVED_IPS_BATCH', `子网 ${subnetToDelete.cidr} 仍包含预留的 IP 地址。`); }
      for (const ip of await prisma.iPAddress.findMany({ where: { subnetId: id, status: 'free' } })) { await prisma.iPAddress.update({ where: { id: ip.id }, data: { subnet: { disconnect: true }, directVlan: { disconnect: true } } }); }
      await prisma.subnet.delete({ where: { id } });
      deletedSubnetCidrs.push(subnetToDelete.cidr); successCount++;
    } catch (error: unknown) { const errRes = createActionErrorResponse(error, `${actionName}_single`); failureDetails.push({ id, itemIdentifier: (await prisma.subnet.findUnique({ where: { id } }))?.cidr || `ID ${id}`, error: errRes.userMessage }); }
  }
  if (deletedSubnetCidrs.length > 0) { await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'batch_delete_subnet', details: `批量删除了 ${deletedSubnetCidrs.length} 个子网: ${deletedSubnetCidrs.join(', ')}。失败 ${failureDetails.length} 个。` } }); revalidatePath("/subnets"); revalidatePath("/ip-addresses"); revalidatePath("/dashboard"); revalidatePath("/query"); }
  return { successCount, failureCount: failureDetails.length, failureDetails };
}

// VLAN Actions
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
    if (isNaN(data.vlanNumber) || data.vlanNumber < 1 || data.vlanNumber > 4094) { throw new ValidationError("VLAN 号码必须是 1 到 4094 之间的整数。", 'vlanNumber', data.vlanNumber); }
    if (await prisma.vLAN.findUnique({ where: { vlanNumber: data.vlanNumber } })) { throw new ResourceError(`VLAN ${data.vlanNumber} 已存在。`, 'VLAN_EXISTS', `VLAN ${data.vlanNumber} 已存在。`, 'vlanNumber'); }
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
      if (isNaN(vlanInput.vlanNumber) || vlanInput.vlanNumber < 1 || vlanInput.vlanNumber > 4094) { throw new ValidationError("VLAN 号码必须是 1 到 4094 之间的整数。", 'vlanNumber', vlanInput.vlanNumber); }
      if (await prisma.vLAN.findUnique({ where: { vlanNumber: vlanInput.vlanNumber } })) { throw new ResourceError(`VLAN ${vlanInput.vlanNumber} 已存在。`, 'VLAN_EXISTS', undefined, 'startVlanNumber'); }
      const newVlan = await prisma.vLAN.create({ data: { vlanNumber: vlanInput.vlanNumber, name: vlanInput.name || null, description: vlanInput.description || null } });
      createdVlanSummaries.push(`${newVlan.vlanNumber}${newVlan.name ? ` (${newVlan.name})` : ''}`); successCount++;
    } catch (e: unknown) { const errRes = createActionErrorResponse(e, 'batchCreateVLANsAction_single'); failureDetails.push({ vlanNumberAttempted: vlanInput.vlanNumber, error: errRes.userMessage }); }
  }
  if (createdVlanSummaries.length > 0) { await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'batch_create_vlan', details: `批量创建了 ${createdVlanSummaries.length} 个 VLAN：${createdVlanSummaries.join(', ')}。失败：${failureDetails.length} 个。` } }); }
  if (successCount > 0) { revalidatePath("/vlans"); revalidatePath("/query"); }
  return { successCount, failureDetails };
}

export async function updateVLANAction(id: string, data: Partial<Omit<AppVLAN, "id" | "subnetCount">>, performingUserId?: string): Promise<ActionResponse<AppVLAN>> {
  const actionName = 'updateVLANAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    const vlanToUpdate = await prisma.vLAN.findUnique({ where: { id } });
    if (!vlanToUpdate) { throw new NotFoundError(`VLAN ID: ${id}`, `要更新的 VLAN 未找到。`); }
    const updatePayload: Prisma.VLANUpdateInput = {};
    if (data.hasOwnProperty('vlanNumber') && data.vlanNumber !== undefined) { if (isNaN(data.vlanNumber) || data.vlanNumber < 1 || data.vlanNumber > 4094) { throw new ValidationError("VLAN 号码必须是 1 到 4094 之间的整数。", 'vlanNumber', data.vlanNumber); } if (data.vlanNumber !== vlanToUpdate.vlanNumber) { const existingVLAN = await prisma.vLAN.findUnique({ where: { vlanNumber: data.vlanNumber } }); if (existingVLAN && existingVLAN.id !== id) { throw new ResourceError(`已存在另一个 VLAN 号码为 ${data.vlanNumber} 的 VLAN。`, 'VLAN_EXISTS', `VLAN 号码 ${data.vlanNumber} 已被其他 VLAN 使用。`, 'vlanNumber'); } } updatePayload.vlanNumber = data.vlanNumber; }
    if (data.hasOwnProperty('name')) { updatePayload.name = (data.name === "" || data.name === undefined) ? null : data.name; }
    if (data.hasOwnProperty('description')) { updatePayload.description = (data.description === "" || data.description === undefined) ? null : data.description; }
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
    const vlanToDelete = await prisma.vLAN.findUnique({ where: { id } });
    if (!vlanToDelete) { throw new NotFoundError(`VLAN ID: ${id}`, `要删除的 VLAN 未找到。`); }
    const subnetsUsingVlanCount = await prisma.subnet.count({ where: { vlanId: id } });
    if (subnetsUsingVlanCount > 0) { throw new ResourceError(`无法删除 VLAN ${vlanToDelete.vlanNumber}。它已分配给 ${subnetsUsingVlanCount} 个子网。`, 'VLAN_IN_USE_SUBNET', `无法删除 VLAN ${vlanToDelete.vlanNumber}，因为它仍被 ${subnetsUsingVlanCount} 个子网使用。`); }
    const ipsUsingVlanDirectlyCount = await prisma.iPAddress.count({ where: { directVlanId: id } });
    if (ipsUsingVlanDirectlyCount > 0) { throw new ResourceError(`无法删除 VLAN ${vlanToDelete.vlanNumber}。它已直接分配给 ${ipsUsingVlanDirectlyCount} 个 IP 地址。`, 'VLAN_IN_USE_IP', `无法删除 VLAN ${vlanToDelete.vlanNumber}，因为它仍被 ${ipsUsingVlanDirectlyCount} 个 IP 地址直接使用。`); }
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
      const vlanToDelete = await prisma.vLAN.findUnique({ where: { id } });
      if (!vlanToDelete) { failureDetails.push({ id, itemIdentifier: `ID ${id}`, error: 'VLAN 未找到。' }); continue; }
      if (await prisma.subnet.count({ where: { vlanId: id } }) > 0) { throw new ResourceError(`VLAN ${vlanToDelete.vlanNumber} 已分配给子网。`, 'VLAN_IN_USE_SUBNET_BATCH', `VLAN ${vlanToDelete.vlanNumber} 仍被子网使用。`); }
      if (await prisma.iPAddress.count({ where: { directVlanId: id } }) > 0) { throw new ResourceError(`VLAN ${vlanToDelete.vlanNumber} 已直接分配给 IP 地址。`, 'VLAN_IN_USE_IP_BATCH', `VLAN ${vlanToDelete.vlanNumber} 仍被 IP 地址直接使用。`); }
      await prisma.vLAN.delete({ where: { id } });
      deletedVlanSummaries.push(`${vlanToDelete.vlanNumber}${vlanToDelete.name ? ` (${vlanToDelete.name})` : ''}`); successCount++;
    } catch (error: unknown) { const errRes = createActionErrorResponse(error, `${actionName}_single`); failureDetails.push({ id, itemIdentifier: (await prisma.vLAN.findUnique({ where: { id } }))?.vlanNumber.toString() || `ID ${id}`, error: errRes.userMessage }); }
  }
  if (deletedVlanSummaries.length > 0) { await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'batch_delete_vlan', details: `批量删除了 ${deletedVlanSummaries.length} 个 VLAN: ${deletedVlanSummaries.join(', ')}。失败 ${failureDetails.length} 个。` } }); revalidatePath("/vlans"); revalidatePath("/subnets"); revalidatePath("/ip-addresses"); revalidatePath("/query"); }
  return { successCount, failureCount: failureDetails.length, failureDetails };
}

// IP Address Actions
type PrismaIPAddressWithRelations = Prisma.IPAddressGetPayload<{ include: { subnet: { include: { vlan: true } }; directVlan: true; }; }>;
export type AppIPAddressWithRelations = AppIPAddress & {
  subnet?: { id: string; cidr: string; name?: string; networkAddress: string; vlan?: { vlanNumber: number; name?: string; } | null } | null;
  directVlan?: { vlanNumber: number; name?: string; } | null; 
};

export async function getIPAddressesAction(params?: FetchParams): Promise<PaginatedResponse<AppIPAddressWithRelations>> {
  const page = params?.page || 1; const pageSize = params?.pageSize || DEFAULT_PAGE_SIZE; const skip = (page - 1) * pageSize;
  const whereClause: Prisma.IPAddressWhereInput = {};
  if (params?.subnetId) { whereClause.subnetId = params.subnetId; }
  if (params?.status && params.status !== 'all') { whereClause.status = params.status as AppIPAddressStatusType; }
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
  }));
  return { data: appIps, totalCount: finalTotalCount, currentPage: page, totalPages: totalPages, pageSize: pageSize };
}

export async function createIPAddressAction(data: Omit<AppIPAddress, "id">, performingUserId?: string): Promise<ActionResponse<AppIPAddress>> {
  const actionName = 'createIPAddressAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    if (data.ipAddress.split('.').map(Number).some(p => isNaN(p) || p < 0 || p > 255) || data.ipAddress.split('.').length !== 4) { throw new ValidationError(`无效的 IP 地址格式: ${data.ipAddress}`, 'ipAddress', data.ipAddress); }
    if (!data.subnetId && (data.status === 'allocated' || data.status === 'reserved')) { throw new ValidationError("对于“已分配”或“预留”状态的 IP，必须选择一个子网。", 'subnetId'); }
    if (data.subnetId) {
      const targetSubnet = await prisma.subnet.findUnique({ where: { id: data.subnetId } });
      if (!targetSubnet) { throw new NotFoundError(`子网 ID: ${data.subnetId}`, `选择的子网不存在。`, 'subnetId'); }
      const parsedCidr = getSubnetPropertiesFromCidr(targetSubnet.cidr);
      if (!parsedCidr) { throw new AppError(`目标子网 ${targetSubnet.cidr} 的 CIDR 无效。`, 500, 'SUBNET_CIDR_INVALID_FOR_IP_CHECK'); }
      if (!isIpInCidrRange(data.ipAddress, parsedCidr)) { throw new ValidationError(`IP ${data.ipAddress} 不在子网 ${targetSubnet.cidr} 的范围内。`, 'ipAddress', data.ipAddress); }
      if (await prisma.iPAddress.findFirst({ where: { ipAddress: data.ipAddress, subnetId: data.subnetId } })) { throw new ResourceError(`IP ${data.ipAddress} 已存在于子网 ${targetSubnet.networkAddress} 中。`, 'IP_EXISTS_IN_SUBNET', `IP 地址 ${data.ipAddress} 已存在于所选子网中。`, 'ipAddress'); }
    } else { if (await prisma.iPAddress.findFirst({ where: { ipAddress: data.ipAddress, subnetId: null } })) { throw new ResourceError(`IP ${data.ipAddress} 已存在于全局池中。`, 'IP_EXISTS_GLOBALLY', `IP 地址 ${data.ipAddress} 已存在于全局池中。`, 'ipAddress'); } }
    const createPayload: Prisma.IPAddressCreateInput = {
      ipAddress: data.ipAddress, status: data.status as string, isGateway: data.isGateway ?? false,
      allocatedTo: data.allocatedTo || null, usageUnit: data.usageUnit || null, contactPerson: data.contactPerson || null, phone: data.phone || null,
      description: data.description || null, lastSeen: data.lastSeen ? new Date(data.lastSeen) : null
    };
    if (data.subnetId) { createPayload.subnet = { connect: { id: data.subnetId } }; }
    if (data.directVlanId) { if (!(await prisma.vLAN.findUnique({ where: { id: data.directVlanId } }))) { throw new NotFoundError(`VLAN ID: ${data.directVlanId}`, `为 IP 地址选择的 VLAN 不存在。`, 'directVlanId'); } createPayload.directVlan = { connect: { id: data.directVlanId } }; }
    const newIP = await prisma.iPAddress.create({ data: createPayload });
    const subnetCidr = data.subnetId ? (await prisma.subnet.findUnique({where: {id: data.subnetId}}))?.cidr : null;
    const subnetInfo = subnetCidr ? ` 在子网 ${subnetCidr} 中` : ' 在全局池中';
    const vlanInfoLog = data.directVlanId ? ` 使用 VLAN ${(await prisma.vLAN.findUnique({where: {id:data.directVlanId}}))?.vlanNumber}`: '';
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'create_ip_address', details: `创建了 IP ${newIP.ipAddress}${subnetInfo}${vlanInfoLog}，状态为 ${data.status}。` } });
    revalidatePath("/ip-addresses"); revalidatePath("/dashboard"); revalidatePath("/subnets"); revalidatePath("/query");
    const appIp: AppIPAddress = { ...newIP, isGateway: newIP.isGateway ?? false, subnetId: newIP.subnetId || undefined, directVlanId: newIP.directVlanId || undefined, allocatedTo: newIP.allocatedTo || undefined, usageUnit: newIP.usageUnit || undefined, contactPerson: newIP.contactPerson || undefined, phone: newIP.phone || undefined, description: newIP.description || undefined, lastSeen: newIP.lastSeen?.toISOString(), status: newIP.status as AppIPAddressStatusType };
    return { success: true, data: appIp };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

export interface BatchIpCreationResult { successCount: number; failureDetails: Array<{ ipAttempted: string; error: string; }>; }
export async function batchCreateIPAddressesAction(payload: { startIp: string; endIp: string; subnetId: string; directVlanId?: string | null; description?: string; status: AppIPAddressStatusType; isGateway?: boolean; usageUnit?:string; contactPerson?:string; phone?:string }, performingUserId?: string): Promise<BatchIpCreationResult> {
  const auditUser = await getAuditUserInfo(performingUserId); let successCount = 0; const failureDetails: BatchIpCreationResult['failureDetails'] = []; const createdIpAddressesForAudit: string[] = [];
  const { startIp, endIp, subnetId, directVlanId, description, status, isGateway, usageUnit, contactPerson, phone } = payload;
  try {
    const targetSubnet = await prisma.subnet.findUnique({ where: { id: subnetId } });
    if (!targetSubnet) { throw new NotFoundError(`子网 ID: ${subnetId}`, "未找到批量创建的目标子网。", 'subnetId'); }
    const parsedTargetSubnetCidr = getSubnetPropertiesFromCidr(targetSubnet.cidr);
    if (!parsedTargetSubnetCidr) { throw new AppError(`目标子网 ${targetSubnet.cidr} 的 CIDR 配置无效。`, 500, 'SUBNET_CIDR_INVALID_FOR_BATCH'); }
    if (directVlanId && directVlanId.trim() !== "") { if (!(await prisma.vLAN.findUnique({ where: { id: directVlanId } }))) { throw new NotFoundError(`VLAN ID: ${directVlanId}`, "为批量 IP 创建选择的 VLAN 不存在。", 'directVlanId'); } }
    let currentIpNum = ipToNumber(startIp); let endIpNum = ipToNumber(endIp);
    if (currentIpNum > endIpNum) { throw new ValidationError("起始 IP 必须小于或等于结束 IP。", 'endIp'); }
    for (; currentIpNum <= endIpNum; currentIpNum++) {
      const currentIpStr = numberToIp(currentIpNum);
      try {
        if (!isIpInCidrRange(currentIpStr, parsedTargetSubnetCidr)) { throw new ValidationError(`IP ${currentIpStr} 不在子网 ${targetSubnet.cidr} 的范围内。`, 'startIp/endIp', currentIpStr); }
        if (await prisma.iPAddress.findFirst({ where: { ipAddress: currentIpStr, subnetId: subnetId } })) { throw new ResourceError(`IP ${currentIpStr} 已存在于子网 ${targetSubnet.networkAddress} 中。`, 'IP_EXISTS_IN_SUBNET', undefined, 'startIp/endIp'); }
        const createPayload: Prisma.IPAddressCreateInput = { ipAddress: currentIpStr, status: status, isGateway: isGateway ?? false, allocatedTo: status === 'allocated' ? (description || '批量分配') : null, usageUnit: usageUnit||null, contactPerson: contactPerson||null, phone: phone||null, description: description || null };
        if (subnetId) { createPayload.subnet = { connect: { id: subnetId } }; }
        if (directVlanId && directVlanId.trim() !== "") { createPayload.directVlan = { connect: { id: directVlanId } }; }
        await prisma.iPAddress.create({ data: createPayload });
        createdIpAddressesForAudit.push(currentIpStr); successCount++;
      } catch (e: unknown) { const errRes = createActionErrorResponse(e, 'batchCreateIPAddressesAction_single'); failureDetails.push({ ipAttempted: currentIpStr, error: errRes.userMessage }); }
    }
  } catch (e: unknown) { const errRes = createActionErrorResponse(e, 'batchCreateIPAddressesAction_setup'); return { successCount: 0, failureDetails: [{ ipAttempted: `${startIp}-${endIp}`, error: errRes.userMessage }] }; }
  if (createdIpAddressesForAudit.length > 0) { await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'batch_create_ip_address', details: `批量创建了 ${createdIpAddressesForAudit.length} 个 IP 到子网 ${payload.subnetId}：${createdIpAddressesForAudit.join(', ')}。状态: ${status}。失败：${failureDetails.length} 个。` } }); }
  if (successCount > 0) { revalidatePath("/ip-addresses"); revalidatePath("/dashboard"); revalidatePath("/subnets"); revalidatePath("/query"); }
  return { successCount, failureDetails };
}

export interface UpdateIPAddressData { ipAddress?: string; subnetId?: string | undefined; directVlanId?: string | null | undefined; status?: AppIPAddressStatusType; isGateway?: boolean | null | undefined; allocatedTo?: string | null | undefined; usageUnit?: string | null | undefined; contactPerson?: string | null | undefined; phone?: string | null | undefined; description?: string | null | undefined; lastSeen?: string | null | undefined; }
export async function updateIPAddressAction(id: string, data: UpdateIPAddressData, performingUserId?: string): Promise<ActionResponse<AppIPAddress>> {
  const actionName = 'updateIPAddressAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    const ipToUpdate = await prisma.iPAddress.findUnique({ where: { id } });
    if (!ipToUpdate) { throw new NotFoundError(`IP 地址 ID: ${id}`, `要更新的 IP 地址未找到。`); }
    const updateData: Prisma.IPAddressUpdateInput = {}; let finalIpAddress = ipToUpdate.ipAddress;
    if (data.hasOwnProperty('ipAddress') && data.ipAddress !== undefined && data.ipAddress !== ipToUpdate.ipAddress) { if (data.ipAddress.split('.').map(Number).some(p => isNaN(p) || p < 0 || p > 255) || data.ipAddress.split('.').length !== 4) { throw new ValidationError(`无效的 IP 地址格式更新: ${data.ipAddress}`, 'ipAddress', data.ipAddress); } updateData.ipAddress = data.ipAddress; finalIpAddress = data.ipAddress; }
    if (data.hasOwnProperty('status') && data.status !== undefined) updateData.status = data.status as string;
    if (data.hasOwnProperty('isGateway')) updateData.isGateway = data.isGateway ?? false;
    if (data.hasOwnProperty('allocatedTo')) updateData.allocatedTo = (data.allocatedTo === undefined || data.allocatedTo === "") ? null : data.allocatedTo;
    if (data.hasOwnProperty('usageUnit')) updateData.usageUnit = (data.usageUnit === undefined || data.usageUnit === "") ? null : data.usageUnit;
    if (data.hasOwnProperty('contactPerson')) updateData.contactPerson = (data.contactPerson === undefined || data.contactPerson === "") ? null : data.contactPerson;
    if (data.hasOwnProperty('phone')) updateData.phone = (data.phone === undefined || data.phone === "") ? null : data.phone;
    if (data.hasOwnProperty('description')) updateData.description = (data.description === undefined || data.description === "") ? null : data.description;
    if (data.hasOwnProperty('lastSeen')) updateData.lastSeen = data.lastSeen ? new Date(data.lastSeen) : null;
    if (data.hasOwnProperty('directVlanId')) { const vlanIdToSet = data.directVlanId; if (vlanIdToSet === null) { updateData.directVlan = { disconnect: true }; } else if (vlanIdToSet) { if (!(await prisma.vLAN.findUnique({where: {id: vlanIdToSet}}))) { throw new NotFoundError(`VLAN ID: ${vlanIdToSet}`, `为 IP 地址选择的 VLAN 不存在。`, 'directVlanId'); } updateData.directVlan = { connect: { id: vlanIdToSet } }; } }
    const newSubnetId = data.hasOwnProperty('subnetId') ? (data.subnetId || undefined) : ipToUpdate.subnetId;
    const finalStatus = data.status ? data.status as string : ipToUpdate.status;
    if (data.hasOwnProperty('subnetId')) {
      if (newSubnetId) {
        const targetSubnet = await prisma.subnet.findUnique({ where: { id: newSubnetId } }); if (!targetSubnet) throw new NotFoundError(`子网 ID: ${newSubnetId}`, "目标子网不存在。", 'subnetId');
        const parsedCidr = getSubnetPropertiesFromCidr(targetSubnet.cidr); if (!parsedCidr) throw new AppError(`目标子网 ${targetSubnet.cidr} 的 CIDR 无效。`, 500, 'SUBNET_CIDR_INVALID_FOR_IP_CHECK');
        if (!isIpInCidrRange(finalIpAddress, parsedCidr)) { throw new ValidationError(`IP ${finalIpAddress} 不在子网 ${targetSubnet.cidr} 的范围内。`, 'ipAddress/subnetId', finalIpAddress); }
        if (finalIpAddress !== ipToUpdate.ipAddress || newSubnetId !== ipToUpdate.subnetId) { if (await prisma.iPAddress.findFirst({ where: { ipAddress: finalIpAddress, subnetId: newSubnetId, NOT: { id } } })) throw new ResourceError(`IP ${finalIpAddress} 已存在于子网 ${targetSubnet.networkAddress} 中。`, 'IP_EXISTS_IN_SUBNET', undefined, 'ipAddress'); }
        updateData.subnet = { connect: { id: newSubnetId } };
      } else {
        if (finalStatus === 'allocated' || finalStatus === 'reserved') { throw new ValidationError("对于“已分配”或“预留”状态的 IP，必须选择一个子网。", 'subnetId', finalStatus); }
        if (finalIpAddress !== ipToUpdate.ipAddress || ipToUpdate.subnetId !== null) { if (await prisma.iPAddress.findFirst({ where: { ipAddress: finalIpAddress, subnetId: null, NOT: { id } } })) throw new ResourceError(`IP ${finalIpAddress} 已存在于全局池中。`, 'IP_EXISTS_GLOBALLY', undefined, 'ipAddress'); }
        updateData.subnet = { disconnect: true };
      }
    } else if (newSubnetId && (finalIpAddress !== ipToUpdate.ipAddress)) {
      const currentSubnet = await prisma.subnet.findUnique({ where: { id: newSubnetId } }); if (!currentSubnet) throw new NotFoundError(`当前子网 ID: ${newSubnetId}`, "IP 的当前子网未找到。", 'subnetId');
      const parsedCidr = getSubnetPropertiesFromCidr(currentSubnet.cidr); if (!parsedCidr) throw new AppError(`当前子网 ${currentSubnet.cidr} 的 CIDR 无效。`, 500, 'SUBNET_CIDR_INVALID_FOR_IP_CHECK');
      if (!isIpInCidrRange(finalIpAddress, parsedCidr)) { throw new ValidationError(`新 IP ${finalIpAddress} 不在当前子网 ${currentSubnet.cidr} 的范围内。`, 'ipAddress', finalIpAddress); }
      if (await prisma.iPAddress.findFirst({ where: { ipAddress: finalIpAddress, subnetId: newSubnetId, NOT: { id } } })) { throw new ResourceError(`新 IP ${finalIpAddress} 已存在于子网 ${currentSubnet.networkAddress} 中。`, 'IP_EXISTS_IN_SUBNET', undefined, 'ipAddress'); }
    }
    const updatedIP = await prisma.iPAddress.update({ where: { id }, data: updateData });
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'update_ip_address', details: `更新了 IP ${updatedIP.ipAddress}` } });
    revalidatePath("/ip-addresses"); revalidatePath("/dashboard"); revalidatePath("/subnets"); revalidatePath("/query");
    const appIp: AppIPAddress = { ...updatedIP, isGateway: updatedIP.isGateway ?? false, subnetId: updatedIP.subnetId || undefined, directVlanId: updatedIP.directVlanId || undefined, allocatedTo: updatedIP.allocatedTo || undefined, usageUnit: updatedIP.usageUnit || undefined, contactPerson: updatedIP.contactPerson || undefined, phone: updatedIP.phone || undefined, description: updatedIP.description || undefined, lastSeen: updatedIP.lastSeen?.toISOString(), status: updatedIP.status as AppIPAddressStatusType };
    return { success: true, data: appIp };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

export async function deleteIPAddressAction(id: string, performingUserId?: string): Promise<ActionResponse> {
  const actionName = 'deleteIPAddressAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    const ipToDelete = await prisma.iPAddress.findUnique({ where: { id }, include: { directVlan: { select: { vlanNumber: true } } } });
    if (!ipToDelete) { throw new NotFoundError(`IP 地址 ID: ${id}`, `要删除的 IP 地址未找到。`); }
    if (ipToDelete.status === 'allocated' || ipToDelete.status === 'reserved') { throw new ResourceError(`IP 地址 ${ipToDelete.ipAddress} 状态为 "${ipToDelete.status}"。`, 'IP_ADDRESS_IN_USE_STATUS', `无法删除 IP 地址 ${ipToDelete.ipAddress}，因为其状态为 "${ipToDelete.status === 'allocated' ? '已分配' : '预留'}"。`); }
    if (ipToDelete.directVlanId) { const directVlanNumber = ipToDelete.directVlan?.vlanNumber || ipToDelete.directVlanId; throw new ResourceError(`IP 地址 ${ipToDelete.ipAddress} 直接关联到 VLAN ${directVlanNumber}。`, 'IP_ADDRESS_HAS_DIRECT_VLAN', `无法删除 IP 地址 ${ipToDelete.ipAddress}，因为它直接关联到 VLAN ${directVlanNumber}。`); }
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
      const ipToDelete = await prisma.iPAddress.findUnique({ where: { id }, include: { directVlan: { select: { vlanNumber: true } } } });
      if (!ipToDelete) { failureDetails.push({ id, itemIdentifier: `ID ${id}`, error: 'IP 地址未找到。' }); continue; }
      if (ipToDelete.status === 'allocated' || ipToDelete.status === 'reserved') { throw new ResourceError(`IP 地址 ${ipToDelete.ipAddress} 状态为 "${ipToDelete.status}"。`, 'IP_ADDRESS_IN_USE_STATUS_BATCH', `IP ${ipToDelete.ipAddress} 状态为 "${ipToDelete.status === 'allocated' ? '已分配' : '预留'}"。`); }
      if (ipToDelete.directVlanId) { const directVlanNumber = ipToDelete.directVlan?.vlanNumber || ipToDelete.directVlanId; throw new ResourceError(`IP 地址 ${ipToDelete.ipAddress} 直接关联到 VLAN ${directVlanNumber}。`, 'IP_ADDRESS_HAS_DIRECT_VLAN_BATCH', `IP ${ipToDelete.ipAddress} 直接关联到 VLAN ${directVlanNumber}。`); }
      await prisma.iPAddress.delete({ where: { id } });
      deletedIpAddresses.push(ipToDelete.ipAddress); successCount++;
    } catch (error: unknown) { const errRes = createActionErrorResponse(error, `${actionName}_single`); failureDetails.push({ id, itemIdentifier: (await prisma.iPAddress.findUnique({ where: { id } }))?.ipAddress || `ID ${id}`, error: errRes.userMessage }); }
  }
  if (deletedIpAddresses.length > 0) { await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'batch_delete_ip_address', details: `批量删除了 ${deletedIpAddresses.length} 个 IP 地址: ${deletedIpAddresses.join(', ')}。失败 ${failureDetails.length} 个。` } }); revalidatePath("/ip-addresses"); revalidatePath("/dashboard"); revalidatePath("/subnets"); revalidatePath("/query"); }
  return { successCount, failureCount: failureDetails.length, failureDetails };
}

// User Actions
export async function getUsersAction(params?: FetchParams): Promise<PaginatedResponse<FetchedUserDetails>> {
  const actionName = 'getUsersAction';
  try {
    const page = params?.page || 1;
    const pageSize = params?.pageSize || DEFAULT_PAGE_SIZE;
    const skip = (page - 1) * pageSize;
    const totalCount = await prisma.user.count();
    const totalPages = Math.ceil(totalCount / pageSize);
    const usersFromDb = await prisma.user.findMany({
      include: { role: { include: { permissions: true } } },
      orderBy: { username: 'asc' },
      skip,
      take: pageSize,
    });
    const appUsers: FetchedUserDetails[] = usersFromDb.map(user => ({
      id: user.id,
      username: user.username,
      email: user.email,
      roleId: user.roleId,
      roleName: user.role.name as AppRoleNameType,
      avatar: user.avatar || undefined,
      lastLogin: user.lastLogin?.toISOString() || undefined,
      permissions: user.role.permissions.map(p => p.id as AppPermissionIdType),
    }));
    return { data: appUsers, totalCount, currentPage: page, totalPages, pageSize };
  } catch (error) {
    logger.error(`Error in ${actionName}`, error as Error, undefined, actionName);
    throw new AppError("获取用户数据时发生服务器错误。", 500, "GET_USERS_FAILED", "无法加载用户数据。");
  }
}
export async function createUserAction(data: Omit<AppUser, "id" | "lastLogin" | "roleName"> & { password: string, avatar?: string }, performingUserId?: string): Promise<ActionResponse<FetchedUserDetails>> {
  const actionName = 'createUserAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    if (!data.password) { throw new ValidationError("新用户需要密码。", "password"); }
    const existingUserByEmail = await prisma.user.findUnique({ where: { email: data.email } });
    if (existingUserByEmail) { throw new ResourceError(`邮箱 ${data.email} 已被使用。`, 'EMAIL_ALREADY_EXISTS', `邮箱 ${data.email} 已被注册。`, 'email'); }
    const existingUserByUsername = await prisma.user.findUnique({ where: { username: data.username } });
    if (existingUserByUsername) { throw new ResourceError(`用户名 ${data.username} 已被使用。`, 'USERNAME_ALREADY_EXISTS', `用户名 ${data.username} 已被注册。`, 'username'); }
    const roleExists = await prisma.role.findUnique({ where: { id: data.roleId } });
    if (!roleExists) { throw new NotFoundError(`角色 ID: ${data.roleId}`, `分配的角色不存在。`, 'roleId'); }

    const newUser = await prisma.user.create({
      data: {
        username: data.username,
        email: data.email,
        password: data.password, // In a real app, hash this password
        roleId: data.roleId,
        avatar: data.avatar || '/images/avatars/default_avatar.png',
      },
      include: { role: { include: { permissions: true } } },
    });
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'create_user', details: `创建了用户 ${newUser.username}` } });
    revalidatePath("/users");
    const fetchedUser: FetchedUserDetails = {
        id: newUser.id, username: newUser.username, email: newUser.email, roleId: newUser.roleId,
        roleName: newUser.role.name as AppRoleNameType, avatar: newUser.avatar || undefined,
        permissions: newUser.role.permissions.map(p => p.id as AppPermissionIdType), lastLogin: newUser.lastLogin?.toISOString() || undefined,
    };
    return { success: true, data: fetchedUser };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}
export async function updateUserAction(id: string, data: Partial<Omit<AppUser, "id" | "roleName">> & { password?: string }, performingUserId?: string): Promise<ActionResponse<FetchedUserDetails>> {
  const actionName = 'updateUserAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    const userToUpdate = await prisma.user.findUnique({ where: { id } });
    if (!userToUpdate) { throw new NotFoundError(`用户 ID: ${id}`, `要更新的用户未找到。`); }

    const updateData: Prisma.UserUpdateInput = {};
    if (data.username && data.username !== userToUpdate.username) { if (await prisma.user.findFirst({ where: { username: data.username, NOT: { id } } })) { throw new ResourceError(`用户名 ${data.username} 已被使用。`, 'USERNAME_ALREADY_EXISTS', `用户名 ${data.username} 已被其他用户使用。`, 'username'); } updateData.username = data.username; }
    if (data.email && data.email !== userToUpdate.email) { if (await prisma.user.findFirst({ where: { email: data.email, NOT: { id } } })) { throw new ResourceError(`邮箱 ${data.email} 已被使用。`, 'EMAIL_ALREADY_EXISTS', `邮箱 ${data.email} 已被其他用户使用。`, 'email'); } updateData.email = data.email; }
    if (data.roleId && data.roleId !== userToUpdate.roleId) { if (!(await prisma.role.findUnique({ where: { id: data.roleId } }))) { throw new NotFoundError(`角色 ID: ${data.roleId}`, `分配的角色不存在。`, 'roleId'); } updateData.roleId = data.roleId; }
    if (data.password) { updateData.password = data.password; } // In real app, hash this
    if (data.avatar) { updateData.avatar = data.avatar; }

    if (Object.keys(updateData).length === 0) {
        const currentUserDetails = await fetchCurrentUserDetailsAction(id);
        if(!currentUserDetails) throw new NotFoundError(`用户 ID: ${id}`, "获取当前用户详情失败。");
        return { success: true, data: currentUserDetails };
    }
    const updatedUser = await prisma.user.update({ where: { id }, data: updateData, include: { role: { include: { permissions: true } } } });
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'update_user', details: `更新了用户 ${updatedUser.username}` } });
    revalidatePath("/users");
    const fetchedUser: FetchedUserDetails = {
        id: updatedUser.id, username: updatedUser.username, email: updatedUser.email, roleId: updatedUser.roleId,
        roleName: updatedUser.role.name as AppRoleNameType, avatar: updatedUser.avatar || undefined,
        permissions: updatedUser.role.permissions.map(p => p.id as AppPermissionIdType), lastLogin: updatedUser.lastLogin?.toISOString() || undefined,
    };
    return { success: true, data: fetchedUser };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}
export async function updateOwnPasswordAction(userId: string, payload: { currentPassword?: string; newPassword?: string; }): Promise<ActionResponse<{ message: string }>> {
    const actionName = 'updateOwnPasswordAction';
    try {
        const { currentPassword, newPassword } = payload;
        if (!currentPassword || !newPassword) { throw new ValidationError("当前密码和新密码都是必需的。", "currentPassword"); }
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) { throw new AuthError("用户未找到。", "用户身份验证失败。"); }
        if (user.password !== currentPassword) { throw new AuthError("当前密码不正确。", "当前密码不正确。", "currentPassword"); }
        if (currentPassword === newPassword) { throw new ValidationError("新密码不能与当前密码相同。", "newPassword", undefined, "新密码不能与当前密码相同。"); }
        await prisma.user.update({ where: { id: userId }, data: { password: newPassword } });
        await prisma.auditLog.create({ data: { userId: user.id, username: user.username, action: 'update_own_password', details: `用户 ${user.username} 更改了自己的密码。` } });
        return { success: true, data: { message: "密码已成功更新。" } };
    } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}
export async function deleteUserAction(id: string, performingUserId?: string): Promise<ActionResponse> {
  const actionName = 'deleteUserAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    const userToDelete = await prisma.user.findUnique({ where: { id } });
    if (!userToDelete) { throw new NotFoundError(`用户 ID: ${id}`, `要删除的用户未找到。`); }
    if (userToDelete.id === performingUserId) { throw new ResourceError("无法删除当前登录的用户。", "CANNOT_DELETE_SELF", "您不能删除自己的账户。"); }
    // Optional: Check if user is last admin etc. - for this app, assume deletable if not self.
    await prisma.auditLog.updateMany({ where: { userId: id }, data: { userId: null }}); // Dissociate audit logs from user
    await prisma.user.delete({ where: { id } });
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'delete_user', details: `删除了用户 ${userToDelete.username}` } });
    revalidatePath("/users");
    return { success: true };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

// Role Actions
export async function getRolesAction(params?: FetchParams): Promise<PaginatedResponse<AppRole>> {
  const actionName = 'getRolesAction';
  try {
    const page = params?.page || 1;
    const pageSize = params?.pageSize || DEFAULT_PAGE_SIZE;
    const skip = (page - 1) * pageSize;
    const totalCount = await prisma.role.count();
    const totalPages = Math.ceil(totalCount / pageSize);
    const rolesFromDb = await prisma.role.findMany({
      include: { permissions: true, _count: { select: { users: true } } },
      orderBy: { name: 'asc' },
      skip,
      take: pageSize,
    });
    const appRoles: AppRole[] = rolesFromDb.map(role => ({
      id: role.id,
      name: role.name as AppRoleNameType,
      description: role.description || undefined,
      permissions: role.permissions.map(p => p.id as AppPermissionIdType),
      userCount: role._count.users,
    }));
    return { data: appRoles, totalCount, currentPage: page, totalPages, pageSize };
  } catch (error) { logger.error(`Error in ${actionName}`, error as Error, undefined, actionName); throw new AppError("获取角色数据时发生服务器错误。", 500, "GET_ROLES_FAILED", "无法加载角色数据。"); }
}
export async function updateRoleAction(id: string, data: Partial<Omit<AppRole, "id" | "userCount" | "name">> & { permissions?: AppPermissionIdType[] }, performingUserId?: string): Promise<ActionResponse<AppRole>> {
  const actionName = 'updateRoleAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    const roleToUpdate = await prisma.role.findUnique({ where: { id } });
    if (!roleToUpdate) { throw new NotFoundError(`角色 ID: ${id}`, `要更新的角色未找到。`); }
    const updatePayload: Prisma.RoleUpdateInput = {};
    if (data.description !== undefined) { updatePayload.description = data.description || null; }
    if (data.permissions) {
        if (roleToUpdate.name === 'Administrator') { throw new ResourceError("不能修改 Administrator 角色的权限。", "ADMIN_ROLE_PERMISSIONS_PROTECTED", "系统管理员角色的权限是固定的，不能修改。"); }
        // Validate permissions exist
        const validPermissions = await prisma.permission.findMany({ where: { id: { in: data.permissions } } });
        if (validPermissions.length !== data.permissions.length) { throw new ValidationError("一个或多个提供的权限 ID 无效。", "permissions"); }
        updatePayload.permissions = { set: data.permissions.map(pid => ({ id: pid })) };
    }
    if (Object.keys(updatePayload).length === 0) {
        const currentRoleData = await prisma.role.findUnique({ where: { id }, include: {permissions: true, _count: {select: {users: true}}} });
        if (!currentRoleData) throw new NotFoundError(`角色 ID: ${id}`, `获取当前角色数据失败。`);
        const appRole : AppRole = { id: currentRoleData.id, name: currentRoleData.name as AppRoleNameType, description: currentRoleData.description || undefined, permissions: currentRoleData.permissions.map(p=>p.id as AppPermissionIdType), userCount: currentRoleData._count.users };
        return { success: true, data: appRole };
    }
    const updatedRole = await prisma.role.update({ where: { id }, data: updatePayload, include: { permissions: true, _count: {select: {users: true}} } });
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'update_role', details: `更新了角色 ${updatedRole.name}` } });
    revalidatePath("/roles");
    const appRole : AppRole = { id: updatedRole.id, name: updatedRole.name as AppRoleNameType, description: updatedRole.description || undefined, permissions: updatedRole.permissions.map(p=>p.id as AppPermissionIdType), userCount: updatedRole._count.users };
    return { success: true, data: appRole };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}
export async function createRoleAction(data: any): Promise<ActionResponse<AppRole>> { logger.warn('Attempted to call createRoleAction, which is disabled.'); throw new AppError("不允许创建新角色。", 403, 'ROLE_CREATION_NOT_ALLOWED'); }
export async function deleteRoleAction(id: string): Promise<ActionResponse> { const role = await prisma.role.findUnique({where: {id}}); if (role && (role.name === "Administrator" || role.name === "Operator" || role.name === "Viewer" )) { throw new AppError("不允许删除固定角色。", 403, 'FIXED_ROLE_DELETION_NOT_ALLOWED'); } throw new NotFoundError(`角色 ID: ${id}`, "未找到角色或不允许删除。"); }

// Audit Log Actions
export async function getAuditLogsAction(params?: FetchParams): Promise<PaginatedResponse<AppAuditLog>> {
  const actionName = 'getAuditLogsAction';
  try {
    const page = params?.page || 1;
    const pageSize = params?.pageSize || DEFAULT_PAGE_SIZE;
    const skip = (page - 1) * pageSize;
    const totalCount = await prisma.auditLog.count();
    const totalPages = Math.ceil(totalCount / pageSize);
    const logsFromDb = await prisma.auditLog.findMany({
      orderBy: { timestamp: 'desc' },
      skip,
      take: pageSize,
    });
    const appLogs: AppAuditLog[] = logsFromDb.map(log => ({
      id: log.id,
      userId: log.userId || undefined,
      username: log.username || '系统',
      action: log.action,
      timestamp: log.timestamp.toISOString(),
      details: log.details || undefined,
    }));
    return { data: appLogs, totalCount, currentPage: page, totalPages, pageSize };
  } catch (error) { logger.error(`Error in ${actionName}`, error as Error, undefined, actionName); throw new AppError("获取审计日志数据时发生服务器错误。", 500, "GET_AUDIT_LOGS_FAILED", "无法加载审计日志数据。"); }
}
export async function deleteAuditLogAction(id: string, performingUserId?: string): Promise<ActionResponse> {
  const actionName = 'deleteAuditLogAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    if (!(await prisma.auditLog.findUnique({ where: { id } }))) { throw new NotFoundError(`审计日志 ID: ${id}`, `要删除的审计日志条目未找到。`); }
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
      if (!(await prisma.auditLog.findUnique({ where: { id } }))) { throw new NotFoundError(`审计日志 ID: ${id}`, `审计日志条目 ID ${id} 未找到。`); }
      await prisma.auditLog.delete({ where: { id } });
      successCount++;
    } catch (error: unknown) { const errRes = createActionErrorResponse(error, `${actionName}_single`); failureDetails.push({ id, itemIdentifier: `ID ${id}`, error: errRes.userMessage }); }
  }
  if (successCount > 0) { await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'batch_delete_audit_log', details: `批量删除了 ${successCount} 条审计日志。失败 ${failureDetails.length} 条。` } }); revalidatePath("/audit-logs"); }
  return { successCount, failureCount: failureDetails.length, failureDetails };
}

// Permission Actions
export async function getAllPermissionsAction(): Promise<AppPermission[]> { return mockPermissions.map(p => ({ ...p, description: p.description || undefined })); }

// Query Tool Actions
interface QueryToolParams { page?: number; pageSize?: number; queryString?: string; searchTerm?: string; status?: AppIPAddressStatusType | 'all'; }

export async function querySubnetsAction(params: QueryToolParams): Promise<ActionResponse<PaginatedResponse<SubnetQueryResult>>> {
  const actionName = 'querySubnetsAction';
  try {
    const page = params.page || 1; const pageSize = params.pageSize || DEFAULT_QUERY_PAGE_SIZE; const skip = (page - 1) * pageSize;
    const queryString = params.queryString?.trim();
    if (!queryString) { return { success: true, data: { data: [], totalCount: 0, currentPage: page, totalPages: 0, pageSize } }; }
    const orConditions: Prisma.SubnetWhereInput[] = [ { cidr: { contains: queryString } }, { name: { contains: queryString } }, { description: { contains: queryString } }, { networkAddress: { contains: queryString } }, ];
    let whereClause: Prisma.SubnetWhereInput = { OR: orConditions }; if (orConditions.length === 0) { whereClause = { id: "IMPOSSIBLE_ID_TO_MATCH_ANYTHING_SUBNET" };}
    const totalCount = await prisma.subnet.count({ where: whereClause }); const totalPages = Math.ceil(totalCount / pageSize) || 1;
    const subnetsFromDb = await prisma.subnet.findMany({ where: whereClause, include: { vlan: { select: { vlanNumber: true, name: true } } }, orderBy: { cidr: 'asc' }, skip, take: pageSize });
    const results: SubnetQueryResult[] = await Promise.all(subnetsFromDb.map(async (s) => {
      const props = getSubnetPropertiesFromCidr(s.cidr); const totalUsableIPs = props ? getUsableIpCount(props.prefix) : 0;
      const allocatedIPsCount = await prisma.iPAddress.count({ where: { subnetId: s.id, status: 'allocated' } });
      const dbFreeIPsCount = await prisma.iPAddress.count({ where: { subnetId: s.id, status: 'free' } });
      const reservedIPsCount = await prisma.iPAddress.count({ where: { subnetId: s.id, status: 'reserved' } });
      return { id: s.id, cidr: s.cidr, name: s.name || undefined, description: s.description || undefined, dhcpEnabled: s.dhcpEnabled ?? false, vlanNumber: s.vlan?.vlanNumber, vlanName: s.vlan?.name || undefined, totalUsableIPs, allocatedIPsCount, dbFreeIPsCount, reservedIPsCount };
    }));
    return { success: true, data: { data: results, totalCount, currentPage: page, totalPages, pageSize } };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

export async function queryVlansAction(params: QueryToolParams): Promise<ActionResponse<PaginatedResponse<VlanQueryResult>>> {
  const actionName = 'queryVlansAction';
  try {
    const page = params.page || 1; const pageSize = params.pageSize || DEFAULT_QUERY_PAGE_SIZE; const skip = (page - 1) * pageSize;
    const queryString = params.queryString?.trim();
    if (!queryString) { return { success: true, data: { data: [], totalCount: 0, currentPage: page, totalPages: 0, pageSize } }; }
    const isNumericQuery = /^\d+$/.test(queryString); const vlanNumberQuery = isNumericQuery ? parseInt(queryString, 10) : null;
    const orConditions: Prisma.VLANWhereInput[] = [];
    if (vlanNumberQuery !== null && vlanNumberQuery >= 1 && vlanNumberQuery <= 4094) { orConditions.push({ vlanNumber: vlanNumberQuery }); }
    orConditions.push({ name: { contains: queryString } }); orConditions.push({ description: { contains: queryString } });
    let whereClause: Prisma.VLANWhereInput = { OR: orConditions }; if (orConditions.length === 0) { whereClause = { id: "IMPOSSIBLE_ID_TO_MATCH_ANYTHING_VLAN" };}
    const totalCount = await prisma.vLAN.count({ where: whereClause }); const totalPages = Math.ceil(totalCount / pageSize) || 1;
    const vlansFromDb = await prisma.vLAN.findMany({ where: whereClause, include: { subnets: { select: { id: true, cidr: true, name: true, description: true } }, ipAddresses: { select: { id: true, ipAddress: true, description: true } } }, orderBy: { vlanNumber: 'asc' }, skip, take: pageSize, });
    const results: VlanQueryResult[] = vlansFromDb.map(v => ({
      id: v.id, vlanNumber: v.vlanNumber, name: v.name || undefined, description: v.description || undefined,
      associatedSubnets: v.subnets.map(s => ({id: s.id, cidr: s.cidr, name: s.name || undefined, description: s.description || undefined})),
      associatedDirectIPs: v.ipAddresses.map(ip => ({id: ip.id, ipAddress: ip.ipAddress, description: ip.description || undefined})),
      resourceCount: v.subnets.length + v.ipAddresses.length,
    }));
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
      if (isPotentiallyIpSegment && !matchedIpPattern) { orConditionsForSearchTerm.push({ ipAddress: { startsWith: trimmedSearchTerm } }); }
      orConditionsForSearchTerm.push({ allocatedTo: { contains: trimmedSearchTerm } }); orConditionsForSearchTerm.push({ description: { contains: trimmedSearchTerm } });
      orConditionsForSearchTerm.push({ usageUnit: { contains: trimmedSearchTerm } }); orConditionsForSearchTerm.push({ contactPerson: { contains: trimmedSearchTerm } }); orConditionsForSearchTerm.push({ phone: { contains: trimmedSearchTerm } });
    }
    if (orConditionsForSearchTerm.length > 0) { andConditions.push({ OR: orConditionsForSearchTerm }); } else if (trimmedSearchTerm) { andConditions.push({ id: "IMPOSSIBLE_ID_TO_MATCH_ANYTHING_IP_SEARCH" }); }
    if (statusFilter && statusFilter !== 'all') { andConditions.push({ status: statusFilter as AppIPAddressStatusType }); }
    let whereClause: Prisma.IPAddressWhereInput = {};
    if (andConditions.length > 0) { whereClause = { AND: andConditions }; } else if (!trimmedSearchTerm && (!statusFilter || statusFilter === 'all')) { return { success: true, data: { data: [], totalCount: 0, currentPage: page, totalPages: 0, pageSize } }; }
    const totalCount = await prisma.iPAddress.count({ where: whereClause }); const totalPages = Math.ceil(totalCount / pageSize) || 1;
    const includeClauseForQuery = { subnet: { include: { vlan: { select: { vlanNumber: true, name: true } } } }, directVlan: { select: {vlanNumber: true, name: true} } };
    const ipsFromDb = await prisma.iPAddress.findMany({ where: whereClause, include: includeClauseForQuery, orderBy: [ { subnet: { networkAddress: 'asc' } }, { ipAddress: 'asc' } ], skip, take: pageSize }) as PrismaIPAddressWithRelations[];
    const results: AppIPAddressWithRelations[] = ipsFromDb.map(ip => ({
      id: ip.id, ipAddress: ip.ipAddress, status: ip.status as AppIPAddressStatusType, isGateway: ip.isGateway ?? false,
      allocatedTo: ip.allocatedTo || undefined, usageUnit: ip.usageUnit || undefined, contactPerson: ip.contactPerson || undefined, phone: ip.phone || undefined,
      description: ip.description || undefined, lastSeen: ip.lastSeen?.toISOString() || undefined,
      subnetId: ip.subnetId || undefined, directVlanId: ip.directVlanId || undefined,
      subnet: ip.subnet ? { id: ip.subnet.id, cidr: ip.subnet.cidr, name: ip.subnet.name || undefined, networkAddress: ip.subnet.networkAddress, vlan: ip.subnet.vlan ? { vlanNumber: ip.subnet.vlan.vlanNumber, name: ip.subnet.vlan.name || undefined } : null } : null,
      directVlan: ip.directVlan ? { vlanNumber: ip.directVlan.vlanNumber, name: ip.directVlan.name || undefined } : null,
    }));
    return { success: true, data: { data: results, totalCount, currentPage: page, totalPages, pageSize } };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}

export async function getSubnetFreeIpDetailsAction(subnetId: string): Promise<ActionResponse<SubnetFreeIpDetails>> {
  const actionName = 'getSubnetFreeIpDetailsAction';
  try {
    const subnet = await prisma.subnet.findUnique({ where: { id: subnetId } });
    if (!subnet) { throw new NotFoundError(`子网 ID: ${subnetId}`, `请求的子网未找到。`); }
    const subnetProperties = getSubnetPropertiesFromCidr(subnet.cidr);
    if (!subnetProperties) { throw new AppError(`子网 ${subnet.cidr} 的 CIDR 配置无效。`, 500, 'SUBNET_CIDR_INVALID_FOR_FREE_IP_CALC'); }
    const totalUsableIPs = getUsableIpCount(subnetProperties.prefix);
    const dbAllocatedIPs = await prisma.iPAddress.findMany({ where: { subnetId, status: 'allocated' }, select: { ipAddress: true } });
    const dbReservedIPs = await prisma.iPAddress.findMany({ where: { subnetId, status: 'reserved' }, select: { ipAddress: true } });
    const dbAllocatedIPsCount = dbAllocatedIPs.length;
    const dbReservedIPsCount = dbReservedIPs.length;
    const usedIpNumbers = new Set([...dbAllocatedIPs, ...dbReservedIPs].map(ip => ipToNumber(ip.ipAddress)));
    const availableIpNumbers: number[] = [];
    if (subnetProperties.firstUsableIp && subnetProperties.lastUsableIp) {
      const firstUsableNum = ipToNumber(subnetProperties.firstUsableIp);
      const lastUsableNum = ipToNumber(subnetProperties.lastUsableIp);
      for (let i = firstUsableNum; i <= lastUsableNum; i++) { if (!usedIpNumbers.has(i)) { availableIpNumbers.push(i); } }
    } else if (subnetProperties.prefix === 32) { // For /32, the network address itself is the only usable IP
      const networkNum = ipToNumber(subnetProperties.networkAddress);
      if (!usedIpNumbers.has(networkNum)) { availableIpNumbers.push(networkNum); }
    }
    // For /31, both network and broadcast equivalent are usable.
    else if (subnetProperties.prefix === 31) {
        const networkNum = ipToNumber(subnetProperties.networkAddress);
        const secondIpNum = ipToNumber(subnetProperties.broadcastAddress); // broadcastAddress for /31 is the second usable IP
        if (!usedIpNumbers.has(networkNum)) availableIpNumbers.push(networkNum);
        if (!usedIpNumbers.has(secondIpNum)) availableIpNumbers.push(secondIpNum);
    }
    const calculatedAvailableIpRanges = groupConsecutiveIpsToRanges(availableIpNumbers);
    return { success: true, data: { subnetId, subnetCidr: subnet.cidr, totalUsableIPs, dbAllocatedIPsCount, dbReservedIPsCount, calculatedAvailableIPsCount: availableIpNumbers.length, calculatedAvailableIpRanges, } };
  } catch (error: unknown) { return { success: false, error: createActionErrorResponse(error, actionName) }; }
}


// --- ISP Actions ---
export async function getISPsAction(params?: FetchParams): Promise<ActionResponse<PaginatedResponse<AppISP>>> {
  const actionName = 'getISPsAction';
  try {
    const page = params?.page || 1;
    const pageSize = params?.pageSize || DEFAULT_PAGE_SIZE;
    const skip = (page - 1) * pageSize;

    const totalCount = await prisma.iSP.count();
    const totalPages = Math.ceil(totalCount / pageSize) || 1;

    const ispsFromDb = await prisma.iSP.findMany({
      orderBy: { name: 'asc' },
      skip,
      take: pageSize,
    });

    const appISPs: AppISP[] = ispsFromDb.map(isp => ({
      id: isp.id,
      name: isp.name,
      description: isp.description || undefined,
      contactInfo: isp.contactInfo || undefined,
      createdAt: isp.createdAt.toISOString(),
      updatedAt: isp.updatedAt.toISOString(),
    }));

    return { success: true, data: { data: appISPs, totalCount, currentPage: page, totalPages, pageSize } };
  } catch (error: unknown) {
    return { success: false, error: createActionErrorResponse(error, actionName) };
  }
}

export async function createISPAction(data: Omit<AppISP, 'id' | 'createdAt' | 'updatedAt'>, performingUserId?: string): Promise<ActionResponse<AppISP>> {
  const actionName = 'createISPAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    if (!data.name || data.name.trim() === "") {
      throw new ValidationError("运营商名称是必需的。", "name");
    }
    const existingISP = await prisma.iSP.findUnique({ where: { name: data.name } });
    if (existingISP) {
      throw new ResourceError(`运营商 "${data.name}" 已存在。`, 'ISP_ALREADY_EXISTS', undefined, 'name');
    }

    const newISP = await prisma.iSP.create({
      data: {
        name: data.name,
        description: data.description || null,
        contactInfo: data.contactInfo || null,
      },
    });
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'create_isp', details: `创建了运营商 ${newISP.name}` } });
    revalidatePath("/settings/isps"); // Assuming a path for ISP management
    const appISP: AppISP = {
      id: newISP.id, name: newISP.name, description: newISP.description || undefined, contactInfo: newISP.contactInfo || undefined,
      createdAt: newISP.createdAt.toISOString(), updatedAt: newISP.updatedAt.toISOString(),
    };
    return { success: true, data: appISP };
  } catch (error: unknown) {
    return { success: false, error: createActionErrorResponse(error, actionName) };
  }
}

export async function updateISPAction(id: string, data: Partial<Omit<AppISP, 'id' | 'createdAt' | 'updatedAt'>>, performingUserId?: string): Promise<ActionResponse<AppISP>> {
  const actionName = 'updateISPAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    const ispToUpdate = await prisma.iSP.findUnique({ where: { id } });
    if (!ispToUpdate) {
      throw new NotFoundError(`运营商 ID: ${id}`, `要更新的运营商未找到。`);
    }

    const updatePayload: Prisma.ISPUpdateInput = {};
    if (data.name && data.name !== ispToUpdate.name) {
      if (await prisma.iSP.findFirst({ where: { name: data.name, NOT: { id } } })) {
        throw new ResourceError(`运营商名称 "${data.name}" 已被其他运营商使用。`, 'ISP_NAME_ALREADY_EXISTS', undefined, 'name');
      }
      updatePayload.name = data.name;
    }
    if (data.hasOwnProperty('description')) updatePayload.description = data.description || null;
    if (data.hasOwnProperty('contactInfo')) updatePayload.contactInfo = data.contactInfo || null;
    
    if (Object.keys(updatePayload).length === 0) {
        const currentAppISP : AppISP = { ...ispToUpdate, description: ispToUpdate.description || undefined, contactInfo: ispToUpdate.contactInfo || undefined, createdAt: ispToUpdate.createdAt.toISOString(), updatedAt: ispToUpdate.updatedAt.toISOString() };
        return { success: true, data: currentAppISP};
    }

    const updatedISP = await prisma.iSP.update({ where: { id }, data: updatePayload });
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'update_isp', details: `更新了运营商 ${updatedISP.name}` } });
    revalidatePath("/settings/isps");
     const appISP: AppISP = {
      id: updatedISP.id, name: updatedISP.name, description: updatedISP.description || undefined, contactInfo: updatedISP.contactInfo || undefined,
      createdAt: updatedISP.createdAt.toISOString(), updatedAt: updatedISP.updatedAt.toISOString(),
    };
    return { success: true, data: appISP };
  } catch (error: unknown) {
    return { success: false, error: createActionErrorResponse(error, actionName) };
  }
}

export async function deleteISPAction(id: string, performingUserId?: string): Promise<ActionResponse> {
  const actionName = 'deleteISPAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    const ispToDelete = await prisma.iSP.findUnique({ where: { id } });
    if (!ispToDelete) {
      throw new NotFoundError(`运营商 ID: ${id}`, `要删除的运营商未找到。`);
    }
    // Add check if ISP is in use by DeviceConnections later if relations are added
    // const connections = await prisma.deviceConnection.count({ where: { ispId: id } });
    // if (connections > 0) {
    //   throw new ResourceError(`运营商 "${ispToDelete.name}" 仍被 ${connections} 个设备连接使用。`, 'ISP_IN_USE');
    // }
    await prisma.iSP.delete({ where: { id } });
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'delete_isp', details: `删除了运营商 ${ispToDelete.name}` } });
    revalidatePath("/settings/isps");
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: createActionErrorResponse(error, actionName) };
  }
}

export async function batchDeleteISPsAction(ids: string[], performingUserId?: string): Promise<BatchDeleteResult> {
  const actionName = 'batchDeleteISPsAction';
  const auditUser = await getAuditUserInfo(performingUserId);
  let successCount = 0; const failureDetails: BatchOperationFailure[] = []; const deletedIspNames: string[] = [];

  for (const id of ids) {
    try {
      const ispToDelete = await prisma.iSP.findUnique({ where: { id } });
      if (!ispToDelete) {
        failureDetails.push({ id, itemIdentifier: `ID ${id}`, error: '运营商未找到。' });
        continue;
      }
      // Add check if ISP is in use by DeviceConnections later
      // const connections = await prisma.deviceConnection.count({ where: { ispId: id } });
      // if (connections > 0) {
      //   throw new ResourceError(`运营商 "${ispToDelete.name}" 仍被 ${connections} 个连接使用。`, 'ISP_IN_USE_BATCH');
      // }
      await prisma.iSP.delete({ where: { id } });
      deletedIspNames.push(ispToDelete.name);
      successCount++;
    } catch (error: unknown) {
      const errRes = createActionErrorResponse(error, `${actionName}_single`);
      failureDetails.push({ id, itemIdentifier: (await prisma.iSP.findUnique({ where: { id } }))?.name || `ID ${id}`, error: errRes.userMessage });
    }
  }
  if (deletedIspNames.length > 0) {
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'batch_delete_isp', details: `批量删除了 ${deletedIspNames.length} 个运营商: ${deletedIspNames.join(', ')}。失败 ${failureDetails.length} 个。` } });
    revalidatePath("/settings/isps");
  }
  return { successCount, failureCount: failureDetails.length, failureDetails };
}


// --- Device Actions ---
export async function getDevicesAction(params?: FetchParams): Promise<ActionResponse<PaginatedResponse<AppDevice>>> {
  const actionName = 'getDevicesAction';
  try {
    const page = params?.page || 1;
    const pageSize = params?.pageSize || DEFAULT_PAGE_SIZE;
    const skip = (page - 1) * pageSize;

    const totalCount = await prisma.device.count();
    const totalPages = Math.ceil(totalCount / pageSize) || 1;

    const devicesFromDb = await prisma.device.findMany({
      orderBy: { name: 'asc' },
      skip,
      take: pageSize,
    });

    const appDevices: AppDevice[] = devicesFromDb.map(device => ({
      id: device.id,
      name: device.name,
      deviceType: device.deviceType as AppDeviceType || undefined,
      location: device.location || undefined,
      managementIp: device.managementIp || undefined,
      brand: device.brand || undefined,
      modelNumber: device.modelNumber || undefined,
      serialNumber: device.serialNumber || undefined,
      description: device.description || undefined,
      createdAt: device.createdAt.toISOString(),
      updatedAt: device.updatedAt.toISOString(),
    }));

    return { success: true, data: { data: appDevices, totalCount, currentPage: page, totalPages, pageSize } };
  } catch (error: unknown) {
    return { success: false, error: createActionErrorResponse(error, actionName) };
  }
}

export async function createDeviceAction(data: Omit<AppDevice, 'id' | 'createdAt' | 'updatedAt'>, performingUserId?: string): Promise<ActionResponse<AppDevice>> {
  const actionName = 'createDeviceAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
     if (!data.name || data.name.trim() === "") {
      throw new ValidationError("设备名称是必需的。", "name");
    }
    const existingDeviceByName = await prisma.device.findUnique({ where: { name: data.name } });
    if (existingDeviceByName) {
      throw new ResourceError(`设备名称 "${data.name}" 已存在。`, 'DEVICE_NAME_ALREADY_EXISTS', undefined, 'name');
    }
    if (data.managementIp && await prisma.device.findUnique({ where: { managementIp: data.managementIp } })) {
      throw new ResourceError(`管理IP "${data.managementIp}" 已被其他设备使用。`, 'DEVICE_MANAGEMENT_IP_EXISTS', undefined, 'managementIp');
    }
     if (data.serialNumber && await prisma.device.findUnique({ where: { serialNumber: data.serialNumber } })) {
      throw new ResourceError(`序列号 "${data.serialNumber}" 已被其他设备使用。`, 'DEVICE_SERIAL_EXISTS', undefined, 'serialNumber');
    }

    const newDevice = await prisma.device.create({
      data: {
        name: data.name,
        deviceType: data.deviceType as PrismaDeviceType | undefined,
        location: data.location || null,
        managementIp: data.managementIp || null,
        brand: data.brand || null,
        modelNumber: data.modelNumber || null,
        serialNumber: data.serialNumber || null,
        description: data.description || null,
      },
    });
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'create_device', details: `创建了设备 ${newDevice.name}` } });
    revalidatePath("/settings/devices"); // Assuming a path for Device management
    const appDevice: AppDevice = {
        id: newDevice.id, name: newDevice.name, deviceType: newDevice.deviceType as AppDeviceType || undefined,
        location: newDevice.location || undefined, managementIp: newDevice.managementIp || undefined,
        brand: newDevice.brand || undefined, modelNumber: newDevice.modelNumber || undefined,
        serialNumber: newDevice.serialNumber || undefined, description: newDevice.description || undefined,
        createdAt: newDevice.createdAt.toISOString(), updatedAt: newDevice.updatedAt.toISOString(),
    };
    return { success: true, data: appDevice };
  } catch (error: unknown) {
    return { success: false, error: createActionErrorResponse(error, actionName) };
  }
}

export async function updateDeviceAction(id: string, data: Partial<Omit<AppDevice, 'id' | 'createdAt' | 'updatedAt'>>, performingUserId?: string): Promise<ActionResponse<AppDevice>> {
  const actionName = 'updateDeviceAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    const deviceToUpdate = await prisma.device.findUnique({ where: { id } });
    if (!deviceToUpdate) {
      throw new NotFoundError(`设备 ID: ${id}`, `要更新的设备未找到。`);
    }

    const updatePayload: Prisma.DeviceUpdateInput = {};
    if (data.name && data.name !== deviceToUpdate.name) {
      if (await prisma.device.findFirst({ where: { name: data.name, NOT: { id } } })) {
        throw new ResourceError(`设备名称 "${data.name}" 已被其他设备使用。`, 'DEVICE_NAME_ALREADY_EXISTS', undefined, 'name');
      }
      updatePayload.name = data.name;
    }
    if (data.managementIp && data.managementIp !== deviceToUpdate.managementIp) {
      if (await prisma.device.findFirst({ where: { managementIp: data.managementIp, NOT: { id } } })) {
        throw new ResourceError(`管理IP "${data.managementIp}" 已被其他设备使用。`, 'DEVICE_MANAGEMENT_IP_EXISTS', undefined, 'managementIp');
      }
      updatePayload.managementIp = data.managementIp;
    }
     if (data.serialNumber && data.serialNumber !== deviceToUpdate.serialNumber) {
      if (await prisma.device.findFirst({ where: { serialNumber: data.serialNumber, NOT: { id } } })) {
        throw new ResourceError(`序列号 "${data.serialNumber}" 已被其他设备使用。`, 'DEVICE_SERIAL_EXISTS', undefined, 'serialNumber');
      }
      updatePayload.serialNumber = data.serialNumber;
    }

    if (data.hasOwnProperty('deviceType')) updatePayload.deviceType = data.deviceType as PrismaDeviceType | undefined | null;
    if (data.hasOwnProperty('location')) updatePayload.location = data.location || null;
    if (data.hasOwnProperty('brand')) updatePayload.brand = data.brand || null;
    if (data.hasOwnProperty('modelNumber')) updatePayload.modelNumber = data.modelNumber || null;
    if (data.hasOwnProperty('description')) updatePayload.description = data.description || null;

    if (Object.keys(updatePayload).length === 0 && (!data.deviceType || data.deviceType === deviceToUpdate.deviceType)) {
        const currentAppDevice : AppDevice = { ...deviceToUpdate, deviceType: deviceToUpdate.deviceType as AppDeviceType || undefined, location: deviceToUpdate.location || undefined, managementIp: deviceToUpdate.managementIp || undefined, brand: deviceToUpdate.brand || undefined, modelNumber: deviceToUpdate.modelNumber || undefined, serialNumber: deviceToUpdate.serialNumber || undefined, description: deviceToUpdate.description || undefined, createdAt: deviceToUpdate.createdAt.toISOString(), updatedAt: deviceToUpdate.updatedAt.toISOString() };
        return { success: true, data: currentAppDevice };
    }

    const updatedDevice = await prisma.device.update({ where: { id }, data: updatePayload });
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'update_device', details: `更新了设备 ${updatedDevice.name}` } });
    revalidatePath("/settings/devices");
    const appDevice: AppDevice = {
        id: updatedDevice.id, name: updatedDevice.name, deviceType: updatedDevice.deviceType as AppDeviceType || undefined,
        location: updatedDevice.location || undefined, managementIp: updatedDevice.managementIp || undefined,
        brand: updatedDevice.brand || undefined, modelNumber: updatedDevice.modelNumber || undefined,
        serialNumber: updatedDevice.serialNumber || undefined, description: updatedDevice.description || undefined,
        createdAt: updatedDevice.createdAt.toISOString(), updatedAt: updatedDevice.updatedAt.toISOString(),
    };
    return { success: true, data: appDevice };
  } catch (error: unknown) {
    return { success: false, error: createActionErrorResponse(error, actionName) };
  }
}

export async function deleteDeviceAction(id: string, performingUserId?: string): Promise<ActionResponse> {
  const actionName = 'deleteDeviceAction';
  try {
    const auditUser = await getAuditUserInfo(performingUserId);
    const deviceToDelete = await prisma.device.findUnique({ where: { id } });
    if (!deviceToDelete) {
      throw new NotFoundError(`设备 ID: ${id}`, `要删除的设备未找到。`);
    }
    // Add check if Device is in use by DeviceConnections later if relations are added
    // const connections = await prisma.deviceConnection.count({
    //   where: { OR: [{ localDeviceId: id }, { remoteDeviceId: id }] } // Example if remoteDeviceId exists
    // });
    // if (connections > 0) {
    //   throw new ResourceError(`设备 "${deviceToDelete.name}" 仍被 ${connections} 个连接使用。`, 'DEVICE_IN_USE');
    // }
    await prisma.device.delete({ where: { id } });
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'delete_device', details: `删除了设备 ${deviceToDelete.name}` } });
    revalidatePath("/settings/devices");
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: createActionErrorResponse(error, actionName) };
  }
}

export async function batchDeleteDevicesAction(ids: string[], performingUserId?: string): Promise<BatchDeleteResult> {
  const actionName = 'batchDeleteDevicesAction';
  const auditUser = await getAuditUserInfo(performingUserId);
  let successCount = 0; const failureDetails: BatchOperationFailure[] = []; const deletedDeviceNames: string[] = [];

  for (const id of ids) {
    try {
      const deviceToDelete = await prisma.device.findUnique({ where: { id } });
      if (!deviceToDelete) {
        failureDetails.push({ id, itemIdentifier: `ID ${id}`, error: '设备未找到。' });
        continue;
      }
      // Add check if Device is in use by DeviceConnections later
      // const connections = await prisma.deviceConnection.count({
      //   where: { OR: [{ localDeviceId: id }, { remoteDeviceId: id }] }
      // });
      // if (connections > 0) {
      //   throw new ResourceError(`设备 "${deviceToDelete.name}" 仍被 ${connections} 个连接使用。`, 'DEVICE_IN_USE_BATCH');
      // }
      await prisma.device.delete({ where: { id } });
      deletedDeviceNames.push(deviceToDelete.name);
      successCount++;
    } catch (error: unknown) {
      const errRes = createActionErrorResponse(error, `${actionName}_single`);
      failureDetails.push({ id, itemIdentifier: (await prisma.device.findUnique({ where: { id } }))?.name || `ID ${id}`, error: errRes.userMessage });
    }
  }
  if (deletedDeviceNames.length > 0) {
    await prisma.auditLog.create({ data: { userId: auditUser.userId, username: auditUser.username, action: 'batch_delete_device', details: `批量删除了 ${deletedDeviceNames.length} 个设备: ${deletedDeviceNames.join(', ')}。失败 ${failureDetails.length} 个。` } });
    revalidatePath("/settings/devices");
  }
  return { successCount, failureCount: failureDetails.length, failureDetails };
}
