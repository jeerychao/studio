
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
  Settings2 as SettingsIconLucide, // Added for settings temporary debug
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
    icon: Network, // No specific permission for the group itself, visibility depends on children
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
    href: "/user-management", 
    label: "用户和角色", // No specific permission for the group itself
    icon: Users,
    subItems: [
      { href: "/users", label: "用户管理", icon: Users, requiredPermission: PERMISSIONS.VIEW_USER },
      { href: "/roles", label: "角色管理", icon: ShieldCheck, requiredPermission: PERMISSIONS.VIEW_ROLE },
    ],
  },
  {
    href: "/tools/import-export",
    label: "数据导出",
    icon: FileDown,
    requiredPermission: PERMISSIONS.PERFORM_TOOLS_EXPORT 
  },
  { href: "/audit-logs", label: "审计日志", icon: ListChecks, requiredPermission: PERMISSIONS.VIEW_AUDIT_LOG },
  // Settings is handled by a separate button in SidebarFooter
  // { href: "/settings", label: "设置", icon: SettingsIconLucide, requiredPermission: PERMISSIONS.VIEW_SETTINGS },
];

export function SidebarNav() {
  const pathname = usePathname();
  const { currentUser, isAuthLoading } = useCurrentUser();

  // logger.debug("[SidebarNav] Render. Pathname:", pathname, "isAuthLoading:", isAuthLoading, "currentUser:", currentUser ? currentUser.username : 'null');

  const filterNavItemsByPermission = React.useCallback((items: NavItemConfig[], user: CurrentUserContextValue | null): NavItemConfig[] => {
    // logger.debug("[filterNavItemsByPermission] Start filtering. User:", user ? user.username : "null", "User permissions (first 5):", user?.permissions?.slice(0,5));
    if (!user || !user.permissions || !Array.isArray(user.permissions)) {
      // logger.warn("[filterNavItemsByPermission] User is null or permissions array is invalid. Returning empty list.");
      return [];
    }

    return items.map(item => {
      // logger.debug(`[filterNavItemsByPermission] Processing item: ${item.label}, Href: ${item.href}, RequiredPerm: ${item.requiredPermission}`);
      
      let hasAccessToCurrentItem = true; 
      if (item.requiredPermission) {
        hasAccessToCurrentItem = hasPermission(user, item.requiredPermission);
        // logger.debug(`[filterNavItemsByPermission] Item '${item.label}' requires '${item.requiredPermission}'. User has permission: ${hasAccessToCurrentItem}`);
      }

      let filteredSubItems: NavItemConfig[] | undefined = undefined;
      if (item.subItems && item.subItems.length > 0) {
        // logger.debug(`[filterNavItemsByPermission] Item '${item.label}' has subItems. Filtering them...`);
        filteredSubItems = filterNavItemsByPermission(item.subItems, user);
        // logger.debug(`[filterNavItemsByPermission] Item '${item.label}' - Filtered subItems count: ${filteredSubItems.length}`);
        
        // If a parent group item has no specific permission of its own,
        // it should only be shown if at least one of its children is visible.
        if (!item.requiredPermission && filteredSubItems.length === 0) {
          // logger.debug(`[filterNavItemsByPermission] Group item '${item.label}' has no required perm and no visible children. Hiding group.`);
          return null; 
        }
      }
      
      // If the item itself requires a permission and the user doesn't have it, hide it.
      if (item.requiredPermission && !hasAccessToCurrentItem) {
        // logger.debug(`[filterNavItemsByPermission] Item '${item.label}' access denied due to its own required permission. Hiding.`);
        return null;
      }

      return { ...item, subItems: filteredSubItems };
    }).filter(item => item !== null) as NavItemConfig[];
  }, []);


  const accessibleNavItems = React.useMemo(() => {
      // logger.debug("[SidebarNav useMemo accessibleNavItems] Recalculating. isAuthLoading:", isAuthLoading, "currentUser exists:", !!currentUser);
      if (isAuthLoading || !currentUser) {
        // logger.debug("[SidebarNav useMemo accessibleNavItems] Auth loading or no current user, returning empty array for accessibleNavItems.");
        return [];
      }
      // logger.debug("[SidebarNav useMemo accessibleNavItems] Calculating for user:", currentUser.username, "User Permissions (first 5):", currentUser.permissions?.slice(0,5));
      let items = filterNavItemsByPermission(navItemConfigs, currentUser);
      // logger.debug(`[SidebarNav useMemo accessibleNavItems] Final calculated items for user ${currentUser.username}:`, items.map(i=> ({label: i.label, href: i.href, subItemsCount: i.subItems?.length || 0 })));
      return items;
  }, [currentUser, isAuthLoading, filterNavItemsByPermission]);

  const [openAccordionItems, setOpenAccordionItems] = React.useState<string[]>([]);

  React.useEffect(() => {
    // logger.debug("[SidebarNav useEffect openAccordionItems] Running. Pathname:", pathname, "isAuthLoading:", isAuthLoading, "AccessibleItems count:", accessibleNavItems.length);
    if (isAuthLoading || !accessibleNavItems || accessibleNavItems.length === 0) {
        setOpenAccordionItems(currentOpenItems => {
            // if (currentOpenItems.length > 0) logger.debug("[SidebarNav useEffect openAccordionItems] Auth loading or no items, clearing open accordions.");
            return currentOpenItems.length > 0 ? [] : currentOpenItems;
        });
        return;
    }
    const activeParentGroup = accessibleNavItems.find(item => item.subItems?.some(sub => pathname.startsWith(sub.href)));
    if (activeParentGroup) {
        // logger.debug("[SidebarNav useEffect openAccordionItems] Active parent group found:", activeParentGroup.label);
        setOpenAccordionItems(currentOpenItems => {
            if (currentOpenItems.includes(activeParentGroup.href)) {
                // logger.debug("[SidebarNav useEffect openAccordionItems] Accordion for active group already open.");
                return currentOpenItems;
            }
            // logger.debug("[SidebarNav useEffect openAccordionItems] Opening accordion for active group:", activeParentGroup.label);
            return [...currentOpenItems, activeParentGroup.href];
        });
    } else {
        // logger.debug("[SidebarNav useEffect openAccordionItems] No active parent group found for current path.");
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

  // logger.debug("[SidebarNav DEBUG Final Render Check] isAuthLoading:", isAuthLoading, "currentUser exists:", !!currentUser);
  // if(currentUser) {
  //   logger.debug("[SidebarNav DEBUG Final Render Check] currentUser.username:", currentUser.username, "currentUser.permissions (count):", currentUser.permissions?.length);
  //   // logger.debug("[SidebarNav DEBUG Final Render Check] currentUser.permissions (actual):", currentUser.permissions);
  // }
  // logger.debug("[SidebarNav DEBUG Final Render Check] accessibleNavItems count:", accessibleNavItems?.length);
  // logger.debug("[SidebarNav DEBUG Final Render Check] accessibleNavItems (actual labels):", accessibleNavItems?.map(i => i.label));


  const TempDebugInfo = () => {
    if (!currentUser) return <div className="p-2 text-xs text-red-400 bg-red-900/50 rounded">调试: currentUser 为空</div>;
    return (
      <div className="p-2 mb-2 text-xs bg-gray-800/50 text-gray-300 border border-gray-700/50 rounded">
        <p><strong>临时调试信息:</strong></p>
        <p>用户: {currentUser.username}</p>
        <p>角色: {currentUser.roleName}</p>
        <p>权限数 (currentUser): {currentUser.permissions?.length || 0}</p>
        <p>可访问菜单项数: {accessibleNavItems?.length || 0}</p>
        <p className="mt-1">权限 (前5): {currentUser.permissions?.slice(0,5).join(', ') || '无'}...</p>
        <p className="mt-1">可访问菜单: {accessibleNavItems?.map(item => item.label).join(', ') || '无'}</p>
      </div>
    );
  };


  if (isAuthLoading) {
    // logger.debug("[SidebarNav] Render: Auth loading, showing loading message.");
    return (
      <>
        {/* <TempDebugInfo /> */}
        <div className="p-4 text-sm text-sidebar-foreground">加载导航...</div>
      </>
    );
  }
  if (!currentUser) {
    // logger.warn("[SidebarNav] Render: No current user, showing error message.");
    return (
      <>
        <TempDebugInfo /> {/* Show debug info even if currentUser is null to see what it is */}
        <div className="p-4 text-sm text-sidebar-foreground">加载用户数据错误或用户未登录。</div>
      </>
    );
  }
  
  if (accessibleNavItems.length === 0 && currentUser.id !== 'guest-fallback-id') {
    // logger.warn(`[SidebarNav] Render: No accessible nav items for user ${currentUser.username} (not guest). Check permissions.`);
    return (
      <>
        <TempDebugInfo />
        <div className="p-4 text-sm text-sidebar-foreground">没有可访问的导航项。请检查用户权限。</div>
      </>
    );
  }
   if (accessibleNavItems.length === 0 && currentUser.id === 'guest-fallback-id') {
    // logger.info(`[SidebarNav] Render: No accessible nav items for GUEST user.`);
    return (
        <>
          <TempDebugInfo />
          <div className="p-4 text-sm text-sidebar-foreground">访客无导航项。</div>
        </>
    );
  }

  return (
    <>
      <TempDebugInfo />
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

