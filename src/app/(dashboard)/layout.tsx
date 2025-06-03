
"use client";

import Link from "next/link";
import { useRouter, usePathname } from 'next/navigation'; // Added usePathname
import * as React from "react";
import { Network, Settings2 } from "lucide-react";
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
import { PERMISSIONS } from "@/types";
import { useCurrentUser, hasPermission, type CurrentUserContextValue } from "@/hooks/use-current-user";


function ConditionalSettingsButton() {
  const { currentUser, isAuthLoading } = useCurrentUser();

  if (isAuthLoading || !currentUser) {
    return null;
  }

  const canViewSettings = hasPermission(currentUser, PERMISSIONS.VIEW_SETTINGS);

  if (!canViewSettings) {
    return null;
  }

  return (
    <Button
      variant="ghost"
      className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-primary-foreground group-data-[collapsible=icon]:justify-center"
      asChild
    >
      <Link href="/settings">
        <Settings2 className="h-5 w-5" />
        <span className="ml-3 group-data-[collapsible=icon]:hidden">Settings</span>
      </Link>
    </Button>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { currentUser, isAuthLoading } = useCurrentUser();
  const router = useRouter();
  const pathname = usePathname(); // Get current path
  const [authStatus, setAuthStatus] = React.useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');

  React.useEffect(() => {
    if (isAuthLoading) {
      setAuthStatus('loading');
      return;
    }

    // isAuthLoading is false here, currentUser is stable from useCurrentUser
    if (currentUser && currentUser.id) {
      if (currentUser.id === 'guest-fallback-id' && currentUser.username === 'Guest') {
        setAuthStatus('unauthenticated');
        // Only redirect if not already on login page and current path is protected by this layout
        if (pathname !== '/login') {
            router.replace('/login');
        }
      } else {
        setAuthStatus('authenticated');
      }
    } else { // Should be guest if currentUser is null/undefined after loading
      setAuthStatus('unauthenticated');
      if (pathname !== '/login') {
        router.replace('/login');
      }
    }
  }, [currentUser, isAuthLoading, router, pathname]);

  if (authStatus === 'loading' || isAuthLoading) { // Also check isAuthLoading directly
    return (
      <div className="flex items-center justify-center h-screen">
        <Network className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg">Loading application...</p>
      </div>
    );
  }

  if (authStatus === 'unauthenticated') {
    // Redirect should have happened in useEffect. This is a fallback or to prevent rendering children.
    return null;
  }

  // authStatus === 'authenticated'
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
        <SidebarFooter className="p-2 border-t mt-auto">
           <ConditionalSettingsButton />
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <Header />
        <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
          {children}
        </main>
        <Toaster />
      </SidebarInset>
    </SidebarProvider>
  );
}
