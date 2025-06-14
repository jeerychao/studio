
import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: ReactNode; // Changed from LucideIcon to ReactNode
  actionElement?: React.ReactNode;
}

export function PageHeader({ title, description, icon, actionElement }: PageHeaderProps) {
  return (
    <div className="mb-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        {/* Render the icon node directly. Wrapper for consistent layout if needed. */}
        {icon && (
          <div className="flex h-8 w-8 items-center justify-center"> {/* Basic wrapper for alignment */}
            {icon}
          </div>
        )}
        <div>
          <h1 className="text-xl font-bold tracking-tight md:text-2xl">{title}</h1>
          {description && <p className="text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actionElement && <div>{actionElement}</div>}
    </div>
  );
}
