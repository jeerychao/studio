
"use client";
import Link from "next/link";
import { Menu, UserCircle, Network, Settings2 as SettingsIconLucide } from "lucide-react"; // Renamed Settings to avoid conflict
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

export function Header() {
  const { toggleSidebar, isMobile } = useSidebar();
  const { currentUser, isAuthLoading } = useCurrentUser(); 

  const handleLogout = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(MOCK_USER_STORAGE_KEY);
      window.location.href = '/login'; 
    }
  };

  return (
    <header className="flex h-16 items-center gap-4 border-b bg-card px-4 md:px-6 sticky top-0 z-30">
      {isMobile ? (
         <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="shrink-0 md:hidden">
              <Menu className="h-5 w-5" />
              <span className="sr-only">切换导航菜单</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="flex flex-col p-0 bg-sidebar text-sidebar-foreground">
            <SheetHeader className="border-b h-16 flex items-center px-6">
              <SheetTitle asChild>
                <Link href="/dashboard" className="flex items-center gap-2 font-semibold text-sidebar-primary-foreground">
                  <Network className="h-6 w-6 text-sidebar-primary" />
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
        <Button variant="outline" size="icon" className="shrink-0" onClick={toggleSidebar}>
            <Menu className="h-5 w-5" />
            <span className="sr-only">切换侧边栏</span>
        </Button>
      )}

      <div className="flex w-full items-center gap-4 md:ml-auto md:gap-2 lg:gap-4 justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full">
              <UserCircle className="h-7 w-7" /> {/* Increased size from h-6 w-6 */}
              <span className="sr-only">切换用户菜单</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{isAuthLoading ? '加载中...' : (currentUser?.username || '我的账户')}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings" className="flex items-center">
                <SettingsIconLucide className="mr-2 h-4 w-4" />
                设置
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
