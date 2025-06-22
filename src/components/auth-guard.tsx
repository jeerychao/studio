
"use client";

import * as React from "react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { logger } from "@/lib/logger"; // Import logger for better client-side diagnostics

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { currentUser, isAuthLoading } = useCurrentUser();
  const router = useRouter();
  const [redirectTriggered, setRedirectTriggered] = React.useState(false);

  React.useEffect(() => {
    // Only perform checks after the initial authentication status has been determined.
    if (isAuthLoading) {
      return; // Still loading, do nothing yet.
    }

    // If loading is complete AND there is no user AND a redirect hasn't been triggered yet.
    if (!currentUser && !redirectTriggered) {
      setRedirectTriggered(true); // Mark that we are initiating a redirect.
      logger.warn("AuthGuard: User not authenticated. Redirecting from a protected page to /login.");
      router.replace('/login');
    }
  }, [isAuthLoading, currentUser, router, redirectTriggered]);

  // While the authentication status is being determined, show a loading screen.
  // This prevents rendering children components that might rely on user data prematurely.
  if (isAuthLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg">验证身份中...</p>
      </div>
    );
  }

  // If loading is complete and we have a user, it's safe to render the children.
  // If there's no user, this will render `null` for a brief moment while the useEffect
  // above triggers the redirect. This prevents rendering the children at all for an
  // unauthenticated user, avoiding potential errors in child components.
  if (currentUser) {
    return <>{children}</>;
  }
  
  // If not loading and no user, show a loading/redirecting message
  // to avoid a blank screen while redirecting.
  return (
      <div className="flex flex-col items-center justify-center h-full">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-lg text-muted-foreground">会话无效或已过期，正在重定向到登录页面...</p>
      </div>
  );
}
