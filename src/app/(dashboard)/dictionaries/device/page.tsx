"use client";

import * as React from "react";
import { Suspense } from 'react';
import { usePathname, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { HardDrive, Loader2, Edit, Trash2, ShieldAlert } from "lucide-react";
import { PERMISSIONS, type DeviceDictionary } from "@/types";
import { getDeviceDictionariesAction, deleteDeviceDictionaryAction, batchDeleteDeviceDictionariesAction } from "@/lib/actions";
import { DeviceDictionaryFormSheet } from "./device-dictionary-form-sheet";
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog";
import { BatchDeleteConfirmationDialog } from "@/components/batch-delete-confirmation-dialog";
import { PaginationControls } from "@/components/pagination-controls";
import { useEntityManagement } from "@/hooks/use-entity-management";
import { useSelection } from "@/hooks/use-selection";

function LoadingPage() {
  return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
      <p className="ml-3 text-lg">加载设备字典...</p>
    </div>
  );
}

function DeviceDictionaryView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { data: dictData, isLoading, fetchData, canView, canCreate, canEdit, canDelete } = useEntityManagement<DeviceDictionary, any>({
    fetchAction: getDeviceDictionariesAction,
    permission: {
      view: PERMISSIONS.VIEW_DEVICE_DICTIONARY,
      create: PERMISSIONS.CREATE_DEVICE_DICTIONARY,
      edit: PERMISSIONS.EDIT_DEVICE_DICTIONARY,
      delete: PERMISSIONS.DELETE_DEVICE_DICTIONARY,
    },
  });

  const itemsToDisplay = dictData?.data || [];
  const { selectedIds, setSelectedIds, handleSelectAll, handleSelectItem, checkboxState } = useSelection(itemsToDisplay);

  const onActionSuccess = () => {
    fetchData();
    setSelectedIds(new Set());
  };

  if (isLoading) return <LoadingPage />;
  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <ShieldAlert className="h-16 w-16 text-destructive mb-4" /><h2 className="text-2xl font-semibold mb-2">访问被拒绝</h2><p className="text-muted-foreground">您没有权限查看设备字典。</p>
      </div>
    );
  }

  const pageActionButtons = (
    <div className="flex flex-col sm:flex-row gap-2">
      {canDelete && selectedIds.size > 0 && <BatchDeleteConfirmationDialog selectedIds={selectedIds} itemTypeDisplayName="设备字典条目" batchDeleteAction={batchDeleteDeviceDictionariesAction} onBatchDeleted={onActionSuccess} />}
      {canCreate && <DeviceDictionaryFormSheet onDataChange={onActionSuccess} buttonProps={{className: "w-full sm:w-auto"}}/>}
    </div>
  );
  
  return (
    <>
      <PageHeader title="设备字典管理" description="管理设备名称信息。" icon={<HardDrive className="h-6 w-6 text-primary" />} actionElement={pageActionButtons} />
      <Card>
        <CardHeader><CardTitle>设备列表</CardTitle><CardDescription>显示 {itemsToDisplay.length} 条，共 {dictData?.totalCount || 0} 条设备字典条目。</CardDescription></CardHeader>
        <CardContent>
          {itemsToDisplay.length > 0 ? (
            <>
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="w-[50px]">{canDelete && <Checkbox checked={checkboxState} onCheckedChange={handleSelectAll} aria-label="全选当前页"/>}</TableHead>
                  <TableHead>设备名称</TableHead>
                  {(canEdit || canDelete) && <TableHead className="text-right">操作</TableHead>}
                </TableRow></TableHeader>
                <TableBody>
                  {itemsToDisplay.map((item) => (
                    <TableRow key={item.id} data-state={selectedIds.has(item.id) ? "selected" : ""}>
                      <TableCell>{canDelete && <Checkbox checked={selectedIds.has(item.id)} onCheckedChange={(checked) => handleSelectItem(item.id, checked)} aria-label={`选择条目 ${item.deviceName}`}/>}</TableCell>
                      <TableCell className="font-medium">{item.deviceName}</TableCell>
                      {(canEdit || canDelete) && (
                        <TableCell className="text-right">
                          {canEdit && <DeviceDictionaryFormSheet dictionaryEntry={item} onDataChange={onActionSuccess}><Button variant="ghost" size="icon" aria-label="编辑条目"><Edit className="h-4 w-4" /></Button></DeviceDictionaryFormSheet>}
                          {canDelete && <DeleteConfirmationDialog itemId={item.id} itemName={item.deviceName} deleteAction={deleteDeviceDictionaryAction} onDeleted={onActionSuccess} triggerButton={<Button variant="ghost" size="icon" aria-label="删除条目"><Trash2 className="h-4 w-4" /></Button>} />}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {dictData && dictData.totalPages > 1 && <PaginationControls currentPage={dictData.currentPage} totalPages={dictData.totalPages} basePath={pathname} currentQuery={searchParams} />}
            </>
          ) : (
             <div className="text-center py-10">
              <p className="text-muted-foreground">未找到设备字典数据。</p>
              {canCreate && <DeviceDictionaryFormSheet onDataChange={onActionSuccess} buttonProps={{className: "mt-4"}}/>}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

export default function DeviceDictionaryPage() { return <Suspense fallback={<LoadingPage />}><DeviceDictionaryView /></Suspense>; }
