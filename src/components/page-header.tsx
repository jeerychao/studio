
import type { LucideIcon } from "lucide-react";
// Removed Button import as it's no longer constructed here if actionElement is used.
// If PageHeader might still need to render its own buttons for other purposes,
// Button import could be kept, but for this specific actionElement change, it's not strictly needed for the action part.

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actionElement?: React.ReactNode; // Changed from actionButton
}

export function PageHeader({ title, description, icon: Icon, actionElement }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        {Icon && <Icon className="h-8 w-8 text-primary" />}
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
          {description && <p className="text-muted-foreground">{description}</p>}
        </div>
      </div>
      {/* Render the provided actionElement directly */}
      {actionElement && <div>{actionElement}</div>}
    </div>
  );
}
