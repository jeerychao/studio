
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
    requiredPermission: PERMISSIONS.VIEW_SUBNET, // Parent group might need a base permission, or rely on sub-items
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
    label: "用户和角色",
    icon: Users,
    requiredPermission: PERMISSIONS.VIEW_USER, // Parent group
    subItems: [
      { href: "/users", label: "用户管理", icon: Users, requiredPermission: PERMISSIONS.VIEW_USER },
      { href: "/roles", label: "角色管理", icon: ShieldCheck, requiredPermission: PERMISSIONS.VIEW_ROLE },
    ],
  },
  {
    href: "/tools/import-export",
    label: "数据导出",
    icon: FileDown,
    requiredPermission: PERMISSIONS.VIEW_TOOLS_IMPORT_EXPORT
  },
  { href: "/audit-logs", label: "审计日志", icon: ListChecks, requiredPermission: PERMISSIONS.VIEW_AUDIT_LOG },
];

export function SidebarNav() {
  const pathname = usePathname();
  const { currentUser, isAuthLoading } = useCurrentUser();

  // logger.debug("[SidebarNav] Render. Pathname:", pathname, "isAuthLoading:", isAuthLoading, "currentUser:", currentUser ? currentUser.username : 'null');
  // if (currentUser) {
  // logger.debug("[SidebarNav] currentUser.permissions:", currentUser.permissions);
  // }


  const filterNavItemsByPermission = React.useCallback((items: NavItemConfig[], user: CurrentUserContextValue | null): NavItemConfig[] => {
    if (!user || !user.permissions || !Array.isArray(user.permissions)) {
      // logger.debug("[SidebarNav filterNavItemsByPermission] No user or invalid permissions array, returning empty.", { userId: user?.id, hasPermissionsProp: !!user?.permissions, isPermissionsArray: Array.isArray(user?.permissions) });
      return [];
    }
    // logger.debug(`[SidebarNav filterNavItemsByPermission] Filtering for user: ${user.username}, permissions: ${user.permissions.join(', ')}`);

    return items.map(item => {
      const hasAccessToItem = item.requiredPermission ? hasPermission(user, item.requiredPermission) : true;
      // logger.debug(`[SidebarNav filterNavItemsByPermission] Item: ${item.label}, Required: ${item.requiredPermission}, HasAccess: ${hasAccessToItem}`);
      
      if (!hasAccessToItem) return null;

      let filteredSubItems: NavItemConfig[] | undefined = undefined;
      if (item.subItems && item.subItems.length > 0) {
        filteredSubItems = filterNavItemsByPermission(item.subItems, user);
        // A parent group should only be hidden if it has NO accessible sub-items
        // AND it's a "management" type group that doesn't have its own direct page to navigate to.
        // If a group like "IP Management" has a requiredPermission itself, it should be shown if user has that perm,
        // even if sub-items are all filtered out (though usually the parent perm implies some sub-item perms).
        // The current logic: if filteredSubItems is empty AND it's a "management" group, hide it.
        // This seems reasonable if the parent group itself isn't a navigable link.
        if (filteredSubItems.length === 0 && item.href.includes("-management")) { // Or a more generic check if it's a non-navigable group
          // logger.debug(`[SidebarNav filterNavItemsByPermission] Management group ${item.label} has no accessible sub-items, hiding group.`);
           return null;
        }
      }
      return { ...item, subItems: filteredSubItems };
    }).filter(item => item !== null) as NavItemConfig[];
  }, []);

  const accessibleNavItems = React.useMemo(() => {
      if (isAuthLoading || !currentUser) {
        // logger.debug("[SidebarNav useMemo accessibleNavItems] Auth loading or no current user, returning empty array.", { isAuthLoading, hasCurrentUser: !!currentUser });
        return [];
      }
      // logger.debug("[SidebarNav useMemo accessibleNavItems] Calculating for user:", currentUser.username, "Permissions:", currentUser.permissions);
      let items = filterNavItemsByPermission(navItemConfigs, currentUser);
      // This secondary filter seems redundant if filterNavItemsByPermission already handles the subItems length check for management groups correctly.
      // items = items.filter(item => {
      //   if (item.subItems && item.subItems.length === 0 && item.href.includes("-management")) {
      //       // logger.debug(`[SidebarNav useMemo accessibleNavItems] Filtering out empty management group: ${item.label}`);
      //       return false;
      //   }
      //   return true;
      // });
      // logger.debug("[SidebarNav useMemo accessibleNavItems] Final calculated items:", items.map(i => i.label));
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

  if (isAuthLoading) {
    // logger.debug("[SidebarNav] Render: Auth loading, showing loading message.");
    return <div className="p-4 text-sm text-sidebar-foreground">加载导航...</div>;
  }
  if (!currentUser) {
    // logger.warn("[SidebarNav] Render: No current user (still potentially initializing or truly no user), showing error message.");
    return <div className="p-4 text-sm text-sidebar-foreground">加载用户数据错误或用户未登录。</div>;
  }
  // Check after currentUser is confirmed to be not null
  if (accessibleNavItems.length === 0 && currentUser.id !== 'guest-fallback-id') {
    // logger.warn(`[SidebarNav] Render: No accessible nav items for user ${currentUser.username} (not guest). Permissions: ${currentUser.permissions?.join(', ')}`);
    return <div className="p-4 text-sm text-sidebar-foreground">没有可访问的导航项。请检查用户权限。</div>;
  }
   if (accessibleNavItems.length === 0 && currentUser.id === 'guest-fallback-id') {
    // logger.info(`[SidebarNav] Render: No accessible nav items for GUEST user.`);
    return <div className="p-4 text-sm text-sidebar-foreground">访客无导航项。</div>;
  }


  return (
    <Accordion
      type="multiple"
      className="w-full"
      value={openAccordionItems}
      onValueChange={setOpenAccordionItems}
    >
      {accessibleNavItems.map((item) => renderNavItem(item))}
    </Accordion>
  );
}
