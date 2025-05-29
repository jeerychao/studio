
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
  FileDown,
  BrainCircuit,
  Settings2,
  LogOut,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
    href: "/ip-management",
    label: "IP Management",
    icon: Network,
    subItems: [
      { href: "/subnets", label: "Subnets", icon: Network },
      { href: "/vlans", label: "VLANs", icon: Cable },
      { href: "/ip-addresses", label: "IP Addresses", icon: Globe },
    ],
  },
  {
    href: "/user-management",
    label: "User Management",
    icon: Users,
    subItems: [
      { href: "/users", label: "Users", icon: Users },
      { href: "/roles", label: "Roles", icon: ShieldCheck },
    ],
  },
  {
    href: "/tools",
    label: "Tools",
    icon: Wrench,
    subItems: [
      { href: "/tools/import-export", label: "Import/Export", icon: FileUp }, // FileUp or FileDown, using one for brevity
      { href: "/tools/subnet-suggestion", label: "AI Subnet Suggestion", icon: BrainCircuit },
    ],
  },
  { href: "/audit-logs", label: "Audit Logs", icon: Settings2 }, // Using Settings2 as generic log icon
];

export function SidebarNav() {
  const pathname = usePathname();
  const [openAccordion, setOpenAccordion] = React.useState<string[]>(() => {
    const activeParent = navItems.find(item => item.subItems?.some(sub => pathname.startsWith(sub.href)));
    return activeParent ? [activeParent.href] : [];
  });

  const renderNavItem = (item: NavItem, isSubItem = false) => {
    const Icon = item.icon;
    const isActive = pathname === item.href || (pathname.startsWith(item.href) && item.href !== "/");
    
    const linkClass = cn(
      "flex items-center gap-3 rounded-lg px-3 py-2 text-sidebar-foreground transition-all hover:text-sidebar-primary-foreground hover:bg-sidebar-accent",
      isActive && "bg-sidebar-primary text-sidebar-primary-foreground",
      isSubItem ? "text-sm" : "font-medium"
    );

    if (item.subItems) {
      return (
        <AccordionItem value={item.href} className="border-none">
          <AccordionTrigger 
            className={cn(
              linkClass, 
              "justify-between hover:no-underline",
              openAccordion.includes(item.href) && !isActive ? "text-sidebar-primary-foreground bg-sidebar-accent" : ""
            )}
            onClick={() => {
              setOpenAccordion(prev => 
                prev.includes(item.href) 
                  ? prev.filter(val => val !== item.href)
                  : [...prev, item.href]
              );
            }}
          >
            <div className="flex items-center gap-3">
              <Icon className="h-5 w-5" />
              {item.label}
            </div>
          </AccordionTrigger>
          <AccordionContent className="pb-0 pl-4 pt-1">
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
        {item.label}
      </Link>
    );
  };

  return (
    <Accordion 
      type="multiple" 
      className="w-full" 
      value={openAccordion}
      onValueChange={setOpenAccordion}
    >
      {navItems.map((item) => renderNavItem(item))}
    </Accordion>
  );
}
