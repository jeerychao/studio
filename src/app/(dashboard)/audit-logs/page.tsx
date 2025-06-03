"use client";

import * as React from "react";
import { Suspense } from 'react';
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getAuditLogsAction, deleteAuditLogAction, type PaginatedResponse } from "@/lib/actions";
import type { AuditLog } from "@/types";
import { PERMISSIONS } from "@/types";
import { ListChecks, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser, hasPermission } from "@/hooks/use-current-user";
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog";
import { PaginationControls } from "@/components/pagination-controls";

const ITEMS_PER_PAGE = 15; // More logs per page might be suitable

function LoadingAuditLogsPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full">
      <ListChecks className="h-16 w-16 animate-spin text-primary mb-4" />
      <h2 className="text-2xl font-semibold mb-2">Loading Audit Logs...</h2>
    </div>
  );
}

function AuditLogsView() {
  const [logsData, setLogsData] = React.useState<PaginatedResponse<AuditLog> | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const { toast } = useToast();
  const { currentUser, isAuthLoading } = useCurrentUser();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const currentPage = Number(searchParams.get('page')) || 1;

  const fetchData = React.useCallback(async () => {
    if (isAuthLoading || !currentUser) return;
    setIsLoading(true);
    try {
      if (hasPermission(currentUser, PERMISSIONS.VIEW_AUDIT_LOG)) {
        const fetchedLogsResult = await getAuditLogsAction({ page: currentPage, pageSize: ITEMS_PER_PAGE });
        setLogsData(fetchedLogsResult);
      } else {
        setLogsData({ data: [], totalCount: 0, currentPage: 1, totalPages: 0, pageSize: ITEMS_PER_PAGE });
      }
    } catch (error) {
      toast({ title: "Error fetching audit logs", description: (error as Error).message, variant: "destructive" });
      setLogsData({ data: [], totalCount: 0, currentPage: 1, totalPages: 0, pageSize: ITEMS_PER_PAGE });
    } finally {
      setIsLoading(false);
    }
  }, [currentUser, isAuthLoading, toast, currentPage]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  if (isAuthLoading || isLoading) {
    return <LoadingAuditLogsPage />;
  }

  if (!currentUser || !hasPermission(currentUser, PERMISSIONS.VIEW_AUDIT_LOG)) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <ListChecks className="h-16 w-16 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2">Access Denied</h2>
        <p className="text-muted-foreground">You do not have permission to view audit logs.</p>
      </div>
    );
  }

  const canDeleteLog = hasPermission(currentUser, PERMISSIONS.DELETE_AUDIT_LOG);

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
          <CardDescription>
            A chronological record of actions performed within the IPAM system.
            Displaying {logsData?.data.length} of {logsData?.totalCount} logs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {logsData && logsData.data.length > 0 ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Details</TableHead>
                    {canDeleteLog && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logsData.data.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(log.timestamp)}</TableCell>
                      <TableCell className="font-medium">{log.username || "System"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize">
                          {log.action.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-xs truncate hover:max-w-none hover:whitespace-normal">{log.details || "N/A"}</TableCell>
                      {canDeleteLog && (
                        <TableCell className="text-right">
                          <DeleteConfirmationDialog
                            itemId={log.id}
                            itemName={`audit log entry (Action: ${log.action}, User: ${log.username || 'System'})`}
                            deleteAction={deleteAuditLogAction}
                            onDeleted={fetchData}
                            triggerButton={
                              <Button variant="ghost" size="icon" aria-label="Delete audit log">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            }
                          />
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <PaginationControls
                currentPage={logsData.currentPage}
                totalPages={logsData.totalPages}
                basePath={pathname}
                currentQuery={searchParams}
              />
            </>
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

export default function AuditLogsPage() {
  return (
    <Suspense fallback={<LoadingAuditLogsPage />}>
      <AuditLogsView />
    </Suspense>
  );
}