
// src/lib/errors.ts

export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public userMessage: string; // User-friendly message
  public field?: string; // Optional field for validation errors

  constructor(message: string, statusCode = 500, code = 'INTERNAL_ERROR', userMessage?: string, field?: string) {
    super(message); // This is the developer-facing message, or original error message
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.userMessage = userMessage || message; // Default userMessage to message if not provided
    this.field = field;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, field?: string, value?: any, userMessage: string = '输入验证失败，请检查您的输入。') {
    super(message, 400, 'VALIDATION_ERROR', userMessage, field);
  }
}

export class NetworkError extends AppError {
  constructor(message: string, userMessage: string = '网络连接错误，请稍后重试。') {
    super(message, 503, 'NETWORK_ERROR', userMessage);
  }
}

export class AuthError extends AppError {
  constructor(message: string, userMessage: string = '认证失败，请检查您的凭据或重新登录。', field?: string) {
    super(message, 401, 'AUTH_ERROR', userMessage, field);
  }
}

export class ResourceError extends AppError {
  constructor(message: string, code = 'RESOURCE_ERROR', userMessage: string = '操作的资源存在冲突或问题。', field?: string) {
    super(message, 409, code, userMessage, field);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, userMessage?: string, field?: string) {
    const finalUserMessage = userMessage || `未找到所请求的资源：${resource}。`;
    super(`${resource} not found`, 404, 'NOT_FOUND', finalUserMessage, field);
  }
}

// Standardized error response structure from Server Actions
export interface ActionErrorResponse {
  userMessage: string;
  code?: string;
  field?: string;
  details?: string; // For development-only verbose details
}
