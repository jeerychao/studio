
// src/lib/error-utils.ts

import { AppError, ValidationError, ResourceError, NetworkError } from './errors';
import { Prisma } from '@prisma/client';
import { logger } from './logger';
import type { ActionErrorResponse } from './errors';

// This function is NOT for actions to re-throw.
// Actions should catch errors and return a structured response.
// This might be useful for other server-side contexts if needed.
export function handleGenericServerError(error: unknown, context?: string): never {
  logger.error(context || 'Generic server error occurred', error as Error);
  if (error instanceof AppError) {
    throw error; // Re-throw AppError if it's already one
  }
  if (error instanceof Error) {
    throw new AppError(error.message, 500, 'UNHANDLED_ERROR', '服务器发生意外错误。');
  }
  throw new AppError('An unexpected error occurred on the server.', 500, 'UNKNOWN_SERVER_ERROR', '服务器发生未知错误。');
}


// Validation function for CIDR, throws ValidationError on failure
export function validateCIDR(cidr: string, fieldName = 'cidr'): void {
  const cidrRegex = /^(\d{1,3}\.){3}\d{1,3}\/(\d{1,2})$/;
  if (!cidrRegex.test(cidr)) {
    throw new ValidationError(
      `值 "${cidr}" 不是有效的 CIDR 格式。`,
      fieldName,
      cidr,
      `CIDR 格式无效，请使用 X.X.X.X/Y (例如 192.168.1.0/24)。`
    );
  }

  const [ip, prefixStr] = cidr.split('/');
  const prefixNum = parseInt(prefixStr, 10);

  if (prefixNum < 0 || prefixNum > 32) {
    throw new ValidationError(
      `网络前缀 /${prefixNum} 无效，必须在 0-32 之间。`,
      fieldName, // or specifically 'prefix' if you have separate fields
      cidr,
      `网络前缀必须在 0 到 32 之间。`
    );
  }

  const ipParts = ip.split('.').map(Number);
  if (ipParts.some(part => isNaN(part) || part < 0 || part > 255)) {
    throw new ValidationError(
      `IP 地址 "${ip}" 的一部分无效。`,
      fieldName, // or specifically 'ip'
      cidr,
      `IP 地址部分无效，每个数字必须在 0 到 255 之间。`
    );
  }

  // Validate if the IP part is the network address for the given prefix
  const ipNum = ipParts.reduce((acc, octet) => (acc << 8) + octet, 0) >>> 0;
  const maskNum = prefixNum === 0 ? 0 : (0xFFFFFFFF << (32 - prefixNum)) >>> 0;
  const calculatedNetworkAddrNum = (ipNum & maskNum) >>> 0;
  
  if (ipNum !== calculatedNetworkAddrNum) {
    const correctIP = [
      (calculatedNetworkAddrNum >> 24) & 255,
      (calculatedNetworkAddrNum >> 16) & 255,
      (calculatedNetworkAddrNum >> 8) & 255,
      calculatedNetworkAddrNum & 255
    ].join('.');
    throw new ValidationError(
      `提供的 IP 地址 "${ip}" 不是 CIDR "${cidr}" 的有效网络地址。网络地址应为 "${correctIP}"。`,
      fieldName,
      cidr,
      `IP 地址部分不是网络地址。对于输入 ${cidr}，请使用 ${correctIP}/${prefixNum}。`
    );
  }
}


// Converts various error types into a standard ActionErrorResponse object
// This is intended to be used in the CATCH block of Server Actions.
export function createActionErrorResponse(
  error: unknown,
  actionContext?: string // e.g., 'createSubnetAction'
): ActionErrorResponse {
  logger.error(actionContext || 'Action Error', error as Error, { context: actionContext });

  if (error instanceof AppError) {
    return {
      userMessage: error.userMessage,
      code: error.code,
      field: error.field,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    };
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // Handle known Prisma errors gracefully
    switch (error.code) {
      case 'P2002': { // Unique constraint failed
        const target = error.meta?.target as string[] | string | undefined;
        let fieldMessage = "一个具有这些值的记录已存在。";
        let fieldName: string | undefined = undefined;
        if (target && Array.isArray(target) && target.length > 0) {
          fieldName = target.join(', ');
          fieldMessage = `字段 '${fieldName}' 的值必须是唯一的，提供的值已存在。`;
        } else if (target && typeof target === 'string') {
          fieldName = target;
          fieldMessage = `字段 '${fieldName}' 的值必须是唯一的，提供的值已存在。`;
        }
        return {
          userMessage: fieldMessage,
          code: error.code,
          field: fieldName, // This might need mapping to form field names
          details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        };
      }
      case 'P2003': { // Foreign key constraint failed
         const fieldName = error.meta?.field_name as string | undefined;
         return {
            userMessage: `操作失败，因为它违反了与字段 '${fieldName || '关联记录'}' 相关的约束。请确保引用的记录存在。`,
            code: error.code,
            field: fieldName,
            details: process.env.NODE_ENV === 'development' ? error.message : undefined,
         };
      }
      case 'P2014': { // Required relation violation
        const relationName = error.meta?.relation_name as string | undefined;
        const modelName = error.meta?.model_name as string | undefined;
        return {
            userMessage: `无法创建或更新 ${modelName || '记录'}，因为必需的关联 '${relationName || '记录'}' 不存在或未提供。`,
            code: error.code,
            details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        };
      }
      case 'P2025': // Record to update/delete not found
        return {
          userMessage: "操作失败，因为请求的记录未找到。它可能已被删除。",
          code: error.code,
          details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        };
      default:
        return {
          userMessage: "数据库操作时发生错误，请检查您的输入或稍后重试。",
          code: error.code,
          details: process.env.NODE_ENV === 'development' ? error.message : undefined,
        };
    }
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    // Make userMessage more verbose for PrismaClientValidationError
    const detailedUserMessage = `数据验证失败。Prisma 客户端验证错误：${error.message}. 请检查所有字段是否符合要求。`;
    return {
        userMessage: detailedUserMessage,
        code: 'PRISMA_VALIDATION_ERROR',
        details: process.env.NODE_ENV === 'development' ? error.message : "Prisma Client Validation Error. Enable development mode for more details.",
    };
  }

  // Fallback for other unexpected errors
  let devDetails: string | undefined;
  if (process.env.NODE_ENV === 'development') {
    if (error instanceof Error) {
      devDetails = error.message;
    } else if (typeof error === 'string') {
      devDetails = error;
    }
  }

  return {
    userMessage: "处理您的请求时发生意外错误，请稍后重试。",
    code: 'UNEXPECTED_ACTION_ERROR',
    details: devDetails,
  };
}

