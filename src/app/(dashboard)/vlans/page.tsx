"use client";

import * as React from "react";
import { Suspense } from 'react';
import { usePathname, useSearchParams } from "next/navigation";
import { Edit, Trash2, Cable, PlusCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { getVLANsAction, deleteVLANAction, batchDeleteVLANsAction } from "@/lib/actions";
import type { VLAN } from "@/types";
import { PERMISSIONS } from "@/types";
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog";
import { BatchDeleteConfirmationDialog } from "@/components/batch-delete-confirmation-dialog";
import { VlanFormSheet } from "./vlan-form-sheet";
import { VlanBatchFormSheet } from "./vlan-batch-form-sheet";
import { PaginationControls } from "@/components/pagination-controls";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useEntityManagement } from "@/hooks/use-entity-management";
import { useSelection } from "@/hooks/use-selection";

function LoadingVlansPage() {
  return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
      <p className="ml-3 text-lg">加载VLAN中...</p>
    </div>
  );
}

function VlansView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { data: vlansData, isLoading, fetchData, canView, canCreate, canEdit, canDelete } = useEntityManagement<VLAN, any>({
    fetchAction: getVLANsAction,
    permission: {
      view: PERMISSIONS.VIEW_VLAN,
      create: PERMISSIONS.CREATE_VLAN,
      edit: PERMISSIONS.EDIT_VLAN,
      delete: PERMISSIONS.DELETE_VLAN,
    },
  });

  const vlansToDisplay = vlansData?.data || [];
  const { selectedIds, setSelectedIds, handleSelectAll, handleSelectItem, checkboxState } = useSelection(vlansToDisplay);

  const onActionSuccess = () => {
    fetchData();
    setSelectedIds(new Set());
  };

  if (isLoading) {
     return <LoadingVlansPage />;
  }

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Cable className="h-16 w-16 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2">访问被拒绝</h2>
        <p className="text-muted-foreground">您没有权限查看VLAN。</p>
      </div>
    );
  }

  const actionButtons = (
    <div className="flex flex-wrap gap-2">
      {canDelete && selectedIds.size > 0 && (
        <BatchDeleteConfirmationDialog
          selectedIds={selectedIds}
          itemTypeDisplayName="VLAN"
          batchDeleteAction={batchDeleteVLANsAction}
          onBatchDeleted={onActionSuccess}
        />
      )}
      {canCreate && (
        <>
          <VlanBatchFormSheet onVlanChange={onActionSuccess}>
            <Button variant="outline">
              <PlusCircle className="mr-2 h-4 w-4" /> 批量添加VLAN
            </Button>
          </VlanBatchFormSheet>
          <VlanFormSheet onVlanChange={onActionSuccess} />
        </>
      )}
    </div>
  );

  return (
    <TooltipProvider>
      <PageHeader
        title="VLAN 管理"
        description="组织和管理您的虚拟局域网。"
        icon={<Cable className="h-6 w-6 text-primary" />}
        actionElement={actionButtons}
      />

      <Card>
        <CardHeader>
          <CardTitle>VLAN 列表</CardTitle>
          <CardDescription>您网络中所有已配置的VLAN。显示 {vlansToDisplay.length} 条，共 {vlansData?.totalCount || 0} 条VLAN。</CardDescription>
        </CardHeader>
        <CardContent>
          {vlansToDisplay.length > 0 ? (
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
                    <TableHead>VLAN 号码</TableHead>
                    <TableHead>VLAN 名称</TableHead>
                    <TableHead>关联资源数</TableHead>
                    <TableHead>描述</TableHead>
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
                      <TableCell>{vlan.subnetCount ?? 0}</TableCell>
                      <TableCell className="max-w-md truncate">
                        {vlan.description ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-default">{vlan.description}</span>
                            </TooltipTrigger>
                            <TooltipContent side="top" align="start">
                              <p className="max-w-xs whitespace-pre-wrap break-words">{vlan.description}</p>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          "无"
                        )}
                      </TableCell>
                      {(canEdit || canDelete) && (
                        <TableCell className="text-right">
                          {canEdit && (
                              <VlanFormSheet vlan={vlan} onVlanChange={onActionSuccess}>
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
                              onDeleted={onActionSuccess}
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
              {vlansData && vlansData.totalPages > 1 && (
                <PaginationControls
                  currentPage={vlansData.currentPage}
                  totalPages={vlansData.totalPages}
                  basePath={pathname}
                  currentQuery={searchParams}
                />
              )}
            </>
          ) : (
             <div className="text-center py-10">
              <p className="text-muted-foreground">未找到VLAN。</p>
              {canCreate && <VlanFormSheet onVlanChange={onActionSuccess} buttonProps={{className: "mt-4"}} />}
            </div>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}

export default function VlansPage() {
  return (
    <Suspense fallback={<LoadingVlansPage />}>
      <VlansView />
    </Suspense>
  );
}
