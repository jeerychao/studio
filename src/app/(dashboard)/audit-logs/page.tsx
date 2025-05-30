
"use client"; // Converted to client component for consistency if hooks were needed

import * as React from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { getAuditLogsAction } from "@/lib/actions";
import type { AuditLog } from "@/types";
import { ListChecks } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function AuditLogsPage() {
  const [logs, setLogs] = React.useState<AuditLog[]>([]);
  const { toast } = useToast();

  React.useEffect(() => {
    async function fetchLogs() {
      try {
        const fetchedLogs = await getAuditLogsAction();
        setLogs(fetchedLogs);
      } catch (error) {
        toast({ title: "Error fetching audit logs", description: (error as Error).message, variant: "destructive" });
      }
    }
    fetchLogs();
  }, [toast]);

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

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
