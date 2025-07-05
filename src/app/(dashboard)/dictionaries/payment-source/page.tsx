"use client";

import * as React from "react";
import { Suspense } from 'react';
import { usePathname, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CreditCard, Loader2, Edit, Trash2, ShieldAlert } from "lucide-react";
import { PERMISSIONS, type PaymentSourceDictionary } from "@/types";
import { getPaymentSourceDictionariesAction, deletePaymentSourceDictionaryAction, batchDeletePaymentSourceDictionariesAction } from "@/lib/actions";
import { PaymentSourceDictionaryFormSheet } from "./payment-source-dictionary-form-sheet";
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog";
import { BatchDeleteConfirmationDialog } from "@/components/batch-delete-confirmation-dialog";
import { PaginationControls } from "@/components/pagination-controls";
import { useEntityManagement } from "@/hooks/use-entity-management";
import { useSelection } from "@/hooks/use-selection";

function LoadingPage() {
  return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
      <p className="ml-3 text-lg">加载付费来源字典...</p>
    </div>
  );
}

function PaymentSourceDictionaryView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { data: dictData, isLoading, fetchData, canView, canCreate, canEdit, canDelete } = useEntityManagement<PaymentSourceDictionary, any>({
    fetchAction: getPaymentSourceDictionariesAction,
    permission: {
      view: PERMISSIONS.VIEW_DICTIONARY_PAYMENT_SOURCE,
      create: PERMISSIONS.CREATE_DICTIONARY_PAYMENT_SOURCE,
      edit: PERMISSIONS.EDIT_DICTIONARY_PAYMENT_SOURCE,
      delete: PERMISSIONS.DELETE_DICTIONARY_PAYMENT_SOURCE,
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
        <ShieldAlert className="h-16 w-16 text-destructive mb-4" /><h2 className="text-2xl font-semibold mb-2">访问被拒绝</h2><p className="text-muted-foreground">您没有权限查看付费来源字典。</p>
      </div>
    );
  }

  const pageActionButtons = (
    <div className="flex flex-col sm:flex-row gap-2">
      {canDelete && selectedIds.size > 0 && <BatchDeleteConfirmationDialog selectedIds={selectedIds} itemTypeDisplayName="付费来源字典条目" batchDeleteAction={batchDeletePaymentSourceDictionariesAction} onBatchDeleted={onActionSuccess} />}
      {canCreate && <PaymentSourceDictionaryFormSheet onDataChange={onActionSuccess} buttonProps={{className: "w-full sm:w-auto"}}/>}
    </div>
  );
  
  return (
    <>
      <PageHeader title="付费来源字典管理" description="管理费用来源信息。" icon={<CreditCard className="h-6 w-6 text-primary" />} actionElement={pageActionButtons} />
      <Card>
        <CardHeader><CardTitle>付费来源列表</CardTitle><CardDescription>显示 {itemsToDisplay.length} 条，共 {dictData?.totalCount || 0} 条付费来源字典条目。</CardDescription></CardHeader>
        <CardContent>
          {itemsToDisplay.length > 0 ? (
            <>
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="w-[50px]">{canDelete && <Checkbox checked={checkboxState} onCheckedChange={handleSelectAll} aria-label="全选当前页"/>}</TableHead>
                  <TableHead>来源名称</TableHead>
                  {(canEdit || canDelete) && <TableHead className="text-right">操作</TableHead>}
                </TableRow></TableHeader>
                <TableBody>
                  {itemsToDisplay.map((item) => (
                    <TableRow key={item.id} data-state={selectedIds.has(item.id) ? "selected" : ""}>
                      <TableCell>{canDelete && <Checkbox checked={selectedIds.has(item.id)} onCheckedChange={(checked) => handleSelectItem(item.id, checked)} aria-label={`选择条目 ${item.sourceName}`}/>}</TableCell>
                      <TableCell className="font-medium">{item.sourceName}</TableCell>
                      {(canEdit || canDelete) && (
                        <TableCell className="text-right">
                          {canEdit && <PaymentSourceDictionaryFormSheet dictionaryEntry={item} onDataChange={onActionSuccess}><Button variant="ghost" size="icon" aria-label="编辑条目"><Edit className="h-4 w-4" /></Button></PaymentSourceDictionaryFormSheet>}
                          {canDelete && <DeleteConfirmationDialog itemId={item.id} itemName={item.sourceName} deleteAction={deletePaymentSourceDictionaryAction} onDeleted={onActionSuccess} triggerButton={<Button variant="ghost" size="icon" aria-label="删除条目"><Trash2 className="h-4 w-4" /></Button>} />}
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
              <p className="text-muted-foreground">未找到付费来源字典数据。</p>
              {canCreate && <PaymentSourceDictionaryFormSheet onDataChange={onActionSuccess} buttonProps={{className: "mt-4"}}/>}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

export default function PaymentSourceDictionaryPage() { return <Suspense fallback={<LoadingPage />}><PaymentSourceDictionaryView /></Suspense>; }
