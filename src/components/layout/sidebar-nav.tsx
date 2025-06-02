
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
  Wrench,
  FileUp,
  ListChecks,
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

const navItemConfigs: NavItemConfig[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, requiredPermission: PERMISSIONS.VIEW_DASHBOARD },
  {
    href: "/ip-management",
    label: "IP Management",
    icon: Network,
    requiredPermission: PERMISSIONS.VIEW_SUBNET, 
    subItems: [
      { href: "/subnets", label: "Subnets", icon: Network, requiredPermission: PERMISSIONS.VIEW_SUBNET },
      { href: "/vlans", label: "VLANs", icon: Cable, requiredPermission: PERMISSIONS.VIEW_VLAN },
      { href: "/ip-addresses", label: "IP Addresses", icon: Globe, requiredPermission: PERMISSIONS.VIEW_IPADDRESS },
    ],
  },
  {
    href: "/user-management",
    label: "User Management",
    icon: Users,
    requiredPermission: PERMISSIONS.VIEW_USER,
    subItems: [
      { href: "/users", label: "Users", icon: Users, requiredPermission: PERMISSIONS.VIEW_USER },
      { href: "/roles", label: "Roles", icon: ShieldCheck, requiredPermission: PERMISSIONS.VIEW_ROLE },
    ],
  },
  {
    href: "/tools",
    label: "Tools",
    icon: Wrench,
    requiredPermission: PERMISSIONS.VIEW_TOOLS_IMPORT_EXPORT, 
    subItems: [
      { href: "/tools/import-export", label: "Import/Export", icon: FileUp, requiredPermission: PERMISSIONS.VIEW_TOOLS_IMPORT_EXPORT },
    ],
  },
  { href: "/audit-logs", label: "Audit Logs", icon: ListChecks, requiredPermission: PERMISSIONS.VIEW_AUDIT_LOG },
];

export function SidebarNav() {
  const pathname = usePathname();
  const { currentUser, isAuthLoading } = useCurrentUser();

  const filterNavItemsByPermission = React.useCallback((items: NavItemConfig[], user: CurrentUserContextValue | null): NavItemConfig[] => {
    if (!user) return []; // If no user context, no items are accessible
    return items.map(item => {
      const hasAccessToItem = item.requiredPermission ? hasPermission(user, item.requiredPermission) : true;

      if (!hasAccessToItem) return null;

      let filteredSubItems: NavItemConfig[] | undefined = undefined;
      if (item.subItems) {
        filteredSubItems = filterNavItemsByPermission(item.subItems, user);
        if (filteredSubItems.length === 0 && (item.href.includes("-management") || item.href === "/tools")) {
           return null; 
        }
      }
      return { ...item, subItems: filteredSubItems };
    }).filter(item => item !== null) as NavItemConfig[];
  }, []);

  const accessibleNavItems = React.useMemo(() => {
      if (isAuthLoading || !currentUser) return []; // Wait for auth to load or if no currentUser
      let items = filterNavItemsByPermission(navItemConfigs, currentUser);
      items = items.filter(item => {
        if (item.subItems && item.subItems.length === 0 && (item.href.includes("-management") || item.href === "/tools")) {
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
    const isActive = pathname === item.href || (pathname.startsWith(item.href) && item.href !== "/" && item.href.length > 1 && !item.subItems);

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
          <AccordionTrigger
            className={triggerClass}
          >
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
    // Optionally, render a skeleton or loading state for the sidebar nav
    // For now, returning null to avoid rendering until auth is resolved.
    return <div className="p-4 text-sm text-sidebar-foreground">Loading navigation...</div>;
  }
  if (!currentUser) { // Should ideally not happen if isAuthLoading is false, but good for safety
    return <div className="p-4 text-sm text-sidebar-foreground">Error loading user.</div>;
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
