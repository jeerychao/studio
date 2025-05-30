
"use client"; 

import * as React from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { getAuditLogsAction } from "@/lib/actions";
import type { AuditLog, PermissionId } from "@/types";
import { PERMISSIONS } from "@/types";
import { ListChecks } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser, hasPermission, type CurrentUserContextValue } from "@/hooks/use-current-user";

export default function AuditLogsPage() {
  const [logs, setLogs] = React.useState<AuditLog[]>([]);
  const { toast } = useToast();
  const currentUser = useCurrentUser();

  React.useEffect(() => {
    async function fetchLogs() {
      try {
        const fetchedLogs = await getAuditLogsAction();
        setLogs(fetchedLogs);
      } catch (error) {
        toast({ title: "Error fetching audit logs", description: (error as Error).message, variant: "destructive" });
      }
    }
    if (hasPermission(currentUser, PERMISSIONS.VIEW_AUDIT_LOG)) {
        fetchLogs();
    }
  }, [toast, currentUser]);

  const canView = hasPermission(currentUser, PERMISSIONS.VIEW_AUDIT_LOG);

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <ListChecks className="h-16 w-16 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2">Access Denied</h2>
        <p className="text-muted-foreground">You do not have permission to view audit logs.</p>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Audit Logs"
        description="Track user activities and system events."
        icon={ListChecks}
      />
      <Card>
        <CardHeader>
          <CardTitle>System Activity Log</CardTitle>
          <CardDescription>A chronological record of actions performed within the IPAM system.</CardDescription>
        </CardHeader>
        <CardContent>
          {logs.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(log.timestamp)}</TableCell>
                    <TableCell className="font-medium">{log.username || "System"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize">
                        {log.action.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-md truncate">{log.details || "N/A"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-10">
              <p className="text-muted-foreground">No audit logs found.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
