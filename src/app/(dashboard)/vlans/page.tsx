
"use client";

import * as React from "react";
import { Suspense } from 'react';
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Edit, Trash2, Cable, PlusCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { getVLANsAction, deleteVLANAction, batchDeleteVLANsAction } from "@/lib/actions";
import type { VLAN, PaginatedResponse } from "@/types";
import { PERMISSIONS } from "@/types";
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog";
import { BatchDeleteConfirmationDialog } from "@/components/batch-delete-confirmation-dialog";
import { VlanFormSheet } from "./vlan-form-sheet";
import { VlanBatchFormSheet } from "./vlan-batch-form-sheet";
import { useCurrentUser, hasPermission } from "@/hooks/use-current-user";
import { useToast } from "@/hooks/use-toast";
import { PaginationControls } from "@/components/pagination-controls";

const ITEMS_PER_PAGE = 10;

function LoadingVlansPage() {
  return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
      <p className="ml-3 text-lg">加载VLAN中...</p>
    </div>
  );
}

function VlansView() {
  const [vlansData, setVlansData] = React.useState<PaginatedResponse<VLAN> | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());

  const { currentUser, isAuthLoading } = useCurrentUser();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const currentPage = Number(searchParams.get('page')) || 1;

  const fetchData = React.useCallback(async () => {
    if (isAuthLoading || !currentUser) return;
    setIsLoading(true);
    try {
      if (hasPermission(currentUser, PERMISSIONS.VIEW_VLAN)) {
        const fetchedResult = await getVLANsAction({ page: currentPage, pageSize: ITEMS_PER_PAGE });
        setVlansData(fetchedResult);

        if (fetchedResult.data.length === 0 && fetchedResult.currentPage > 1) {
          const newTargetPage = fetchedResult.totalPages > 0 ? fetchedResult.totalPages : 1;
          const currentUrlPage = Number(searchParams.get('page')) || 1;
          if (currentUrlPage !== newTargetPage && currentUrlPage > fetchedResult.totalPages) {
              const params = new URLSearchParams(searchParams.toString());
              params.set("page", String(newTargetPage));
              router.push(`${pathname}?${params.toString()}`);
              return;
          }
        }
      } else {
        setVlansData({ data: [], totalCount: 0, currentPage: 1, totalPages: 0, pageSize: ITEMS_PER_PAGE });
      }
    } catch (error) {
       toast({ title: "获取VLAN错误", description: (error as Error).message, variant: "destructive" });
       setVlansData({ data: [], totalCount: 0, currentPage: 1, totalPages: 0, pageSize: ITEMS_PER_PAGE });
    } finally {
      setIsLoading(false);
      setSelectedIds(new Set());
    }
  }, [currentUser, isAuthLoading, toast, currentPage, router, pathname, searchParams]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleVlanCreationSuccess = React.useCallback(async () => {
    try {
      const paginationInfo = await getVLANsAction({ page: 1, pageSize: 1 }); // Fetch minimal to get totalPages
      const newTotalPages = paginationInfo.totalPages;
      const targetPage = newTotalPages > 0 ? newTotalPages : 1;
      const currentUrlPage = Number(searchParams.get('page')) || 1;

      if (targetPage !== currentUrlPage) {
        const params = new URLSearchParams(searchParams.toString());
        params.set("page", String(targetPage));
        router.push(`${pathname}?${params.toString()}`);
        // fetchData will be triggered by useEffect watching searchParams
      } else {
        fetchData(); // Refresh current page if target is the same
      }
    } catch (error) {
      toast({
        title: "刷新错误",
        description: "创建VLAN后无法导航到目标页面，正在刷新当前页面。",
        variant: "destructive",
      });
      fetchData(); // Fallback to refreshing current page
    }
  }, [fetchData, router, pathname, searchParams, toast]);


  const handleSelectAll = (checked: boolean | 'indeterminate') => {
    if (checked === true) {
      const allIdsOnPage = vlansData?.data.map(v => v.id) || [];
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

  if (isAuthLoading || isLoading && !vlansData) {
     return <LoadingVlansPage />;
  }

  if (!currentUser || !hasPermission(currentUser, PERMISSIONS.VIEW_VLAN)) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Cable className="h-16 w-16 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2">访问被拒绝</h2>
        <p className="text-muted-foreground">您没有权限查看VLAN。</p>
      </div>
    );
  }

  const canCreate = hasPermission(currentUser, PERMISSIONS.CREATE_VLAN);
  const canEdit = hasPermission(currentUser, PERMISSIONS.EDIT_VLAN);
  const canDelete = hasPermission(currentUser, PERMISSIONS.DELETE_VLAN);

  const actionButtons = (
    <div className="flex flex-wrap gap-2">
      {canDelete && selectedIds.size > 0 && (
        <BatchDeleteConfirmationDialog
          selectedIds={selectedIds}
          itemTypeDisplayName="VLAN"
          batchDeleteAction={batchDeleteVLANsAction}
          onBatchDeleted={fetchData}
        />
      )}
      {canCreate && (
        <>
          <VlanBatchFormSheet onVlanChange={handleVlanCreationSuccess}>
            <Button variant="outline">
              <PlusCircle className="mr-2 h-4 w-4" /> 批量添加VLAN
            </Button>
          </VlanBatchFormSheet>
          <VlanFormSheet onVlanChange={handleVlanCreationSuccess} />
        </>
      )}
    </div>
  );

  const dataIsAvailable = !!(vlansData && vlansData.data && vlansData.data.length > 0);
  const isAllOnPageSelected = dataIsAvailable ? vlansData.data!.every(v => selectedIds.has(v.id)) : false;
  const isSomeOnPageSelected = dataIsAvailable ? vlansData.data!.some(s => selectedIds.has(s.id)) : false;
  const finalCurrentPage = vlansData?.currentPage || 1;
  const finalTotalPages = vlansData?.totalPages || 0;
  const finalTotalCount = vlansData?.totalCount || 0;
  const vlansToDisplay = vlansData?.data || [];


  return (
    <>
      <PageHeader
        title="VLAN 管理"
        description="组织和管理您的虚拟局域网。"
        icon={<Cable className="h-6 w-6 text-primary" />}
        actionElement={actionButtons}
      />

      <Card>
        <CardHeader>
          <CardTitle>VLAN 列表</CardTitle>
          <CardDescription>您网络中所有已配置的VLAN。显示 {vlansToDisplay.length} 条，共 {finalTotalCount} 条VLAN。</CardDescription>
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
                    <TableHead>VLAN 号码</TableHead>
                    <TableHead>VLAN 名称</TableHead>
                    <TableHead>描述</TableHead>
                    <TableHead>关联资源数</TableHead>
                    {(canEdit || canDelete) && <TableHead className="text-right">操作</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vlansToDisplay.map((vlan) => (
                    <TableRow key={vlan.id} data-state={selectedIds.has(vlan.id) ? "selected" : ""}>
                      <TableCell>
                        {canDelete && (
                          <Checkbox
                            checked={selectedIds.has(vlan.id)}
                            onCheckedChange={(checked) => handleSelectItem(vlan.id, checked)}
                            aria-label={`选择VLAN ${vlan.vlanNumber}`}
                          />
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{vlan.vlanNumber}</TableCell>
                      <TableCell className="max-w-xs truncate">{vlan.name || "无"}</TableCell>
                      <TableCell className="max-w-md truncate">{vlan.description || "无"}</TableCell>
                      <TableCell>{vlan.subnetCount ?? 0}</TableCell>
                      {(canEdit || canDelete) && (
                        <TableCell className="text-right">
                          {canEdit && (
                              <VlanFormSheet vlan={vlan} onVlanChange={fetchData}>
                              <Button variant="ghost" size="icon" aria-label="编辑VLAN">
                                  <Edit className="h-4 w-4" />
                              </Button>
                              </VlanFormSheet>
                          )}
                          {canDelete && (
                              <DeleteConfirmationDialog
                              itemId={vlan.id}
                              itemName={`VLAN ${vlan.vlanNumber} (${vlan.name || '无名称'})`}
                              deleteAction={deleteVLANAction}
                              onDeleted={fetchData}
                              triggerButton={
                                  <Button variant="ghost" size="icon" aria-label="删除VLAN">
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
              <p className="text-muted-foreground">未找到VLAN。</p>
              {canCreate && <VlanFormSheet onVlanChange={handleVlanCreationSuccess} buttonProps={{className: "mt-4"}} />}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

export default function VlansPage() {
  return (
    <Suspense fallback={<LoadingVlansPage />}>
      <VlansView />
    </Suspense>
  );
}
