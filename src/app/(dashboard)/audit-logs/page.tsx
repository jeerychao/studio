
"use client";

import * as React from "react";
import { Suspense } from 'react';
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { getAuditLogsAction, deleteAuditLogAction, batchDeleteAuditLogsAction } from "@/lib/actions";
import type { AuditLog, PaginatedResponse } from "@/types";
import { PERMISSIONS } from "@/types";
import { ListChecks, Trash2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser, hasPermission } from "@/hooks/use-current-user";
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog";
import { BatchDeleteConfirmationDialog } from "@/components/batch-delete-confirmation-dialog";
import { PaginationControls } from "@/components/pagination-controls";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

const ITEMS_PER_PAGE = 10;

function LoadingAuditLogsPage() {
  return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
      <p className="ml-3 text-lg">加载审计日志中...</p>
    </div>
  );
}

function AuditLogsView() {
  const [logsData, setLogsData] = React.useState<PaginatedResponse<AuditLog> | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const { toast } = useToast();
  const { currentUser, isAuthLoading } = useCurrentUser();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [selectedLogForDetails, setSelectedLogForDetails] = React.useState<AuditLog | null>(null);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = React.useState(false);

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
      toast({ title: "获取审计日志错误", description: (error as Error).message, variant: "destructive" });
      setLogsData({ data: [], totalCount: 0, currentPage: 1, totalPages: 0, pageSize: ITEMS_PER_PAGE });
    } finally {
      setIsLoading(false);
      setSelectedIds(new Set());
    }
  }, [currentUser, isAuthLoading, toast, currentPage]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

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
  
  const handleSelectAll = (checked: boolean | 'indeterminate') => {
    if (checked === true) {
      const allIdsOnPage = logsData?.data?.map(log => log.id) || []; 
      setSelectedIds(new Set(allIdsOnPage));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectItem = (id: string, checked: boolean | 'indeterminate') => {
    const newSelectedIds = new Set(selectedIds);
    if (checked === true) {
      newSelectedIds.add(id);
    } else {
      newSelectedIds.delete(id);
    }
    setSelectedIds(newSelectedIds);
  };

  if (isAuthLoading || isLoading) {
    return <LoadingAuditLogsPage />;
  }

  if (!currentUser || !hasPermission(currentUser, PERMISSIONS.VIEW_AUDIT_LOG)) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <ListChecks className="h-16 w-16 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2">访问被拒绝</h2>
        <p className="text-muted-foreground">您没有权限查看审计日志。</p>
      </div>
    );
  }

  const canDeleteLog = hasPermission(currentUser, PERMISSIONS.DELETE_AUDIT_LOG);

  const dataIsAvailable = !!(logsData && logsData.data && logsData.data.length > 0);

  const isAllOnPageSelected = dataIsAvailable ? logsData.data!.every(log => selectedIds.has(log.id)) : false;
  const isSomeOnPageSelected = dataIsAvailable ? logsData.data!.some(log => selectedIds.has(log.id)) : false;

  const pageActionElement = canDeleteLog && selectedIds.size > 0 ? (
    <BatchDeleteConfirmationDialog
      selectedIds={selectedIds}
      itemTypeDisplayName="审计日志条目"
      batchDeleteAction={batchDeleteAuditLogsAction}
      onBatchDeleted={fetchData}
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
            显示 {logsData?.data?.length || 0} 条，共 {logsData?.totalCount || 0} 条日志。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {dataIsAvailable ? ( 
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">
                      {canDeleteLog && (
                        <Checkbox
                            checked={isAllOnPageSelected}
                            onCheckedChange={handleSelectAll}
                            aria-label="全选当前页"
                            indeterminate={isSomeOnPageSelected && !isAllOnPageSelected}
                        />
                      )}
                    </TableHead>
                    <TableHead>时间戳</TableHead>
                    <TableHead>用户</TableHead>
                    <TableHead>操作</TableHead>
                    <TableHead>详情 (点击行查看)</TableHead>
                    {canDeleteLog && <TableHead className="text-right">管理操作</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logsData!.data.map((log) => (
                    <TableRow
                      key={log.id}
                      onClick={(e) => handleRowClick(log, e)}
                      className="cursor-pointer hover:bg-muted/50"
                      data-state={selectedIds.has(log.id) ? "selected" : ""} 
                    >
                      <TableCell>
                        {canDeleteLog && (
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
                      {canDeleteLog && (
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <DeleteConfirmationDialog
                            itemId={log.id}
                            itemName={`审计日志条目 (操作: ${log.action}, 用户: ${log.username || '系统'})`}
                            deleteAction={deleteAuditLogAction}
                            onDeleted={fetchData}
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
              {logsData!.totalPages > 1 && (
                <PaginationControls
                  currentPage={logsData!.currentPage}
                  totalPages={logsData!.totalPages}
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
