
"use client";

import * as React from "react";
import { PageHeader } from "@/components/page-header";
import { BrainCircuit } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCurrentUser, hasPermission } from "@/hooks/use-current-user";
import { PERMISSIONS } from "@/types"; // Assuming VIEW_TOOLS_SUBNET_SUGGESTION might still exist or a general tools view perm

export default function SubnetSuggestionPage() {
  const currentUser = useCurrentUser();
  // Use a general permission for viewing tools if specific one was removed, or remove permission check if page is always visible.
  // For now, let's assume a general "view tools" or that this page might be directly navigated to.
  // If PERMISSIONS.VIEW_TOOLS_SUBNET_SUGGESTION was fully removed from types, this might need adjustment.
  // const canView = hasPermission(currentUser, PERMISSIONS.VIEW_TOOLS_SUBNET_SUGGESTION);

  // For simplicity, let's assume if the page exists, it can be viewed, but the feature is gone.
  // Or, more robustly, check for a general "tools" view permission.
  // const canViewTools = hasPermission(currentUser, PERMISSIONS.VIEW_TOOLS_IMPORT_EXPORT); // Example: using another tool perm

  // If no specific permission for this page now, we can show a generic message or an access denied based on a broader perm.
  // For now, let's show that the feature is unavailable.

  return (
    <>
      <PageHeader
        title="AI Subnet Suggestion"
        description="This feature is no longer available."
        icon={BrainCircuit}
      />
      <Card>
        <CardHeader>
          <CardTitle>Feature Unavailable</CardTitle>
          <CardDescription>The AI Subnet Suggestion tool has been removed from the system.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            This functionality is no longer part of the IPAM Lite application.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
