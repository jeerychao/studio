
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
import { ListChecks, Trash2, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser, hasPermission } from "@/hooks/use-current-user";
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog";
import { PaginationControls } from "@/components/pagination-controls";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const ITEMS_PER_PAGE = 10; // 分页阈值调整为10

function LoadingAuditLogsPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full">
      <ListChecks className="h-16 w-16 animate-spin text-primary mb-4" />
      <h2 className="text-2xl font-semibold mb-2">加载审计日志中...</h2>
    </div>
  );
}

interface DetailsDialogProps {
  log: AuditLog;
  triggerText: string | React.ReactNode;
}

function DetailsDialog({ log, triggerText }: DetailsDialogProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <span className="cursor-pointer hover:underline text-primary">{triggerText}</span>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>日志详情</AlertDialogTitle>
          <AlertDialogDescription>
            以下是关于操作 <Badge variant="secondary" className="capitalize">{log.action.replace(/_/g, " ")}</Badge> (用户: {log.username || "系统"}) 的完整详情。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="my-4 max-h-[60vh] overflow-y-auto rounded-md border bg-muted p-4 text-sm">
          <pre className="whitespace-pre-wrap break-all">{log.details || "无可用详情。"}</pre>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>关闭</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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
      toast({ title: "获取审计日志错误", description: (error as Error).message, variant: "destructive" });
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
        <h2 className="text-2xl font-semibold mb-2">访问被拒绝</h2>
        <p className="text-muted-foreground">您没有权限查看审计日志。</p>
      </div>
    );
  }

  const canDeleteLog = hasPermission(currentUser, PERMISSIONS.DELETE_AUDIT_LOG);

  return (
    <>
      <PageHeader
        title="审计日志"
        description="跟踪用户活动和系统事件。"
        icon={ListChecks}
      />
      <Card>
        <CardHeader>
          <CardTitle>系统活动日志</CardTitle>
          <CardDescription>
            IPAM 系统中执行操作的时间顺序记录。
            显示 {logsData?.data.length} 条，共 {logsData?.totalCount} 条日志。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {logsData && logsData.data.length > 0 ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>时间戳</TableHead>
                    <TableHead>用户</TableHead>
                    <TableHead>操作</TableHead>
                    <TableHead>详情 (点击查看)</TableHead>
                    {canDeleteLog && <TableHead className="text-right">管理操作</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logsData.data.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(log.timestamp)}</TableCell>
                      <TableCell className="font-medium">{log.username || "系统"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize">
                          {log.action.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-xs truncate">
                        {log.details && log.details.length > 50 ? ( // 截断长度可调整
                          <DetailsDialog 
                            log={log} 
                            triggerText={
                              <>
                                {log.details.substring(0, 50)}... <Eye className="inline h-3 w-3 ml-1" />
                              </>
                            }
                          />
                        ) : (
                          log.details || "无"
                        )}
                      </TableCell>
                      {canDeleteLog && (
                        <TableCell className="text-right">
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
              {logsData.totalPages > 1 && (
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
