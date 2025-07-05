"use client";

import * as React from "react";
import { Suspense } from 'react';
import { usePathname, useSearchParams } from "next/navigation";
import { NetworkIcon, Edit, Trash2, Loader2, PlusCircle, CheckCircle, XCircle } from "lucide-react"; 
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { PageHeader } from "@/components/page-header";
import { getSubnetsAction, getVLANsAction, deleteSubnetAction, batchDeleteSubnetsAction } from "@/lib/actions";
import type { Subnet, VLAN } from "@/types";
import { PERMISSIONS } from "@/types";
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog";
import { BatchDeleteConfirmationDialog } from "@/components/batch-delete-confirmation-dialog";
import { SubnetFormSheet } from "./subnet-form-sheet";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { PaginationControls } from "@/components/pagination-controls";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useEntityManagement } from "@/hooks/use-entity-management";
import { useSelection } from "@/hooks/use-selection";
import { useCurrentUser } from "@/hooks/use-current-user";

function LoadingSubnetsPage() {
  return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
      <p className="ml-3 text-lg">加载子网中...</p>
    </div>
  );
}

function SubnetsView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [vlans, setVlans] = React.useState<VLAN[]>([]);
  const { currentUser } = useCurrentUser();

  const { data: subnetsData, isLoading, fetchData, canView, canCreate, canEdit, canDelete } = useEntityManagement<Subnet, any>({
    fetchAction: getSubnetsAction,
    permission: {
      view: PERMISSIONS.VIEW_SUBNET,
      create: PERMISSIONS.CREATE_SUBNET,
      edit: PERMISSIONS.EDIT_SUBNET,
      delete: PERMISSIONS.DELETE_SUBNET,
    },
  });

  const subnetsToDisplay = subnetsData?.data || [];
  const { selectedIds, setSelectedIds, handleSelectAll, handleSelectItem, checkboxState } = useSelection(subnetsToDisplay);

  React.useEffect(() => {
    let isMounted = true;
    if (canView) {
      getVLANsAction()
        .then(vlansResponse => {
          if (isMounted) setVlans(vlansResponse.data || []);
        })
        .catch(error => {
          if (isMounted) toast({ title: "获取VLAN错误", description: (error as Error).message, variant: "destructive" });
        });
    }
    return () => { isMounted = false; };
  }, [canView, toast]);

  const onActionSuccess = () => {
    fetchData();
    setSelectedIds(new Set());
  };

  if (isLoading) {
    return <LoadingSubnetsPage />;
  }

  if (!canView) {
    return (
        <div className="flex flex-col items-center justify-center h-full">
            <NetworkIcon className="h-16 w-16 text-destructive mb-4" />
            <h2 className="text-2xl font-semibold mb-2">访问被拒绝</h2>
            <p className="text-muted-foreground">您没有权限查看子网。</p>
        </div>
    );
  }

  return (
    <>
      <div className="md:hidden">
        <Card><CardHeader><CardTitle>不支持移动视图</CardTitle><CardDescription>请使用桌面或更大屏幕查看此页面。</CardDescription></CardHeader></Card>
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
                  onBatchDeleted={onActionSuccess}
                />
              )}
              {canCreate && (
                <SubnetFormSheet vlans={vlans} onSubnetChange={onActionSuccess} buttonProps={{className: "w-full sm:w-auto"}} />
              )}
            </div>
          }
        />
        <Card>
          <CardHeader><CardTitle>子网列表</CardTitle><CardDescription>显示 {subnetsToDisplay.length} 条，共 {subnetsData?.totalCount || 0} 条子网。</CardDescription></CardHeader>
          <CardContent>
            <TooltipProvider>
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="w-[50px]">{canDelete && <Checkbox checked={checkboxState} onCheckedChange={handleSelectAll} aria-label="全选当前页" />}</TableHead>
                  <TableHead>CIDR</TableHead><TableHead>名称</TableHead><TableHead>VLAN</TableHead><TableHead>DHCP</TableHead><TableHead>利用率</TableHead><TableHead>描述</TableHead>
                  {(canEdit || canDelete) && <TableHead className="text-right">操作</TableHead>}
                </TableRow></TableHeader>
                <TableBody>
                  {subnetsToDisplay.length > 0 ? subnetsToDisplay.map((subnet) => {
                    const vlanInfo = subnet.vlanId ? vlans.find(v => v.id === subnet.vlanId) : null;
                    const vlanDisplay = vlanInfo ? `VLAN ${vlanInfo.vlanNumber}${vlanInfo.name ? ` (${vlanInfo.name})` : ''}` : <span className="text-muted-foreground text-xs">无</span>;
                    return (
                      <TableRow key={subnet.id} data-state={selectedIds.has(subnet.id) && "selected"}>
                        <TableCell>{canDelete && <Checkbox checked={selectedIds.has(subnet.id)} onCheckedChange={(checked) => handleSelectItem(subnet.id, checked)} aria-label={`选择子网 ${subnet.cidr}`}/>}</TableCell>
                        <TableCell><Link href={`/ip-addresses?subnetId=${subnet.id}`} className="hover:underline font-medium">{subnet.cidr}</Link></TableCell>
                        <TableCell className="max-w-[150px] truncate text-sm">{subnet.name || "无"}</TableCell>
                        <TableCell>{vlanInfo ? <Badge variant="outline">{vlanDisplay}</Badge> : vlanDisplay}</TableCell>
                        <TableCell className="text-center">{subnet.dhcpEnabled ? <CheckCircle className="h-5 w-5 text-green-500" /> : <XCircle className="h-5 w-5 text-muted-foreground" />}</TableCell>
                        <TableCell><Badge variant={ (subnet.utilization ?? 0) > 85 ? "destructive" : "secondary"}>{subnet.utilization ?? 0}%</Badge></TableCell>
                        <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                          {subnet.description ? (<Tooltip><TooltipTrigger asChild><span className="cursor-default">{subnet.description}</span></TooltipTrigger><TooltipContent side="top" align="start"><p className="max-w-xs whitespace-pre-wrap break-words">{subnet.description}</p></TooltipContent></Tooltip>) : ("无")}
                        </TableCell>
                        {(canEdit || canDelete) && (
                          <TableCell className="text-right">
                            {canEdit && <SubnetFormSheet subnet={subnet} vlans={vlans} onSubnetChange={onActionSuccess}><Button variant="ghost" size="icon" aria-label="编辑子网"><Edit className="h-4 w-4" /></Button></SubnetFormSheet>}
                            {canDelete && <DeleteConfirmationDialog itemId={subnet.id} itemName={`${subnet.name || subnet.cidr}`} deleteAction={deleteSubnetAction} onDeleted={onActionSuccess} dialogTitle="删除子网?" dialogDescription={`您确定要删除子网 ${subnet.name || subnet.cidr} 吗？此操作无法撤销。`} triggerButton={<Button variant="ghost" size="icon" aria-label="删除子网"><Trash2 className="h-4 w-4" /></Button>}/>}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  }) : (
                    <TableRow><TableCell colSpan={(canEdit || canDelete) ? 8 : 7} className="text-center h-24 text-muted-foreground">未找到子网。{canCreate && "尝试创建一个！"}</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </TooltipProvider>
            {subnetsData && subnetsData.totalPages > 1 && <PaginationControls currentPage={subnetsData.currentPage} totalPages={subnetsData.totalPages} basePath={pathname} currentQuery={searchParams}/>}
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
