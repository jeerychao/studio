
// src/lib/error-utils.ts

import { AppError, ValidationError, ResourceError, NetworkError, AuthError, NotFoundError, type ActionErrorResponse } from './errors';
import { Prisma } from '@prisma/client';
import { logger } from './logger';

export function handleGenericServerError(error: unknown, context?: string): never {
  logger.error(context || 'Generic server error occurred', error as Error);
  if (error instanceof AppError) {
    throw error;
  }
  if (error instanceof Error) {
    throw new AppError(error.message, 500, 'UNHANDLED_ERROR', '服务器发生意外错误。');
  }
  throw new AppError('An unexpected error occurred on the server.', 500, 'UNKNOWN_SERVER_ERROR', '服务器发生未知错误。');
}

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
      fieldName,
      cidr,
      `网络前缀必须在 0 到 32 之间。`
    );
  }

  const ipParts = ip.split('.').map(Number);
  if (ipParts.some(part => isNaN(part) || part < 0 || part > 255)) {
    throw new ValidationError(
      `IP 地址 "${ip}" 的一部分无效。`,
      fieldName,
      cidr,
      `IP 地址部分无效，每个数字必须在 0 到 255 之间。`
    );
  }
  
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

export function createActionErrorResponse(
  error: unknown,
  actionContext?: string
): ActionErrorResponse {
  logger.error(actionContext || 'Action Error', error as Error, { context: actionContext, errorObject: error });

  if (error instanceof AppError) {
    return {
      userMessage: error.userMessage,
      code: error.code,
      field: error.field,
      details: process.env.NODE_ENV === 'development' ? `${error.name} (${error.code || 'N/A'}): ${error.message}${error.stack ? `\nStack: ${error.stack.substring(0,500)}...` : ''}` : undefined,
    };
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    let userMessage = `数据库操作时发生错误 (代码: ${error.code})。`;
    const devDetails = `${error.name} (Code: ${error.code}): ${error.message}${error.meta ? ` Meta: ${JSON.stringify(error.meta)}` : ''}`;
    switch (error.code) {
      case 'P2002': {
        const target = error.meta?.target as string[] | string | undefined;
        let fieldName: string | undefined = undefined;
        if (target && Array.isArray(target) && target.length > 0) {
          fieldName = target.join(', ');
          userMessage = `字段 '${fieldName}' 的值必须是唯一的，提供的值已存在。`;
        } else if (target && typeof target === 'string') {
          fieldName = target;
          userMessage = `字段 '${fieldName}' 的值必须是唯一的，提供的值已存在。`;
        } else {
          userMessage = "一个具有这些值的记录已存在。";
        }
        return { userMessage, code: error.code, field: fieldName, details: process.env.NODE_ENV === 'development' ? devDetails : undefined };
      }
      case 'P2003': {
         const fieldName = error.meta?.field_name as string | undefined;
         userMessage = `操作失败，因为它违反了与字段 '${fieldName || '关联记录'}' 相关的约束。请确保引用的记录存在。`;
         return { userMessage, code: error.code, field: fieldName, details: process.env.NODE_ENV === 'development' ? devDetails : undefined };
      }
      case 'P2014': {
        const relationName = error.meta?.relation_name as string | undefined;
        const modelName = error.meta?.model_name as string | undefined;
        userMessage = `无法创建或更新 ${modelName || '记录'}，因为必需的关联 '${relationName || '记录'}' 不存在或未提供。`;
        return { userMessage, code: error.code, details: process.env.NODE_ENV === 'development' ? devDetails : undefined };
      }
      case 'P2025':
        userMessage = "操作失败，因为请求的记录未找到。它可能已被删除。";
        return { userMessage, code: error.code, details: process.env.NODE_ENV === 'development' ? devDetails : undefined };
      case 'P2010': // Raw query failed (used by queryVlansAction)
        userMessage = `数据库原生查询失败。${process.env.NODE_ENV === 'development' ? `代码: ${error.code}。详情: ${error.message}` : '请联系管理员获取更多信息。'}`;
        return { userMessage, code: error.code, details: process.env.NODE_ENV === 'development' ? devDetails : undefined };
      default:
        userMessage = `数据库操作发生已知错误。${process.env.NODE_ENV === 'development' ? `代码: ${error.code}。详情: ${error.message}` : '请检查输入或联系管理员。'}`;
        return { userMessage, code: error.code, details: process.env.NODE_ENV === 'development' ? devDetails : undefined };
    }
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    const detailedUserMessage = `数据验证失败。${process.env.NODE_ENV === 'development' ? `详情: ${error.message}` : '请检查所有字段是否符合要求。'}`;
    return {
        userMessage: detailedUserMessage,
        code: 'PRISMA_VALIDATION_ERROR',
        details: process.env.NODE_ENV === 'development' ? `${error.name}: ${error.message}${error.stack ? `\nStack: ${error.stack.substring(0,500)}...` : ''}` : "Prisma Client Validation Error.",
    };
  }

  let finalUserMessage = `处理您的请求时发生了一个意外错误。`;
  let finalCode = 'UNEXPECTED_ACTION_ERROR';
  let finalDevDetails: string | undefined;

  if (error instanceof Error) {
    finalUserMessage += ` ${process.env.NODE_ENV === 'development' ? error.message : '请稍后重试或联系支持。'}`;
    if (process.env.NODE_ENV === 'development') {
      finalDevDetails = `${error.name} (Code: ${finalCode}): ${error.message}${error.stack ? `\nStack: ${error.stack.substring(0,500)}...` : ''}`;
    }
  } else {
    finalUserMessage += ' 请稍后重试或联系支持。';
    if (process.env.NODE_ENV === 'development') {
        try {
            finalDevDetails = JSON.stringify(error);
        } catch {
            finalDevDetails = "无法序列化错误对象。";
        }
    }
  }
  
  const contextMessage = actionContext ? `在操作 "${actionContext}" 时发生错误` : `发生错误`;
  
  return {
    userMessage: `${contextMessage}: ${finalUserMessage.replace(contextMessage + ": ", "")}`, // Avoid duplicating context
    code: finalCode,
    details: finalDevDetails,
  };
}
