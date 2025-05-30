
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
  BrainCircuit,
  Settings2,
  ListChecks // Used for Audit Logs, Settings2 was a placeholder before
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import * as React from "react";
import { useCurrentUser, canManageUsers, canManageSettings } from "@/hooks/use-current-user";
import type { RoleName } from "@/types";


interface NavItemConfig {
  href: string;
  label: string;
  icon: React.ElementType;
  subItems?: NavItemConfig[];
  requiredRoles?: RoleName[]; // Roles that can see this item
}

const navItemConfigs: NavItemConfig[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, requiredRoles: ['Administrator', 'Operator', 'Viewer'] },
  {
    href: "/ip-management", 
    label: "IP Management",
    icon: Network,
    requiredRoles: ['Administrator', 'Operator', 'Viewer'],
    subItems: [
      { href: "/subnets", label: "Subnets", icon: Network, requiredRoles: ['Administrator', 'Operator', 'Viewer'] },
      { href: "/vlans", label: "VLANs", icon: Cable, requiredRoles: ['Administrator', 'Operator', 'Viewer'] },
      { href: "/ip-addresses", label: "IP Addresses", icon: Globe, requiredRoles: ['Administrator', 'Operator', 'Viewer'] },
    ],
  },
  {
    href: "/user-management", 
    label: "User Management",
    icon: Users,
    requiredRoles: ['Administrator'],
    subItems: [
      { href: "/users", label: "Users", icon: Users, requiredRoles: ['Administrator'] },
      { href: "/roles", label: "Roles", icon: ShieldCheck, requiredRoles: ['Administrator'] },
    ],
  },
  {
    href: "/tools", 
    label: "Tools",
    icon: Wrench,
    requiredRoles: ['Administrator'],
    subItems: [
      { href: "/tools/import-export", label: "Import/Export", icon: FileUp, requiredRoles: ['Administrator'] },
      { href: "/tools/subnet-suggestion", label: "AI Subnet Suggestion", icon: BrainCircuit, requiredRoles: ['Administrator'] },
    ],
  },
  { href: "/audit-logs", label: "Audit Logs", icon: ListChecks, requiredRoles: ['Administrator'] },
];

export function SidebarNav() {
  const pathname = usePathname();
  const currentUser = useCurrentUser();
  const userRole = currentUser.roleName;

  const filterNavItemsByRole = (items: NavItemConfig[], role: RoleName): NavItemConfig[] => {
    return items.filter(item => {
      // If no specific roles are required, or the user's role is included, show the item.
      const hasAccess = !item.requiredRoles || item.requiredRoles.includes(role);
      if (hasAccess && item.subItems) {
        item.subItems = filterNavItemsByRole(item.subItems, role);
        // If all sub-items are filtered out for this role, don't show the parent if it's just a container
        if (item.href.includes("-management") || item.href.includes("/tools")) { // Heuristic for group items
             return item.subItems.length > 0;
        }
      }
      return hasAccess;
    }).map(item => ({ // Ensure subItems are correctly processed
        ...item,
        subItems: item.subItems ? filterNavItemsByRole(item.subItems, userRole) : undefined
    })).filter(item => { // Final filter to remove empty parent groups
        if ( (item.href.includes("-management") || item.href.includes("/tools")) && (!item.subItems || item.subItems.length === 0) ) {
            return false;
        }
        return true;
    });
  };
  
  const accessibleNavItems = React.useMemo(() => filterNavItemsByRole(navItemConfigs, userRole), [userRole]);

  const [openAccordion, setOpenAccordion] = React.useState<string[]>(() => {
    const activeParent = accessibleNavItems.find(item => item.subItems?.some(sub => pathname.startsWith(sub.href)));
    return activeParent ? [activeParent.href] : [];
  });

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
              openAccordion.includes(item.href) && !item.subItems.some(sub => pathname.startsWith(sub.href)) && !isActive ? "text-sidebar-primary-foreground bg-sidebar-accent" : ""
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
    return null; // Or a loading state
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
