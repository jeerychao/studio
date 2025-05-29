
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
  // LogOut, // LogOut was not used
  // ChevronDown, // ChevronDown is implicitly used by AccordionTrigger
  // ChevronRight, // ChevronRight was not used explicitly
} from "lucide-react";
import { cn } from "@/lib/utils";
// import { Button } from "@/components/ui/button"; // Button was not used
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import * as React from "react";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  subItems?: NavItem[];
}

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  {
    href: "/ip-management", // This href is a conceptual grouping, not a direct link
    label: "IP Management",
    icon: Network,
    subItems: [
      { href: "/subnets", label: "Subnets", icon: Network },
      { href: "/vlans", label: "VLANs", icon: Cable },
      { href: "/ip-addresses", label: "IP Addresses", icon: Globe },
    ],
  },
  {
    href: "/user-management", // Conceptual grouping
    label: "User Management",
    icon: Users,
    subItems: [
      { href: "/users", label: "Users", icon: Users },
      { href: "/roles", label: "Roles", icon: ShieldCheck },
    ],
  },
  {
    href: "/tools", // Conceptual grouping
    label: "Tools",
    icon: Wrench,
    subItems: [
      { href: "/tools/import-export", label: "Import/Export", icon: FileUp },
      { href: "/tools/subnet-suggestion", label: "AI Subnet Suggestion", icon: BrainCircuit },
    ],
  },
  { href: "/audit-logs", label: "Audit Logs", icon: Settings2 },
];

export function SidebarNav() {
  const pathname = usePathname();
  const [openAccordion, setOpenAccordion] = React.useState<string[]>(() => {
    const activeParent = navItems.find(item => item.subItems?.some(sub => pathname.startsWith(sub.href)));
    return activeParent ? [activeParent.href] : [];
  });

  const renderNavItem = (item: NavItem, isSubItem = false) => {
    const Icon = item.icon;
    const isActive = pathname === item.href || (pathname.startsWith(item.href) && item.href !== "/" && item.href.length > 1); // Ensure href isn't just "/" for startsWith
    
    const linkClass = cn(
      "flex items-center gap-3 rounded-lg px-3 py-2 text-sidebar-foreground transition-all hover:text-sidebar-primary-foreground hover:bg-sidebar-accent group-data-[collapsible=icon]:justify-center",
      isActive && "bg-sidebar-primary text-sidebar-primary-foreground",
      isSubItem ? "text-sm" : "font-medium"
    );

    if (item.subItems) {
      return (
        <AccordionItem key={item.href} value={item.href} className="border-none">
          <AccordionTrigger
            className={cn(
              linkClass,
              "justify-between hover:no-underline",
              // Apply active-like style if accordion is open but not the current active page/section
              openAccordion.includes(item.href) && !item.subItems.some(sub => pathname.startsWith(sub.href)) && !isActive ? "text-sidebar-primary-foreground bg-sidebar-accent" : ""
            )}
            // Removed onClick handler from here
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

  return (
    <Accordion
      type="multiple"
      className="w-full"
      value={openAccordion}
      onValueChange={setOpenAccordion} // This will be called by Radix Accordion when a trigger is clicked
    >
      {navItems.map((item) => renderNavItem(item))}
    </Accordion>
  );
}
