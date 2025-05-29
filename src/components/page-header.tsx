
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actionButton?: {
    label: string;
    onClick: () => void;
    icon?: LucideIcon;
  };
}

export function PageHeader({ title, description, icon: Icon, actionButton }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        {Icon && <Icon className="h-8 w-8 text-primary" />}
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
          {description && <p className="text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actionButton && (
        <Button onClick={actionButton.onClick}>
          {actionButton.icon && <actionButton.icon className="mr-2 h-4 w-4" />}
          {actionButton.label}
        </Button>
      )}
    </div>
  );
}
