
"use client";

import * as React from "react";
import { Suspense } from 'react';
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Signal, Loader2, PlusCircle, Edit, Trash2, ShieldAlert } from "lucide-react";
import { useCurrentUser, hasPermission } from "@/hooks/use-current-user";
import { PERMISSIONS, type ISP, type PaginatedResponse } from "@/types";
import { getISPsAction, deleteISPAction, batchDeleteISPsAction } from "@/lib/actions";
import { useToast } from "@/hooks/use-toast";
import { IspFormSheet } from "./isp-form-sheet";
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog";
import { BatchDeleteConfirmationDialog } from "@/components/batch-delete-confirmation-dialog";
import { PaginationControls } from "@/components/pagination-controls";

const ITEMS_PER_PAGE = 10;

function LoadingIspsPage() {
  return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
      <p className="ml-3 text-lg">加载 ISP 管理页面...</p>
    </div>
  );
}

function IspsView() {
  const [ispsData, setIspsData] = React.useState<PaginatedResponse<ISP> | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const { currentUser, isAuthLoading } = useCurrentUser();
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentPage = Number(searchParams.get('page')) || 1;

  const fetchData = React.useCallback(async () => {
    if (isAuthLoading || !currentUser) return;
    setIsLoading(true);
    try {
      if (hasPermission(currentUser, PERMISSIONS.VIEW_ISP)) {
        const fetchedResult = await getISPsAction({ page: currentPage, pageSize: ITEMS_PER_PAGE });
        if (fetchedResult.success && fetchedResult.data) {
          setIspsData(fetchedResult.data);
          if (fetchedResult.data.data.length === 0 && fetchedResult.data.currentPage > 1) {
            const newTargetPage = fetchedResult.data.totalPages > 0 ? fetchedResult.data.totalPages : 1;
             const currentUrlPage = Number(searchParams.get('page')) || 1;
            if (currentUrlPage !== newTargetPage && currentUrlPage > fetchedResult.data.totalPages) {
                const params = new URLSearchParams(searchParams.toString());
                params.set("page", String(newTargetPage));
                router.push(`${pathname}?${params.toString()}`);
                return; 
            }
          }
        } else {
          toast({ title: "获取 ISP 错误", description: fetchedResult.error?.userMessage || "未能加载ISP数据。", variant: "destructive" });
          setIspsData({ data: [], totalCount: 0, currentPage: 1, totalPages: 0, pageSize: ITEMS_PER_PAGE });
        }
      } else {
        setIspsData({ data: [], totalCount: 0, currentPage: 1, totalPages: 0, pageSize: ITEMS_PER_PAGE });
      }
    } catch (error) {
      toast({ title: "获取 ISP 错误", description: (error as Error).message, variant: "destructive" });
      setIspsData({ data: [], totalCount: 0, currentPage: 1, totalPages: 0, pageSize: ITEMS_PER_PAGE });
    } finally {
      setIsLoading(false);
      setSelectedIds(new Set());
    }
  }, [currentUser, isAuthLoading, toast, currentPage, router, pathname, searchParams]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);
  
  const handleIspChangeSuccess = React.useCallback(async () => {
    // Determine target page (usually last page for creation, current for update)
    // For simplicity, let's always try to go to the page that would contain the new item,
    // or stay on current if it's an update. A more robust way is to check totalCount.
    try {
      const paginationInfo = await getISPsAction({ page: 1, pageSize: 1 }); // Minimal fetch
      if (paginationInfo.success && paginationInfo.data) {
        const newTotalPages = paginationInfo.data.totalPages;
        // If creating, and it might create a new last page, go there.
        // For now, let's assume we want to go to the "end" if it's a create.
        // This is a simplification. A more robust method would involve knowing if it was a create or update.
        // For now, just refreshing the current page or navigating to last page if current becomes invalid.
        const targetPage = newTotalPages > 0 ? newTotalPages : 1; 
        const currentUrlPage = Number(searchParams.get('page')) || 1;

        if (ispsData && ispsData.data.length === ITEMS_PER_PAGE && targetPage > currentUrlPage) {
            const params = new URLSearchParams(searchParams.toString());
            params.set("page", String(targetPage));
            router.push(`${pathname}?${params.toString()}`);
        } else {
            fetchData(); // Refresh current page if target is the same or item was updated
        }
      } else {
          fetchData(); // Fallback
      }
    } catch (error) {
      toast({ title: "刷新错误", description: "无法导航到目标页面，正在刷新当前页面。", variant: "destructive" });
      fetchData();
    }
  }, [fetchData, router, pathname, searchParams, toast, ispsData]);


  const handleSelectAll = (checked: boolean | 'indeterminate') => {
    if (checked === true) {
      const allIdsOnPage = ispsData?.data.map(isp => isp.id) || [];
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


  if (isAuthLoading || (isLoading && !ispsData)) {
    return <LoadingIspsPage />;
  }

  if (!currentUser || !hasPermission(currentUser, PERMISSIONS.VIEW_ISP)) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <ShieldAlert className="h-16 w-16 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2">访问被拒绝</h2>
        <p className="text-muted-foreground">您没有权限查看 ISP 管理页面。</p>
      </div>
    );
  }

  const canCreate = hasPermission(currentUser, PERMISSIONS.CREATE_ISP);
  const canEdit = hasPermission(currentUser, PERMISSIONS.EDIT_ISP);
  const canDelete = hasPermission(currentUser, PERMISSIONS.DELETE_ISP);

  const pageActionButtons = (
    <div className="flex flex-col sm:flex-row gap-2">
      {canDelete && selectedIds.size > 0 && (
        <BatchDeleteConfirmationDialog
          selectedIds={selectedIds}
          itemTypeDisplayName="ISP"
          batchDeleteAction={batchDeleteISPsAction}
          onBatchDeleted={fetchData}
        />
      )}
      {canCreate && (
        <IspFormSheet onIspChange={handleIspChangeSuccess} buttonProps={{className: "w-full sm:w-auto"}}/>
      )}
    </div>
  );
  
  const dataIsAvailable = !!(ispsData && ispsData.data && ispsData.data.length > 0);
  const isAllOnPageSelected = dataIsAvailable ? ispsData.data!.every(isp => selectedIds.has(isp.id)) : false;
  const isSomeOnPageSelected = dataIsAvailable ? ispsData.data!.some(isp => selectedIds.has(isp.id)) : false;

  const ispsToDisplay = ispsData?.data || [];
  const finalTotalCount = ispsData?.totalCount || 0;
  const finalCurrentPage = ispsData?.currentPage || 1;
  const finalTotalPages = ispsData?.totalPages || 0;

  return (
    <>
      <PageHeader
        title="ISP 管理"
        description="管理互联网服务提供商 (ISP) 信息。"
        icon={<Signal className="h-6 w-6 text-primary" />}
        actionElement={pageActionButtons}
      />
      <Card>
        <CardHeader>
          <CardTitle>ISP 列表</CardTitle>
          <CardDescription>查看和管理系统中的 ISP 条目。显示 {ispsToDisplay.length} 条，共 {finalTotalCount} 条 ISP。</CardDescription>
        </CardHeader>
        <CardContent>
          {dataIsAvailable ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">
                      {canDelete && (
                         <Checkbox
                            checked={isAllOnPageSelected ? true : (isSomeOnPageSelected ? 'indeterminate' : false)}
                            onCheckedChange={handleSelectAll}
                            aria-label="全选当前页"
                        />
                      )}
                    </TableHead>
                    <TableHead>名称</TableHead>
                    <TableHead>描述</TableHead>
                    <TableHead>联系方式</TableHead>
                    {(canEdit || canDelete) && <TableHead className="text-right">操作</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ispsToDisplay.map((isp) => (
                    <TableRow key={isp.id} data-state={selectedIds.has(isp.id) ? "selected" : ""}>
                      <TableCell>
                        {canDelete && (
                           <Checkbox
                            checked={selectedIds.has(isp.id)}
                            onCheckedChange={(checked) => handleSelectItem(isp.id, checked)}
                            aria-label={`选择ISP ${isp.name}`}
                          />
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{isp.name}</TableCell>
                      <TableCell className="max-w-md truncate">{isp.description || "无"}</TableCell>
                      <TableCell className="max-w-sm truncate">{isp.contactInfo || "无"}</TableCell>
                      {(canEdit || canDelete) && (
                        <TableCell className="text-right">
                          {canEdit && (
                            <IspFormSheet isp={isp} onIspChange={fetchData}>
                              <Button variant="ghost" size="icon" aria-label="编辑 ISP">
                                <Edit className="h-4 w-4" />
                              </Button>
                            </IspFormSheet>
                          )}
                          {canDelete && (
                            <DeleteConfirmationDialog
                              itemId={isp.id}
                              itemName={isp.name}
                              deleteAction={deleteISPAction}
                              onDeleted={fetchData}
                              triggerButton={
                                <Button variant="ghost" size="icon" aria-label="删除 ISP">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              }
                            />
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {finalTotalPages > 1 && (
                <PaginationControls
                  currentPage={finalCurrentPage}
                  totalPages={finalTotalPages}
                  basePath={pathname}
                  currentQuery={searchParams}
                />
              )}
            </>
          ) : (
             <div className="text-center py-10">
              <p className="text-muted-foreground">未找到 ISP 数据。</p>
              {canCreate && <IspFormSheet onIspChange={handleIspChangeSuccess} buttonProps={{className: "mt-4"}}/>}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

export default function IspManagementPage() {
  return (
    <Suspense fallback={<LoadingIspsPage />}>
      <IspsView />
    </Suspense>
  );
}
      