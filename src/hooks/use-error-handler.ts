// src/hooks/use-error-handler.ts
"use client";

import { useToast } from './use-toast';
import { AppError, ValidationError, NetworkError, AuthError, ResourceError, NotFoundError } from '@/lib/errors';

export function useErrorHandler() {
  const { toast } = useToast();

  const handleError = (error: Error | unknown) => {
    // Log the error regardless of its type for debugging purposes
    console.error('Client-side error caught by useErrorHandler:', error);

    let title = '未知错误';
    let description = '操作失败，请稍后重试或联系支持。';
    const variant: "default" | "destructive" | null | undefined = 'destructive';

    if (error instanceof ValidationError) {
      title = '验证错误';
      description = `${error.field ? `${error.field}: ` : ''}${error.userMessage}`;
    } else if (error instanceof NetworkError) {
      title = '网络错误';
      description = error.userMessage;
    } else if (error instanceof AuthError) {
      title = '认证错误';
      description = error.userMessage;
    } else if (error instanceof ResourceError) {
      title = '资源错误';
      description = error.userMessage;
    } else if (error instanceof NotFoundError) {
      title = '未找到资源';
      description = error.userMessage;
    } else if (error instanceof AppError) {
      // Generic AppError that isn't one of the more specific types above
      title = '操作失败';
      description = error.userMessage;
    } else if (error instanceof Error) {
      // For generic JavaScript errors, use its message if available, otherwise default
      description = error.message || description;
    }
    // For non-Error objects, the default title/description will be used

    toast({
      title: title,
      description: description,
      variant: variant,
    });
  };

  return { handleError };
}
