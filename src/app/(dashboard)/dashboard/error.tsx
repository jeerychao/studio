
'use client'; // Error components must be Client Components

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error("Dashboard page error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center h-full p-4 text-center">
      <AlertTriangle className="h-16 w-16 text-destructive mb-4" />
      <h2 className="text-2xl font-semibold mb-2 text-destructive">哎呀，仪表盘出错了！</h2>
      <p className="text-muted-foreground mb-4">
        加载仪表盘时遇到问题。您可以尝试重新加载。
      </p>
      {error?.message && (
        <p className="text-xs text-destructive bg-destructive/10 p-2 rounded-md mb-6 break-all">
          错误详情: {error.message}
        </p>
      )}
      <Button
        onClick={
          // Attempt to recover by trying to re-render the segment
          () => reset()
        }
      >
        再试一次
      </Button>
    </div>
  );
}
