
"use client";

import Link from "next/link";
import { useRouter, usePathname } from 'next/navigation';
import * as React from "react";
import { Network, Settings2, Loader2 } from "lucide-react"; 
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarInset,
} from "@/components/ui/sidebar";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/toaster";
// PERMISSIONS import is no longer needed here as the specific settings button is removed.
import { useCurrentUser, type CurrentUserContextValue } from "@/hooks/use-current-user";
import { logger } from "@/lib/logger";

// ConditionalSettingsButton is removed as per refactoring plan (no direct /settings link in footer)

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {  
  const { currentUser, isAuthLoading } = useCurrentUser();
  const router = useRouter();
  const pathname = usePathname();
  const [authStatus, setAuthStatus] = React.useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');

  React.useEffect(() => {
    if (isAuthLoading) {
      setAuthStatus('loading');
      logger.info("DashboardLayout: Auth status is loading (isAuthLoading true).");
      return;
    }

    if (currentUser && currentUser.id && !(currentUser.id === 'guest-fallback-id' && currentUser.username === 'Guest')) {
        setAuthStatus('authenticated');
        logger.info(`DashboardLayout: User authenticated: ${currentUser.username} (ID: ${currentUser.id}).`);
    } else { 
      setAuthStatus('unauthenticated');
      logger.warn(`DashboardLayout: User unauthenticated or guest. Current path: ${pathname}. Attempting redirect to /login if not already there.`);
      if (pathname !== '/login') {
        router.replace('/login');
      }
    }
  }, [currentUser, isAuthLoading, router, pathname]);

  if (authStatus === 'loading' || isAuthLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg">加载应用中...</p>
      </div>
    );
  }

  if (authStatus === 'unauthenticated') {
    if (pathname !== '/login') {
        // Display a message while redirecting
        logger.info("DashboardLayout: Rendering redirect message to /login.");
        return (
            <div className="flex flex-col items-center justify-center h-screen">
                <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
                <p className="text-lg text-muted-foreground">会话无效或已过期。</p>
                <p className="text-md text-muted-foreground">正在重定向到登录页面...</p>
            </div>
        );
    }
    logger.info("DashboardLayout: Auth status unauthenticated, but already on /login or redirect not needed. Rendering null from layout.");
    return null; 
  }

  // authStatus === 'authenticated'
  logger.info("DashboardLayout: Rendering authenticated layout.");
  return (
    <SidebarProvider defaultOpen={true}>
      <Sidebar side="left" variant="sidebar" collapsible="icon" className="border-r">
        <SidebarHeader className="border-b h-16">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold text-sidebar-primary-foreground">
            <Network className="h-7 w-7 text-sidebar-primary" />
            <span className="text-lg group-data-[collapsible=icon]:hidden">IPAM Lite</span>
          </Link>
        </SidebarHeader>
        <SidebarContent className="p-2">
          <SidebarNav />
        </SidebarContent>
        {/* Removed ConditionalSettingsButton from SidebarFooter */}
        <SidebarFooter className="p-2 border-t mt-auto">
           {/* Footer can be empty or contain other elements like version number if needed */}
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <Header />
        <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
          {children}
        </main>
        <footer className="py-4 px-4 md:px-6 lg:px-8 text-center text-xs text-muted-foreground border-t">
          <p>© {new Date().getFullYear()} IPAM Lite. 版权所有。联系方式: leejie2017@gmail.com</p>
        </footer>
        <Toaster />
      </SidebarInset>
    </SidebarProvider>
  );
}

    