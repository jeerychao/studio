
"use client";

import * as React from "react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useRouter, usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import { logger } from "@/lib/logger";

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { currentUser, isAuthLoading } = useCurrentUser();
  const router = useRouter();
  const pathname = usePathname();

  React.useEffect(() => {
    if (isAuthLoading) {
      return; // Do nothing while we are waiting for the user data
    }

    const isAuthenticated = currentUser && currentUser.id && !(currentUser.id === 'guest-fallback-id' && currentUser.username === 'Guest');

    if (!isAuthenticated) {
      logger.warn(`AuthGuard: User is not authenticated. Redirecting from ${pathname} to /login.`);
      router.replace('/login');
    }
  }, [currentUser, isAuthLoading, router, pathname]);

  if (isAuthLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg">验证身份中...</p>
      </div>
    );
  }
  
  const isAuthenticated = currentUser && currentUser.id && !(currentUser.id === 'guest-fallback-id' && currentUser.username === 'Guest');

  if (!isAuthenticated) {
      return (
        <div className="flex flex-col items-center justify-center h-full">
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-lg text-muted-foreground">会话无效或已过期。</p>
            <p className="text-md text-muted-foreground">正在重定向到登录页面...</p>
        </div>
    );
  }

  return <>{children}</>;
}
