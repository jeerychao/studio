"use client";

import * as React from "react";
import { Suspense } from 'react';
import { usePathname, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { getAuditLogsAction, deleteAuditLogAction, batchDeleteAuditLogsAction } from "@/lib/actions";
import type { AuditLog } from "@/types";
import { PERMISSIONS } from "@/types";
import { ListChecks, Trash2, Loader2 } from "lucide-react";
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog";
import { BatchDeleteConfirmationDialog } from "@/components/batch-delete-confirmation-dialog";
import { PaginationControls } from "@/components/pagination-controls";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { useEntityManagement } from "@/hooks/use-entity-management";
import { useSelection } from "@/hooks/use-selection";

function LoadingAuditLogsPage() {
  return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
      <p className="ml-3 text-lg">加载审计日志中...</p>
    </div>
  );
}

function AuditLogsView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { data: logsData, isLoading, fetchData, canView, canDelete } = useEntityManagement<AuditLog, any>({
    fetchAction: getAuditLogsAction,
    permission: {
      view: PERMISSIONS.VIEW_AUDIT_LOG,
      delete: PERMISSIONS.DELETE_AUDIT_LOG
    },
  });

  const logsToDisplay = logsData?.data || [];
  const { selectedIds, setSelectedIds, handleSelectAll, handleSelectItem, checkboxState } = useSelection(logsToDisplay);
  
  const [selectedLogForDetails, setSelectedLogForDetails] = React.useState<AuditLog | null>(null);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = React.useState(false);

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const handleRowClick = (log: AuditLog, e: React.MouseEvent<HTMLTableRowElement, MouseEvent>) => {
    const target = e.target as HTMLElement;
    if (target.closest('[role="checkbox"]') || target.closest('button[aria-label^="删除"]')) {
      return;
    }
    setSelectedLogForDetails(log);
    setIsDetailsDialogOpen(true);
  };
  
  const onActionSuccess = () => {
    fetchData();
    setSelectedIds(new Set());
  };

  if (isLoading) {
    return <LoadingAuditLogsPage />;
  }

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <ListChecks className="h-16 w-16 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2">访问被拒绝</h2>
        <p className="text-muted-foreground">您没有权限查看审计日志。</p>
      </div>
    );
  }

  const pageActionElement = canDelete && selectedIds.size > 0 ? (
    <BatchDeleteConfirmationDialog
      selectedIds={selectedIds}
      itemTypeDisplayName="审计日志条目"
      batchDeleteAction={batchDeleteAuditLogsAction}
      onBatchDeleted={onActionSuccess}
    />
  ) : null;

  return (
    <>
      <PageHeader
        title="审计日志"
        description="跟踪用户活动和系统事件。"
        icon={<ListChecks className="h-6 w-6 text-primary" />}
        actionElement={pageActionElement}
      />
      <Card>
        <CardHeader>
          <CardTitle>系统活动日志</CardTitle>
          <CardDescription>
            IPAM 系统中执行操作的时间顺序记录。
            显示 {logsToDisplay.length} 条，共 {logsData?.totalCount || 0} 条日志。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {logsToDisplay.length > 0 ? ( 
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">
                      {canDelete && (
                        <Checkbox
                            checked={checkboxState}
                            onCheckedChange={handleSelectAll}
                            aria-label="全选当前页"
                        />
                      )}
                    </TableHead>
                    <TableHead>时间戳</TableHead>
                    <TableHead>用户</TableHead>
                    <TableHead>操作</TableHead>
                    <TableHead>详情 (点击行查看)</TableHead>
                    {canDelete && <TableHead className="text-right">管理操作</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logsToDisplay.map((log) => (
                    <TableRow
                      key={log.id}
                      onClick={(e) => handleRowClick(log, e)}
                      className="cursor-pointer hover:bg-muted/50"
                      data-state={selectedIds.has(log.id) ? "selected" : ""} 
                    >
                      <TableCell>
                        {canDelete && (
                           <Checkbox
                            checked={selectedIds.has(log.id)}
                            onCheckedChange={(checked) => handleSelectItem(log.id, checked)}
                            onClick={(e) => e.stopPropagation()} 
                            aria-label={`选择日志 ${log.id}`}
                          />
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(log.timestamp)}</TableCell>
                      <TableCell className="font-medium">{log.username || "系统"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize">
                          {log.action.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-xs truncate">
                        {log.details || "无"}
                      </TableCell>
                      {canDelete && (
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <DeleteConfirmationDialog
                            itemId={log.id}
                            itemName={`审计日志条目 (操作: ${log.action}, 用户: ${log.username || '系统'})`}
                            deleteAction={deleteAuditLogAction}
                            onDeleted={onActionSuccess}
                            triggerButton={
                              <Button variant="ghost" size="icon" aria-label="删除审计日志">
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
              {logsData && logsData.totalPages > 1 && (
                <PaginationControls
                  currentPage={logsData.currentPage}
                  totalPages={logsData.totalPages}
                  basePath={pathname}
                  currentQuery={searchParams}
                />
              )}
            </>
          ) : (
            <div className="text-center py-10">
              <p className="text-muted-foreground">未找到审计日志。</p>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedLogForDetails && (
        <AlertDialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>日志详情</AlertDialogTitle>
              <AlertDialogDescription>
                以下是关于操作 <Badge variant="secondary" className="capitalize">{selectedLogForDetails.action.replace(/_/g, " ")}</Badge> (用户: {selectedLogForDetails.username || "系统"}) 的完整详情。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="my-4 max-h-[60vh] overflow-y-auto rounded-md border bg-muted p-4 text-sm">
              <pre className="whitespace-pre-wrap break-all">{selectedLogForDetails.details || "无可用详情。"}</pre>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setIsDetailsDialogOpen(false)}>关闭</AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
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
