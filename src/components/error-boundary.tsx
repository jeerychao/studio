// src/components/error-boundary.tsx
'use client';

import React, { useEffect } from 'react';
// import { useErrorHandler } from '@/hooks/use-error-handler'; // Not using for now, as it causes infinite loop
import { Button } from './ui/button';
import { logger } from '@/lib/logger'; // Use logger for more structured logging

interface ErrorBoundaryProps {
  error: Error & { digest?: string }; // Next.js error boundary errors have digest
  reset: () => void;
}

export default function ErrorBoundary({ error, reset }: ErrorBoundaryProps) {
  // const { handleError } = useErrorHandler(); // Using toast here directly might cause loop if toast itself fails

  useEffect(() => {
    // Log the error to the console and potentially to a remote logging service
    logger.error('React ErrorBoundary caught an error', error, { digest: error.digest });

    // We could show a toast here, but if the error is persistent, it might keep re-showing.
    // The UI below is the primary way to inform the user.
    // Example:
    // toast({
    //   title: "应用渲染错误",
    //   description: "页面的一部分遇到了问题。",
    //   variant: "destructive"
    // });

  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-4 text-center">
      <h2 className="text-2xl font-semibold mb-4 text-destructive">哎呀，出错了！</h2>
      <p className="text-muted-foreground mb-2">
        应用的一部分遇到了问题。您可以尝试刷新页面或重试操作。
      </p>
      {process.env.NODE_ENV === 'development' && error.message && (
        <p className="text-xs text-destructive bg-destructive/10 p-2 rounded-md mb-4 break-all">
          错误详情: {error.message}
        </p>
      )}
      {error.digest && (
         <p className="text-xs text-muted-foreground mb-6">错误摘要 (供技术支持参考): {error.digest}</p>
      )}
      <div className="space-x-4">
        <Button onClick={() => window.location.reload()}>
          刷新页面
        </Button>
        <Button onClick={() => reset()} variant="outline">
          尝试重试
        </Button>
      </div>
    </div>
  );
}
