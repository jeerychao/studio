
"use client";

import * as React from "react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { currentUser, isAuthLoading } = useCurrentUser();
  const router = useRouter();

  // The redirect logic is now a side-effect that runs only when the conditions are met.
  React.useEffect(() => {
    // We only want to check for redirection *after* the initial loading is complete.
    if (!isAuthLoading && !currentUser) {
      router.replace('/login');
    }
  }, [isAuthLoading, currentUser, router]);

  // If we are still loading, or if we are not authenticated, show a loading spinner.
  // The useEffect above will handle the redirect for the unauthenticated case.
  // This prevents the redirect loop by showing a consistent loading state
  // until the user is authenticated.
  if (isAuthLoading || !currentUser) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg">验证身份中...</p>
      </div>
    );
  }

  // If loading is done and the user is authenticated, render the children.
  return <>{children}</>;
}
