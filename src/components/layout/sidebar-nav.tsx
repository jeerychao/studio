
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
  // Settings2, // Explicitly ensuring Settings2 icon is not imported here if not used
  ListChecks,
  BrainCircuit 
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
      // AI Subnet Suggestion and its link were removed in a previous step.
    ],
  },
  { href: "/audit-logs", label: "Audit Logs", icon: ListChecks, requiredPermission: PERMISSIONS.VIEW_AUDIT_LOG },
  // The "/settings" link is intentionally REMOVED from this main navigation array.
];

export function SidebarNav() {
  const pathname = usePathname();
  const currentUser = useCurrentUser();

  const filterNavItemsByPermission = React.useCallback((items: NavItemConfig[], user: CurrentUserContextValue | null): NavItemConfig[] => {
    if (!user) return [];
    return items.map(item => {
      const hasAccess = item.requiredPermission ? hasPermission(user, item.requiredPermission) : true;

      if (!hasAccess) return null;

      let filteredSubItems: NavItemConfig[] | undefined = undefined;
      if (item.subItems) {
        filteredSubItems = filterNavItemsByPermission(item.subItems, user);
        if (filteredSubItems.length === 0) {
           // If it's a group and has no visible sub-items, don't show the group itself
           if (item.href.includes("-management") || item.href === "/tools") {
             return null;
           }
        }
      }
      return { ...item, subItems: filteredSubItems };
    }).filter(item => item !== null) as NavItemConfig[];
  }, []);

  const accessibleNavItems = React.useMemo(() => {
      if (!currentUser) return [];
      return filterNavItemsByPermission(navItemConfigs, currentUser);
  }, [currentUser, filterNavItemsByPermission]);


  const [openAccordion, setOpenAccordion] = React.useState<string[]>(() => {
    if (!accessibleNavItems) return [];
    const activeParent = accessibleNavItems.find(item => item.subItems?.some(sub => pathname.startsWith(sub.href)));
    return activeParent ? [activeParent.href] : [];
  });

  React.useEffect(() => {
    if (!accessibleNavItems) return;
    const activeParent = accessibleNavItems.find(item => item.subItems?.some(sub => pathname.startsWith(sub.href)));
    if (activeParent && !openAccordion.includes(activeParent.href)) {
        setOpenAccordion(prev => {
            if (prev.includes(activeParent.href)) return prev;
            const nonGroupItems = prev.filter(g => !navItemConfigs.find(i => i.href === g && i.subItems));
            return [...nonGroupItems, activeParent.href];
        });
    }
  }, [pathname, accessibleNavItems, openAccordion]);


  const renderNavItem = (item: NavItemConfig, isSubItem = false) => {
    const Icon = item.icon;
    const isActive = pathname === item.href || (pathname.startsWith(item.href) && item.href !== "/" && item.href.length > 1 && !item.subItems);

    const linkClass = cn(
      "flex items-center gap-3 rounded-lg px-3 py-2 text-sidebar-foreground transition-all hover:text-sidebar-primary-foreground hover:bg-sidebar-accent group-data-[collapsible=icon]:justify-center",
      isActive && "bg-sidebar-primary text-sidebar-primary-foreground",
      isSubItem ? "text-sm" : "font-medium"
    );

    if (item.subItems && item.subItems.length > 0) {
      return (
        <AccordionItem key={item.href} value={item.href} className="border-none">
          <AccordionTrigger
            className={cn(
              linkClass,
              "justify-between hover:no-underline",
               openAccordion.includes(item.href) && (isActive || item.subItems.some(sub => pathname.startsWith(sub.href))) ? "bg-sidebar-primary text-sidebar-primary-foreground" :
               (openAccordion.includes(item.href) ? "text-sidebar-primary-foreground bg-sidebar-accent" : "")
            )}
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

  if (!currentUser) {
    return null;
  }

  return (
    <Accordion
      type="multiple"
      className="w-full"
      value={openAccordion}
      onValueChange={setOpenAccordion}
    >
      {accessibleNavItems.map((item) => renderNavItem(item))}
    </Accordion>
  );
}
