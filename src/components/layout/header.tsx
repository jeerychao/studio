
"use client";
import Link from "next/link";
import { Menu, UserCircle, Network, KeyRound, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SidebarNav } from "./sidebar-nav";
import { useSidebar } from "@/components/ui/sidebar";
import { MOCK_USER_STORAGE_KEY, useCurrentUser } from "@/hooks/use-current-user";
import { ThemeToggle } from "@/components/settings/theme-toggle";
import * as React from "react";
import { useRouter } from "next/navigation";
import { logger } from "@/lib/logger";

export function Header() {
  const { toggleSidebar, isMobile } = useSidebar();
  const { currentUser, isAuthLoading } = useCurrentUser();
  const router = useRouter();

  const handleLogout = () => {
    logger.info("Header: Logout initiated by user:", currentUser?.username);
    if (typeof window !== "undefined") {
      localStorage.removeItem(MOCK_USER_STORAGE_KEY);
      window.location.href = '/login'; 
    }
  };
  
  const usernameForDisplay = !isAuthLoading && currentUser ? currentUser.username : "用户";

  return (
    <header className="flex h-16 items-center gap-4 border-b bg-card px-4 md:px-6 sticky top-0 z-30">
      {isMobile ? (
         <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="shrink-0 md:hidden h-8 w-8">
              <Menu className="h-4 w-4" />
              <span className="sr-only">切换导航菜单</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="flex flex-col p-0 bg-sidebar text-sidebar-foreground">
            <SheetHeader className="border-b h-16 flex items-center justify-center px-6">
              <SheetTitle asChild>
                <Link href="/dashboard" className="flex items-center gap-2 font-semibold text-sidebar-primary-foreground">
                  <Network className="h-7 w-7 text-sidebar-primary" />
                  <span className="text-lg">IPAM Lite</span>
                </Link>
              </SheetTitle>
            </SheetHeader>
            <nav className="flex-1 overflow-auto py-4 px-2">
              <SidebarNav />
            </nav>
          </SheetContent>
        </Sheet>
      ) : (
        <Button variant="outline" size="icon" className="shrink-0 h-8 w-8" onClick={toggleSidebar}>
            <Menu className="h-4 w-4" />
            <span className="sr-only">切换侧边栏</span>
        </Button>
      )}

      <div className="flex w-full items-center gap-3 md:ml-auto md:gap-3 lg:gap-3 justify-end">
        <Link href="https://github.com/jeerychao" target="_blank" rel="noopener noreferrer" aria-label="GitHub Profile">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full h-10 w-10 flex items-center justify-center hover:bg-transparent hover:text-current"
          >
            <svg
              role="img"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
              fill="currentColor"
              className="h-5 w-5"
            >
              <title>GitHub</title>
              <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
            </svg>
          </Button>
        </Link>
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="rounded-full h-10 w-auto px-2.5 flex items-center justify-center space-x-1.5 hover:bg-transparent hover:text-current"
            >
              <UserCircle className="h-6 w-6" />
              <span className="text-sm font-medium group-data-[collapsible=icon]:hidden">
                {isAuthLoading ? "加载中..." : usernameForDisplay}
              </span>
              <ChevronDown className="h-3 w-3 text-muted-foreground opacity-70" />
              <span className="sr-only">切换用户菜单</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{isAuthLoading ? "加载中..." : usernameForDisplay}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/account/change-password" className="flex items-center w-full">
                <KeyRound className="mr-2 h-4 w-4" />
                修改密码
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout}>退出登录</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
