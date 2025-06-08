
"use client";

import * as React from "react";
import { Suspense } from 'react';
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { NetworkIcon, Edit, Trash2, Loader2, PlusCircle } from "lucide-react"; 
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { PageHeader } from "@/components/page-header";
import { getSubnetsAction, getVLANsAction, deleteSubnetAction, batchDeleteSubnetsAction } from "@/lib/actions";
import type { Subnet, VLAN, PaginatedResponse } from "@/types";
import { PERMISSIONS } from "@/types";
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog";
import { BatchDeleteConfirmationDialog } from "@/components/batch-delete-confirmation-dialog";
import { SubnetFormSheet } from "./subnet-form-sheet";
// Removed: import { SubnetSmartBatchFormSheet } from "./subnet-smart-batch-form-sheet"; 
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useCurrentUser, hasPermission } from "@/hooks/use-current-user";
import { useToast } from "@/hooks/use-toast";
import { PaginationControls } from "@/components/pagination-controls";

const ITEMS_PER_PAGE = 10;

function LoadingSubnetsPage() {
  return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
      <p className="ml-3 text-lg">加载子网中...</p>
    </div>
  );
}

function SubnetsView() {
  const [subnetsData, setSubnetsData] = React.useState<PaginatedResponse<Subnet> | null>(null);
  const [vlans, setVlans] = React.useState<VLAN[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());

  const { currentUser, isAuthLoading } = useCurrentUser();
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentPage = Number(searchParams.get('page')) || 1;

  const fetchData = React.useCallback(async () => {
    if (isAuthLoading || !currentUser) {
      if (!isAuthLoading && !currentUser) {
           setSubnetsData({ data: [], totalCount: 0, currentPage: currentPage, totalPages: 0, pageSize: ITEMS_PER_PAGE });
           setVlans([]);
           setIsLoading(false);
      } else {
        setIsLoading(true);
      }
      return;
    }
    setIsLoading(true);
    try {
      if (!hasPermission(currentUser, PERMISSIONS.VIEW_SUBNET)) {
          setSubnetsData({ data: [], totalCount: 0, currentPage: currentPage, totalPages: 0, pageSize: ITEMS_PER_PAGE });
          setVlans([]);
          setIsLoading(false);
          return;
      }

      const [subnetsResponse, vlansResponse] = await Promise.all([
        getSubnetsAction({ page: currentPage, pageSize: ITEMS_PER_PAGE }),
        getVLANsAction(),
      ]);
      setSubnetsData(subnetsResponse);
      setVlans(vlansResponse.data || []);

      if (subnetsResponse.data.length === 0 && subnetsResponse.currentPage > 1) {
        const newTargetPage = subnetsResponse.totalPages > 0 ? subnetsResponse.totalPages : 1;
        const currentUrlPage = Number(searchParams.get('page')) || 1;
        if (currentUrlPage !== newTargetPage && currentUrlPage > subnetsResponse.totalPages) {
            const params = new URLSearchParams(searchParams.toString());
            params.set("page", String(newTargetPage));
            router.push(`${pathname}?${params.toString()}`);
            return;
        }
      }

    } catch (error: any) {
      console.error("加载子网数据时出错:", error);
      toast({
        title: "加载子网错误",
        description: error.message || "无法加载子网和VLAN。",
        variant: "destructive",
      });
      setSubnetsData({ data: [], totalCount: 0, currentPage: currentPage, totalPages: 0, pageSize: ITEMS_PER_PAGE });
      setVlans([]);
    } finally {
      setIsLoading(false);
      setSelectedIds(new Set());
    }
  }, [currentPage, toast, currentUser, isAuthLoading, router, pathname, searchParams]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSubnetCreationSuccess = React.useCallback(async () => {
    try {
      const paginationInfo = await getSubnetsAction({ page: 1, pageSize: 1 });
      const newTotalPages = paginationInfo.totalPages;
      const targetPage = newTotalPages > 0 ? newTotalPages : 1;
      const currentUrlPage = Number(searchParams.get('page')) || 1;

      if (targetPage !== currentUrlPage) {
        const params = new URLSearchParams(searchParams.toString());
        params.set("page", String(targetPage));
        router.push(`${pathname}?${params.toString()}`);
      } else {
        fetchData();
      }
    } catch (error) {
      toast({
        title: "刷新错误",
        description: "创建子网后无法导航到目标页面，正在刷新当前页面。",
        variant: "destructive",
      });
      fetchData(); 
    }
  }, [fetchData, router, pathname, searchParams, toast]);


  const handleSelectAll = (checked: boolean | 'indeterminate') => {
    if (checked === true) {
      const allIdsOnPage = subnetsData?.data.map(s => s.id) || [];
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

  if (isAuthLoading || isLoading && !subnetsData) {
    return <LoadingSubnetsPage />;
  }

  if (!currentUser || !hasPermission(currentUser, PERMISSIONS.VIEW_SUBNET)) {
    return (
        <div className="flex flex-col items-center justify-center h-full">
            <NetworkIcon className="h-16 w-16 text-destructive mb-4" />
            <h2 className="text-2xl font-semibold mb-2">访问被拒绝</h2>
            <p className="text-muted-foreground">您没有权限查看子网。</p>
        </div>
    );
  }

  if (!subnetsData) {
    return <p>准备子网数据时出错。请尝试刷新。</p>;
  }

  const { data: subnetsToDisplay, totalCount, currentPage: finalCurrentPage, totalPages } = subnetsData;

  const canCreate = hasPermission(currentUser, PERMISSIONS.CREATE_SUBNET);
  const canEdit = hasPermission(currentUser, PERMISSIONS.EDIT_SUBNET);
  const canDelete = hasPermission(currentUser, PERMISSIONS.DELETE_SUBNET);

  const isAllOnPageSelected = subnetsToDisplay.length > 0 && subnetsToDisplay.every(s => selectedIds.has(s.id));
  const isSomeOnPageSelected = subnetsToDisplay.length > 0 && subnetsToDisplay.some(s => selectedIds.has(s.id));


  return (
    <>
      <div className="md:hidden">
        <Card>
          <CardHeader>
            <CardTitle>不支持移动视图</CardTitle>
            <CardDescription>请使用桌面或更大屏幕查看此页面。</CardDescription>
          </CardHeader>
        </Card>
      </div>
      <div className="hidden md:block">
        <PageHeader
          title="子网管理"
          description="查看、创建和管理您的网络子网。"
          icon={<NetworkIcon className="h-6 w-6 text-primary" />}
          actionElement={
            <div className="flex flex-col sm:flex-row gap-2">
              {canDelete && selectedIds.size > 0 && (
                <BatchDeleteConfirmationDialog
                  selectedIds={selectedIds}
                  itemTypeDisplayName="子网"
                  batchDeleteAction={batchDeleteSubnetsAction}
                  onBatchDeleted={fetchData}
                />
              )}
              {canCreate && (
                <SubnetFormSheet vlans={vlans} onSubnetChange={handleSubnetCreationSuccess} buttonProps={{className: "w-full sm:w-auto"}} />
              )}
            </div>
          }
        />
        <Card>
          <CardHeader>
            <CardTitle>子网列表</CardTitle>
            <CardDescription>
              显示 {subnetsToDisplay.length} 条，共 {totalCount} 条子网。
            </CardDescription>
          </CardHeader>
          <CardContent>
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
                  <TableHead>CIDR</TableHead>
                  <TableHead>VLAN</TableHead>
                  <TableHead>描述</TableHead>
                  <TableHead>利用率</TableHead>
                  {(canEdit || canDelete) && <TableHead className="text-right">操作</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {subnetsToDisplay.map((subnet) => {
                  const vlanInfo = subnet.vlanId ? vlans.find(v => v.id === subnet.vlanId) : null;
                  const vlanDisplay = vlanInfo
                    ? `VLAN ${vlanInfo.vlanNumber}${vlanInfo.name ? ` (${vlanInfo.name})` : ''}`
                    : <span className="text-muted-foreground text-xs">无</span>;
                  return (
                    <TableRow key={subnet.id} data-state={selectedIds.has(subnet.id) && "selected"}>
                      <TableCell>
                        {canDelete && (
                           <Checkbox
                            checked={selectedIds.has(subnet.id)}
                            onCheckedChange={(checked) => handleSelectItem(subnet.id, checked)}
                            aria-label={`选择子网 ${subnet.cidr}`}
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        <Link href={`/ip-addresses?subnetId=${subnet.id}`} className="hover:underline font-medium">
                          {subnet.cidr}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {vlanInfo ? (
                          <Badge variant="outline">{vlanDisplay}</Badge>
                        ) : (
                          vlanDisplay
                        )}
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-sm text-muted-foreground">{subnet.description || "无"}</TableCell>
                      <TableCell>
                        <Badge variant={ (subnet.utilization ?? 0) > 85 ? "destructive" : "secondary"}>
                          {subnet.utilization ?? 0}%
                        </Badge>
                      </TableCell>
                      {(canEdit || canDelete) && (
                        <TableCell className="text-right">
                          {canEdit && (
                            <SubnetFormSheet
                              subnet={subnet}
                              vlans={vlans}
                              onSubnetChange={fetchData} // Edit still uses plain fetchData
                            >
                              <Button variant="ghost" size="icon" aria-label="编辑子网">
                                <Edit className="h-4 w-4" />
                              </Button>
                            </SubnetFormSheet>
                          )}
                          {canDelete && (
                            <DeleteConfirmationDialog
                              itemId={subnet.id}
                              itemName={subnet.cidr}
                              deleteAction={deleteSubnetAction}
                              onDeleted={fetchData}
                              dialogTitle="删除子网?"
                              dialogDescription={`您确定要删除子网 ${subnet.cidr} 吗？此操作无法撤销。`}
                              triggerButton={
                                <Button variant="ghost" size="icon" aria-label="删除子网">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              }
                            />
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
                {subnetsToDisplay.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={(canEdit || canDelete) ? 6 : 5} className="text-center h-24 text-muted-foreground">
                      未找到子网。{canCreate && "尝试创建一个！"}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            {totalPages > 1 && (
              <PaginationControls
                currentPage={finalCurrentPage}
                totalPages={totalPages}
                basePath={pathname}
                currentQuery={searchParams}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export default function SubnetsPage() {
  return (
    <Suspense fallback={<LoadingSubnetsPage />}>
      <SubnetsView />
    </Suspense>
  );
}
    

    