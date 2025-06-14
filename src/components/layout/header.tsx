
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

      <div className="flex w-full items-center gap-2 md:ml-auto md:gap-2 lg:gap-2 justify-end"> {/* Adjusted gap for tighter packing */}
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="rounded-full h-10 w-auto px-2.5 flex items-center justify-center space-x-1.5 hover:bg-transparent hover:text-current"> {/* Changed to w-auto, added padding and space */}
              <UserCircle className="h-6 w-6" /> {/* Slightly smaller UserCircle */}
              <ChevronDown className="h-3 w-3 text-muted-foreground opacity-70" />
              <span className="sr-only">切换用户菜单</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{isAuthLoading ? '加载中...' : (currentUser?.username || '我的账户')}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/account/change-password" className="flex items-center">
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

