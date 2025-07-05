
"use client";

import Link from "next/link";
import { Network } from "lucide-react"; 
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
import { AuthGuard } from "@/components/auth-guard"; // Import the new AuthGuard

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {  
  return (
    <SidebarProvider defaultOpen={true}>
      <Sidebar side="left" variant="sidebar" collapsible="icon" className="border-r">
        <SidebarHeader className="border-b h-16 flex items-center justify-center px-2">
          <Link href="/dashboard" className="flex items-center justify-center h-full w-full">
            <div className="group-data-[collapsible=icon]:hidden">
              <Image
                src="/images/my-logo.png" 
                alt="Company Logo" 
                width={120} 
                height={40}  
                className="h-10" 
                style={{ width: 'auto' }}
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
          <AuthGuard>
            {children}
          </AuthGuard>
        </main>
        <footer className="py-4 px-4 md:px-6 lg:px-8 text-center text-xs text-muted-foreground border-t">
          <p>© {new Date().getFullYear()} IPAM Lite. 版权所有.联系方式: leejie2017@gmail.com</p>
        </footer>
        <Toaster />
      </SidebarInset>
    </SidebarProvider>
  );
}
