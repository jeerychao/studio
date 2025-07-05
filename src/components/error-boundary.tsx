
// src/components/error-boundary.tsx
'use client';

import React, { useEffect } from 'react';
import { useErrorHandler } from '@/hooks/use-error-handler'; 
import { Button } from './ui/button';
import { logger } from '@/lib/logger'; 

interface ErrorBoundaryProps {
  error: Error & { digest?: string }; 
  reset: () => void;
}

export default function ErrorBoundary({ error, reset }: ErrorBoundaryProps) {
  const { handleError } = useErrorHandler(); 

  useEffect(() => {
    logger.error('React ErrorBoundary caught an error', error, { digest: error.digest });

    // Attempt to show a toast. If Toaster is outside this boundary, it should be safe.
    // If this causes issues (e.g. infinite loop if Toaster itself errors), this may need to be removed
    // or a more robust global error notification system implemented.
    handleError(error);

  }, [error, handleError]);

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
