
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
  Search, // New Icon
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import * as React from "react";
import { useCurrentUser, hasPermission } from "@/hooks/use-current-user";
import type { CurrentUserContextValue } from "@/hooks/use-current-user";
import type { PermissionId } from "@/types";
import { PERMISSIONS } from "@/types";


interface NavItemConfig {
  href: string;
  label: string;
  icon: React.ElementType;
  requiredPermission?: PermissionId;
  subItems?: NavItemConfig[];
}

// Updated labels to Chinese
const navItemConfigs: NavItemConfig[] = [
  { href: "/dashboard", label: "仪表盘", icon: LayoutDashboard, requiredPermission: PERMISSIONS.VIEW_DASHBOARD },
  {
    href: "/ip-management",
    label: "IP 管理",
    icon: Network,
    requiredPermission: PERMISSIONS.VIEW_SUBNET, // Broad permission for the group
    subItems: [
      { href: "/vlans", label: "VLAN 管理", icon: Cable, requiredPermission: PERMISSIONS.VIEW_VLAN },
      { href: "/subnets", label: "子网管理", icon: Network, requiredPermission: PERMISSIONS.VIEW_SUBNET },
      { href: "/ip-addresses", label: "IP 地址管理", icon: Globe, requiredPermission: PERMISSIONS.VIEW_IPADDRESS },
    ],
  },
  {
    href: "/query", // New page route
    label: "信息查询", // Information Query
    icon: Search,
    requiredPermission: PERMISSIONS.VIEW_QUERY_PAGE,
  },
  {
    href: "/user-management",
    label: "用户和角色",
    icon: Users,
    requiredPermission: PERMISSIONS.VIEW_USER, // Broad permission for the group
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

  const filterNavItemsByPermission = React.useCallback((items: NavItemConfig[], user: CurrentUserContextValue | null): NavItemConfig[] => {
    if (!user) return [];
    return items.map(item => {
      const hasAccessToItem = item.requiredPermission ? hasPermission(user, item.requiredPermission) : true;
      if (!hasAccessToItem) return null;

      let filteredSubItems: NavItemConfig[] | undefined = undefined;
      if (item.subItems) {
        filteredSubItems = filterNavItemsByPermission(item.subItems, user);
        if (filteredSubItems.length === 0 && item.href.includes("-management")) {
           return null;
        }
      }
      return { ...item, subItems: filteredSubItems };
    }).filter(item => item !== null) as NavItemConfig[];
  }, []);

  const accessibleNavItems = React.useMemo(() => {
      if (isAuthLoading || !currentUser) return [];
      let items = filterNavItemsByPermission(navItemConfigs, currentUser);
      items = items.filter(item => {
        if (item.subItems && item.subItems.length === 0 && item.href.includes("-management")) {
            return false;
        }
        return true;
      });
      return items;
  }, [currentUser, isAuthLoading, filterNavItemsByPermission]);

  const [openAccordionItems, setOpenAccordionItems] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (isAuthLoading || !accessibleNavItems || accessibleNavItems.length === 0) {
        setOpenAccordionItems(currentOpenItems => currentOpenItems.length > 0 ? [] : currentOpenItems);
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
    return <div className="p-4 text-sm text-sidebar-foreground">加载导航...</div>;
  }
  if (!currentUser) {
    return <div className="p-4 text-sm text-sidebar-foreground">加载用户错误。</div>;
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
