
"use client";

import * as React from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings } from "lucide-react";
import { useCurrentUser, hasPermission } from "@/hooks/use-current-user";
import { PERMISSIONS } from "@/types";

export default function SettingsPage() {
  const currentUser = useCurrentUser();
  const canView = hasPermission(currentUser, PERMISSIONS.VIEW_SETTINGS);

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Settings className="h-16 w-16 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2">Access Denied</h2>
        <p className="text-muted-foreground">You do not have permission to view this page.</p>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="System Settings"
        description="Manage system-wide configurations and preferences."
        icon={Settings}
      />
      <Card>
        <CardHeader>
          <CardTitle>Application Settings</CardTitle>
          <CardDescription>General settings for the IPAM Lite application.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            This is a placeholder for system settings. Future options might include:
          </p>
          <ul className="list-disc list-inside mt-4 space-y-2 text-muted-foreground">
            <li>Theme customization (Light/Dark mode toggle)</li>
            <li>Notification preferences</li>
            <li>Default values for new entries</li>
            <li>Integration settings</li>
          </ul>
        </CardContent>
      </Card>
       <Card className="mt-6">
        <CardHeader>
          <CardTitle>User Profile</CardTitle>
          <CardDescription>Manage your personal account details.</CardDescription>
        </CardHeader>
        <CardContent>
            <p>Current User: {currentUser?.username} ({currentUser?.email})</p>
            <p>Role: {currentUser?.roleName}</p>
             {/* Placeholder for password change form or other profile actions */}
        </CardContent>
      </Card>
    </>
  );
}
