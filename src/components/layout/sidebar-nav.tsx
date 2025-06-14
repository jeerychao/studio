
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
  ListChecks,
  Search,
  Settings2 as SettingsIconLucide,
  BookOpen, // Icon for Dictionaries
  Users2,   // Icon for User & Role Management
  FileText, // Icon for Audit Logs
  UploadCloud, // Icon for Data Export
  HardDrive, // For Local Device Dictionary
  CreditCard, // For Payment Source Dictionary
  ChevronDown, // Explicitly import if needed, though AccordionTrigger brings its own
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
  requiredPermission?: PermissionId | PermissionId[]; // Can be single or array for parent items
  subItems?: NavItemConfig[];
}

const navItemConfigs: NavItemConfig[] = [
  { href: "/dashboard", label: "仪表盘", icon: LayoutDashboard, requiredPermission: PERMISSIONS.VIEW_DASHBOARD },
  {
    href: "/ip-management",
    label: "IP 管理",
    icon: Network,
    requiredPermission: [PERMISSIONS.VIEW_VLAN, PERMISSIONS.VIEW_SUBNET, PERMISSIONS.VIEW_IPADDRESS],
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
    href: "/dictionaries", // New top-level parent for dictionaries
    label: "字典管理",
    icon: BookOpen,
    requiredPermission: [
        PERMISSIONS.VIEW_DICTIONARY_OPERATOR,
        PERMISSIONS.VIEW_DICTIONARY_LOCAL_DEVICE,
        PERMISSIONS.VIEW_DICTIONARY_PAYMENT_SOURCE
    ],
    subItems: [
      { href: "/dictionaries/operator", label: "运营商字典", icon: Network, requiredPermission: PERMISSIONS.VIEW_DICTIONARY_OPERATOR },
      { href: "/dictionaries/local-device", label: "本地设备字典", icon: HardDrive, requiredPermission: PERMISSIONS.VIEW_DICTIONARY_LOCAL_DEVICE },
      { href: "/dictionaries/payment-source", label: "付费来源字典", icon: CreditCard, requiredPermission: PERMISSIONS.VIEW_DICTIONARY_PAYMENT_SOURCE },
    ],
  },
  {
    href: "/system", // New top-level parent for system-wide settings/logs/tools
    label: "系统管理",
    icon: SettingsIconLucide,
    requiredPermission: [
        PERMISSIONS.VIEW_TOOLS_IMPORT_EXPORT,
        PERMISSIONS.VIEW_USER,
        PERMISSIONS.VIEW_ROLE,
        PERMISSIONS.VIEW_AUDIT_LOG,
    ],
    subItems: [
      { href: "/tools/import-export", label: "数据导出", icon: UploadCloud, requiredPermission: PERMISSIONS.VIEW_TOOLS_IMPORT_EXPORT },
      { href: "/users", label: "用户管理", icon: Users, requiredPermission: PERMISSIONS.VIEW_USER },
      { href: "/roles", label: "角色管理", icon: ShieldCheck, requiredPermission: PERMISSIONS.VIEW_ROLE },
      { href: "/audit-logs", label: "审计日志", icon: FileText, requiredPermission: PERMISSIONS.VIEW_AUDIT_LOG },
    ],
  },
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
        if (Array.isArray(item.requiredPermission)) {
          hasAccessToCurrentItem = item.requiredPermission.some(perm => hasPermission(user, perm));
        } else {
          hasAccessToCurrentItem = hasPermission(user, item.requiredPermission);
        }
      }

      let filteredSubItems: NavItemConfig[] | undefined = undefined;
      if (item.subItems && item.subItems.length > 0) {
        filteredSubItems = filterNavItemsByPermission(item.subItems, user);
        // If the parent item itself doesn't have a specific permission (relies on children having perms),
        // and all its children are filtered out, then hide the parent too.
        if ((!item.requiredPermission || (Array.isArray(item.requiredPermission) && item.requiredPermission.length === 0)) && filteredSubItems.length === 0) {
            return null;
        }
         // If parent has required permissions, but ALL children are filtered out, then parent itself also does not render (unless it's a direct link page)
        if (filteredSubItems.length === 0 && item.href === "/dictionaries" || item.href === "/system" || item.href === "/ip-management") { // Example parent-only links
            // Check if the parent itself should still be visible even if all children are gone.
            // This logic might need refinement based on whether parent items are pure groups or also links.
            // For now, if it's a group and all children are gone, and the group itself doesn't have its own unique required permission that was met, hide it.
            if (Array.isArray(item.requiredPermission) && !item.requiredPermission.some(perm => hasPermission(user, perm))) {
                return null;
            }
            if (!Array.isArray(item.requiredPermission) && item.requiredPermission && !hasPermission(user,item.requiredPermission)){
                return null;
            }
        }
      }
      
      if (!hasAccessToCurrentItem) {
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
    if (activeParentGroup && !openAccordionItems.includes(activeParentGroup.href)) {
        setOpenAccordionItems(currentOpenItems => {
            // Ensure not to add duplicate if already handled or if it's a re-render.
            if (!currentOpenItems.includes(activeParentGroup.href)) {
                 return [...currentOpenItems, activeParentGroup.href];
            }
            return currentOpenItems;
        });
    }
  // Only re-run if pathname or accessibleNavItems change, avoid re-running on openAccordionItems change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, accessibleNavItems, isAuthLoading]);

  const renderNavItem = (item: NavItemConfig, isSubItem = false) => {
    const Icon = item.icon;
    const isActive = pathname === item.href || (pathname.startsWith(item.href) && item.href !== "/" && item.href.length > 1 && (!item.subItems || item.subItems.length === 0));

    const linkClass = cn(
      "flex items-center gap-3 rounded-lg px-3 py-2 text-sidebar-foreground transition-all hover:text-sidebar-primary-foreground hover:bg-sidebar-accent group-data-[collapsible=icon]:justify-center",
      "group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:p-2 group-data-[collapsible=icon]:gap-0", // Centering for collapsed
      isActive && "bg-sidebar-primary text-sidebar-primary-foreground",
      isSubItem ? "text-sm" : "font-medium"
    );

    if (item.subItems && item.subItems.length > 0) {
      const isActiveGroup = item.subItems.some(sub => pathname.startsWith(sub.href));
      const isOpen = openAccordionItems.includes(item.href);

      const triggerClass = cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sidebar-foreground transition-all hover:text-sidebar-primary-foreground hover:bg-sidebar-accent", // Base styles
        "group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:p-2 group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:[&>.lucide-chevron-down]:hidden", // Collapsed styles
        isSubItem ? "text-sm" : "font-medium",
        "justify-between hover:no-underline w-full", // Layout styles
         (isOpen && isActiveGroup) ? "bg-sidebar-primary text-sidebar-primary-foreground" :
         (isOpen) ? "text-sidebar-primary-foreground bg-sidebar-accent" : ""
      );

      return (
        <AccordionItem key={item.href} value={item.href} className="border-none">
          <AccordionTrigger className={triggerClass}>
            {/* Content for expanded sidebar */}
            <div className="flex items-center gap-3 group-data-[collapsible=icon]:hidden">
              <Icon className="h-4 w-4" />
              <span className="truncate">{item.label}</span>
            </div>
            {/* Content for collapsed (icon-only) sidebar */}
             <div className="hidden items-center group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center">
              <Icon className="h-4 w-4" />
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
        <Icon className="h-4 w-4" />
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

    
