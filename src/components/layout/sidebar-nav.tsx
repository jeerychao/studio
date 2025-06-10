
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Network,
  Cable,
  Globe,
  Users,
  ShieldCheck,
  FileDown,
  ListChecks,
  Search,
  Settings2 as SettingsIconLucide,
  Signal,     // Added for ISP
  HardDrive,  // Added for Device
  Link2,      // Added for Device Connection
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import * as React from "react";
import { useCurrentUser, hasPermission, type CurrentUserContextValue } from "@/hooks/use-current-user";
import type { PermissionId } from "@/types";
import { PERMISSIONS } from "@/types";
import { logger } from "@/lib/logger";


interface NavItemConfig {
  href: string;
  label: string;
  icon: React.ElementType;
  requiredPermission?: PermissionId;
  subItems?: NavItemConfig[];
}

const navItemConfigs: NavItemConfig[] = [
  { href: "/dashboard", label: "仪表盘", icon: LayoutDashboard, requiredPermission: PERMISSIONS.VIEW_DASHBOARD },
  {
    href: "/ip-management", 
    label: "IP 管理",
    icon: Network,
    subItems: [
      { href: "/vlans", label: "VLAN 管理", icon: Cable, requiredPermission: PERMISSIONS.VIEW_VLAN },
      { href: "/subnets", label: "子网管理", icon: Network, requiredPermission: PERMISSIONS.VIEW_SUBNET },
      { href: "/ip-addresses", label: "IP 地址管理", icon: Globe, requiredPermission: PERMISSIONS.VIEW_IPADDRESS },
    ],
  },
  {
    href: "/query",
    label: "信息查询",
    icon: Search,
    requiredPermission: PERMISSIONS.VIEW_QUERY_PAGE,
  },
  {
    href: "/user-role-management", 
    label: "用户和角色",
    icon: Users,
    subItems: [
      { href: "/users", label: "用户管理", icon: Users, requiredPermission: PERMISSIONS.VIEW_USER },
      { href: "/roles", label: "角色管理", icon: ShieldCheck, requiredPermission: PERMISSIONS.VIEW_ROLE },
    ],
  },
  {
    href: "/system-settings", // New parent group for settings
    label: "系统设置",
    icon: SettingsIconLucide,
    subItems: [
      { href: "/settings/isps", label: "ISP 管理", icon: Signal, requiredPermission: PERMISSIONS.VIEW_ISP },
      { href: "/settings/devices", label: "设备管理", icon: HardDrive, requiredPermission: PERMISSIONS.VIEW_DEVICE },
      { href: "/settings/device-connections", label: "设备连接管理", icon: Link2, requiredPermission: PERMISSIONS.VIEW_DEVICECONNECTION },
    ],
  },
  {
    href: "/tools/import-export",
    label: "数据导出",
    icon: FileDown,
    requiredPermission: PERMISSIONS.PERFORM_TOOLS_EXPORT 
  },
  { href: "/audit-logs", label: "审计日志", icon: ListChecks, requiredPermission: PERMISSIONS.VIEW_AUDIT_LOG },
  // The old "/settings" link is removed as its functionality will be covered by the new sub-pages or is minimal.
];

