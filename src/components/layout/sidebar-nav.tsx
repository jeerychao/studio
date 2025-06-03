
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
    requiredPermission: PERMISSIONS.VIEW_SUBNET, // Parent group permission can be broad or specific
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
    requiredPermission: PERMISSIONS.VIEW_USER, // Parent group permission
    subItems: [
      { href: "/users", label: "Users", icon: Users, requiredPermission: PERMISSIONS.VIEW_USER },
      { href: "/roles", label: "Roles", icon: ShieldCheck, requiredPermission: PERMISSIONS.VIEW_ROLE },
    ],
  },
  {
    href: "/tools",
    label: "Tools",
    icon: Wrench,
    requiredPermission: PERMISSIONS.VIEW_TOOLS_IMPORT_EXPORT, // Parent group permission
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
    if (!user) return []; 
    return items.map(item => {
      // Check if user has permission for the item itself
      const hasAccessToItem = item.requiredPermission ? hasPermission(user, item.requiredPermission) : true;

      if (!hasAccessToItem) return null; // User does not have permission for this item

      // If item has subItems, filter them recursively
      let filteredSubItems: NavItemConfig[] | undefined = undefined;
      if (item.subItems) {
        filteredSubItems = filterNavItemsByPermission(item.subItems, user);
        // If this is a "group" item (like IP Management) and it ends up with no visible subItems,
        // then this group item itself should not be rendered.
        if (filteredSubItems.length === 0 && (item.href.includes("-management") || item.href === "/tools")) {
           return null; 
        }
      }
      return { ...item, subItems: filteredSubItems };
    }).filter(item => item !== null) as NavItemConfig[]; // Filter out null items (no permission)
  }, []);

  const accessibleNavItems = React.useMemo(() => {
      if (isAuthLoading || !currentUser) return []; // Wait for auth to load or if no user
      // Start by filtering all items based on permissions
      let items = filterNavItemsByPermission(navItemConfigs, currentUser);
      // Additional filter: if a parent "group" item has no visible subItems after permission filtering, remove the parent group too.
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
        // If still loading or no items, ensure no accordion is open or clear if already set.
        setOpenAccordionItems(currentOpenItems => currentOpenItems.length > 0 ? [] : currentOpenItems);
        return;
    }

    const activeParentGroup = accessibleNavItems.find(item => item.subItems?.some(sub => pathname.startsWith(sub.href)));

    if (activeParentGroup) {
        // Only update if the active group is not already in the open list
        setOpenAccordionItems(currentOpenItems => {
            if (currentOpenItems.includes(activeParentGroup.href)) {
                return currentOpenItems; // No change needed, return current state to avoid re-render
            }
            return [...currentOpenItems, activeParentGroup.href];
        });
    }
    // Dependency array only includes pathname and accessibleNavItems.
    // openAccordionItems is managed internally by the Accordion component and this effect.
  }, [pathname, accessibleNavItems, isAuthLoading]);


  const renderNavItem = (item: NavItemConfig, isSubItem = false) => {
    const Icon = item.icon;
    // An item is active if the current pathname exactly matches its href,
    // OR if the pathname starts with its href (for parent items that aren't actual pages like "/").
    const isActive = pathname === item.href || (pathname.startsWith(item.href) && item.href !== "/" && item.href.length > 1 && !item.subItems);

    const linkClass = cn(
      "flex items-center gap-3 rounded-lg px-3 py-2 text-sidebar-foreground transition-all hover:text-sidebar-primary-foreground hover:bg-sidebar-accent group-data-[collapsible=icon]:justify-center",
      isActive && "bg-sidebar-primary text-sidebar-primary-foreground",
      isSubItem ? "text-sm" : "font-medium"
    );

    if (item.subItems && item.subItems.length > 0) {
      // An accordion group is considered "active" if any of its sub-items are active.
      const isActiveGroup = item.subItems.some(sub => pathname.startsWith(sub.href));
      const isOpen = openAccordionItems.includes(item.href);
      
      const triggerClass = cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sidebar-foreground transition-all hover:text-sidebar-primary-foreground hover:bg-sidebar-accent group-data-[collapsible=icon]:justify-center",
        isSubItem ? "text-sm" : "font-medium",
        "justify-between hover:no-underline w-full", // Ensure trigger spans full width
        // Styling for active/open state:
        // If the group is open AND contains the active page, style it as primary active.
        // If the group is just open (but doesn't contain the active page), style it as accent (hover state).
         (isOpen && isActiveGroup) ? "bg-sidebar-primary text-sidebar-primary-foreground" :
         (isOpen) ? "text-sidebar-primary-foreground bg-sidebar-accent" : ""
      );

      return (
        <AccordionItem key={item.href} value={item.href} className="border-none">
          <AccordionTrigger
            className={triggerClass}
            // Removed onFocus and onBlur as Accordion manages its own state
          >
            <div className="flex items-center gap-3 group-data-[collapsible=icon]:hidden">
              <Icon className="h-5 w-5" />
              <span className="truncate">{item.label}</span>
            </div>
             {/* Icon-only view for collapsed sidebar */}
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
    return <div className="p-4 text-sm text-sidebar-foreground">Loading navigation...</div>;
  }
  if (!currentUser) { // Should ideally not happen with new useCurrentUser
    return <div className="p-4 text-sm text-sidebar-foreground">Error loading user.</div>;
  }


  return (
    <Accordion
      type="multiple"
      className="w-full"
      value={openAccordionItems}
      onValueChange={setOpenAccordionItems} // Allow Accordion to control its open items
    >
      {accessibleNavItems.map((item) => renderNavItem(item))}
    </Accordion>
  );
}
