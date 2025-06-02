
"use client";

import Link from "next/link";
import { useRouter } from 'next/navigation'; // For App Router
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
import { hasPermission, useCurrentUser, MOCK_USER_STORAGE_KEY } from "@/hooks/use-current-user";

function ConditionalSettingsButton() {
  const currentUser = useCurrentUser();
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
  const currentUser = useCurrentUser();
  const router = useRouter();
  const [authStatus, setAuthStatus] = React.useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');

  React.useEffect(() => {
    // useCurrentUser hook has its own useEffect to sync with localStorage.
    // We check currentUser properties once it's stable.
    if (currentUser && currentUser.id) { // Ensure currentUser object and id exist
      if (currentUser.id === 'guest-fallback-id' && currentUser.username === 'Guest') {
        setAuthStatus('unauthenticated');
        router.replace('/login');
      } else {
        setAuthStatus('authenticated');
      }
    }
    // If currentUser or currentUser.id is not yet available, it remains 'loading'
    // This might happen if useCurrentUser is still initializing
  }, [currentUser, router]);

  if (authStatus === 'loading') {
    return (
      <div className="flex items-center justify-center h-screen">
        <Network className="h-12 w-12 animate-spin text-primary" /> 
        <p className="ml-4 text-lg">Loading application...</p>
      </div>
    );
  }

  if (authStatus === 'unauthenticated') {
    // Should be redirected by the useEffect, but as a fallback, don't render children.
    // Or, you can return a minimal message here too.
    return null; 
  }

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
