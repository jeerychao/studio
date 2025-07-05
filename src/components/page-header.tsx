
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
      <div className="flex items-center gap-2"> {/* Reduced gap from 3 to 2 */}
        {/* Render the icon node directly. Wrapper for consistent layout if needed. */}
        {icon && (
          <div className="flex h-6 w-6 items-center justify-center"> {/* Reduced icon wrapper from h-8 w-8 to h-6 w-6 */}
            {icon}
          </div>
        )}
        <div>
          <h1 className="text-lg font-bold tracking-tight md:text-xl leading-tight">{title}</h1> {/* Changed text-xl to text-lg and md:text-2xl to md:text-xl */}
          {description && <p className="text-muted-foreground leading-snug">{description}</p>} {/* Added leading-snug */}
        </div>
      </div>
      {actionElement && <div>{actionElement}</div>}
    </div>
  );
}

