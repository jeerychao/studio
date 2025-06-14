
import * as React from "react";

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-4 p-8 items-center justify-center h-full">
      <h1 className="text-4xl font-bold">Dashboard Page Works!</h1>
      <p className="text-lg text-muted-foreground">
        If you see this, the basic page rendering is functional.
      </p>
      <p>Current time: {new Date().toLocaleTimeString()}</p>
    </div>
  );
}
