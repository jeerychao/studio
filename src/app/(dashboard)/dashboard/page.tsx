
import * as React from "react";

export default function DashboardPage() {
  // Keep this page extremely simple for now
  return (
    <div className="flex flex-col gap-4 p-8 items-center justify-center h-full">
      <h1 className="text-4xl font-bold">Dashboard Page Works!</h1>
      <p className="text-lg text-muted-foreground">
        If you see this, the basic page rendering is functional.
      </p>
    </div>
  );
}