export function SidebarNav() {
  const pathname = usePathname();
  const { currentUser, isAuthLoading } = useCurrentUser();

  const filterNavItemsByPermission = React.useCallback((items: NavItemConfig[], user: CurrentUserContextValue | null): NavItemConfig[] => {
    if (!user || !user.permissions || !Array.isArray(user.permissions)) {
      return [];
    }

    return items.map(item => {
      let hasAccessToCurrentItem = true; 
      if (item.requiredPermission) {
        hasAccessToCurrentItem = hasPermission(user, item.requiredPermission);
      }

      let filteredSubItems: NavItemConfig[] | undefined = undefined;
      if (item.subItems && item.subItems.length > 0) {
        filteredSubItems = filterNavItemsByPermission(item.subItems, user);
        if (!item.requiredPermission && filteredSubItems.length === 0) {
          return null; 
        }
      }
      
      if (item.requiredPermission && !hasAccessToCurrentItem) {
        return null;
      }

      return { ...item, subItems: filteredSubItems };
    }).filter(item => item !== null) as NavItemConfig[];
  }, []);


  const accessibleNavItems = React.useMemo(() => {
      if (isAuthLoading || !currentUser) {
        return [];
      }
      let items = filterNavItemsByPermission(navItemConfigs, currentUser);
      return items;
  }, [currentUser, isAuthLoading, filterNavItemsByPermission]);

  const [openAccordionItems, setOpenAccordionItems] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (isAuthLoading || !accessibleNavItems || accessibleNavItems.length === 0) {
        setOpenAccordionItems(currentOpenItems => {
            return currentOpenItems.length > 0 ? [] : currentOpenItems;
        });
        return;
    }
    const activeParentGroup = accessibleNavItems.find(item => item.subItems?.some(sub => pathname.startsWith(sub.href)));
    if (activeParentGroup) {
        setOpenAccordionItems(currentOpenItems => {
            if (currentOpenItems.includes(activeParentGroup.href)) {
                return currentOpenItems;
            }
            return [...currentOpenItems, activeParentGroup.href];
        });
    }
  }, [pathname, accessibleNavItems, isAuthLoading]);

  const renderNavItem = (item: NavItemConfig, isSubItem = false) => {
    const Icon = item.icon;
    const isActive = pathname === item.href || (pathname.startsWith(item.href) && item.href !== "/" && item.href.length > 1 && (!item.subItems || item.subItems.length === 0));

    const linkClass = cn(
      "flex items-center gap-3 rounded-lg px-3 py-2 text-sidebar-foreground transition-all hover:text-sidebar-primary-foreground hover:bg-sidebar-accent group-data-[collapsible=icon]:justify-center",
      isActive && "bg-sidebar-primary text-sidebar-primary-foreground",
      isSubItem ? "text-sm" : "font-medium"
    );

    if (item.subItems && item.subItems.length > 0) {
      const isActiveGroup = item.subItems.some(sub => pathname.startsWith(sub.href));
      const isOpen = openAccordionItems.includes(item.href);

      const triggerClass = cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sidebar-foreground transition-all hover:text-sidebar-primary-foreground hover:bg-sidebar-accent group-data-[collapsible=icon]:justify-center",
        isSubItem ? "text-sm" : "font-medium",
        "justify-between hover:no-underline w-full",
         (isOpen && isActiveGroup) ? "bg-sidebar-primary text-sidebar-primary-foreground" :
         (isOpen) ? "text-sidebar-primary-foreground bg-sidebar-accent" : ""
      );

      return (
        <AccordionItem key={item.href} value={item.href} className="border-none">
          <AccordionTrigger className={triggerClass}>
            <div className="flex items-center gap-3 group-data-[collapsible=icon]:hidden">
              <Icon className="h-5 w-5" />
              <span className="truncate">{item.label}</span>
            </div>
             <div className="hidden items-center gap-3 group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center">
              <Icon className="h-5 w-5" />
            </div>
          </AccordionTrigger>
          <AccordionContent className="pb-0 pl-4 pt-1 group-data-[collapsible=icon]:hidden">
            <nav className="flex flex-col gap-1">
              {item.subItems.map((subItem) => renderNavItem(subItem, true))}
            </nav>
          </AccordionContent>
        </AccordionItem>
      );
    }

    return (
      <Link key={item.href} href={item.href} className={linkClass}>
        <Icon className="h-5 w-5" />
        <span className="truncate group-data-[collapsible=icon]:hidden">{item.label}</span>
      </Link>
    );
  };

  if (isAuthLoading) {
    return (
      <>
        <div className="p-4 text-sm text-sidebar-foreground">加载导航...</div>
      </>
    );
  }
  if (!currentUser) {
    return (
      <>
        <div className="p-4 text-sm text-sidebar-foreground">加载用户数据错误或用户未登录。</div>
      </>
    );
  }
  
  if (accessibleNavItems.length === 0 && currentUser.id !== 'guest-fallback-id') {
    return (
      <>
        <div className="p-4 text-sm text-sidebar-foreground">没有可访问的导航项。请检查用户权限。</div>
      </>
    );
  }
   if (accessibleNavItems.length === 0 && currentUser.id === 'guest-fallback-id') {
    return (
        <>
          <div className="p-4 text-sm text-sidebar-foreground">访客无导航项。</div>
        </>
    );
  }

  return (
    <>
      <Accordion
        type="multiple"
        className="w-full"
        value={openAccordionItems}
        onValueChange={setOpenAccordionItems}
      >
        {accessibleNavItems.map((item) => renderNavItem(item))}
      </Accordion>
    </>
  );
}
