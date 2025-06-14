
"use client";

import Link from "next/link";
import { useRouter, usePathname } from 'next/navigation';
import * as React from "react";
import { Network, Loader2 } from "lucide-react"; 
import Image from 'next/image';
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
import { Toaster } from "@/components/ui/toaster";
import { useCurrentUser, type CurrentUserContextValue } from "@/hooks/use-current-user";
import { logger } from "@/lib/logger";

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
    logger.debug("[DashboardLayout Effect] Running. isAuthLoading:", isAuthLoading, "currentUser:", currentUser ? currentUser.username : 'null');
    if (isAuthLoading) {
      setAuthStatus('loading');
      logger.info("DashboardLayout: Auth status is loading (isAuthLoading true).");
      return;
    }

    if (currentUser && currentUser.id && !(currentUser.id === 'guest-fallback-id' && currentUser.username === 'Guest')) {
        setAuthStatus('authenticated');
        logger.info(`DashboardLayout: User authenticated: ${currentUser.username} (ID: ${currentUser.id}). Current path: ${pathname}`);
        if (pathname === '/login'){
             logger.info("DashboardLayout: User authenticated and on /login, redirecting to /dashboard.");
             router.replace('/dashboard'); 
        }
    } else { 
      setAuthStatus('unauthenticated');
      logger.warn(`DashboardLayout: User unauthenticated or guest. Current path: ${pathname}. Attempting redirect to /login if not already there.`);
      if (pathname !== '/login') {
        router.replace('/login');
      }
    }
  }, [currentUser, isAuthLoading, router, pathname]);

  if (authStatus === 'loading') {
    logger.info("DashboardLayout: Auth status is 'loading', rendering loading spinner.");
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg">加载应用中...</p>
      </div>
    );
  }

  if (authStatus === 'unauthenticated' && pathname !== '/login') {
    logger.info("DashboardLayout: Auth status 'unauthenticated' and not on /login, rendering redirect message.");
    return (
        <div className="flex flex-col items-center justify-center h-screen">
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-lg text-muted-foreground">会话无效或已过期。</p>
            <p className="text-md text-muted-foreground">正在重定向到登录页面...</p>
        </div>
    );
  }
  
  logger.info("DashboardLayout: Rendering main layout content. AuthStatus:", authStatus);
  return (
    <SidebarProvider defaultOpen={true}>
      <Sidebar side="left" variant="sidebar" collapsible="icon" className="border-r">
        <SidebarHeader className="border-b h-16 flex items-center justify-center px-2">
          <Link href="/dashboard" className="flex items-center justify-center h-full w-full">
            <div className="group-data-[collapsible=icon]:hidden">
              <Image
                src="/images/my-logo.png" 
                alt="Company Logo" 
                width={300} 
                height={80}  
                className="h-10 w-auto" 
                priority 
              />
            </div>
            <div className="hidden items-center group-data-[collapsible=icon]:flex">
              <Network className="h-7 w-7 text-sidebar-primary" />
            </div>
          </Link>
        </SidebarHeader>
        <SidebarContent className="p-2">
          <SidebarNav />
        </SidebarContent>
        <SidebarFooter className="p-2 border-t mt-auto">
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <Header />
        <main className="flex-1 px-4 py-2 md:px-6 md:py-3 lg:px-8 lg:py-4 overflow-auto">
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
