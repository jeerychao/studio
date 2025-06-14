
"use client";

import * as React from "react";
import { Suspense } from 'react';
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Waypoints, Loader2, PlusCircle, Edit, Trash2, ShieldAlert } from "lucide-react"; // Using Waypoints icon
import { useCurrentUser, hasPermission } from "@/hooks/use-current-user";
import { PERMISSIONS, type AccessTypeDictionary, type PaginatedResponse } from "@/types";
import { getAccessTypeDictionariesAction, deleteAccessTypeDictionaryAction, batchDeleteAccessTypeDictionariesAction } from "@/lib/actions";
import { useToast } from "@/hooks/use-toast";
import { AccessTypeDictionaryFormSheet } from "./access-type-dictionary-form-sheet";
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog";
import { BatchDeleteConfirmationDialog } from "@/components/batch-delete-confirmation-dialog";
import { PaginationControls } from "@/components/pagination-controls";

const ITEMS_PER_PAGE = 10;

function LoadingPage() {
  return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
      <p className="ml-3 text-lg">加载接入方式字典...</p>
    </div>
  );
}

function AccessTypeDictionaryView() {
  const [dictData, setDictData] = React.useState<PaginatedResponse<AccessTypeDictionary> | null>(null);
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
      if (hasPermission(currentUser, PERMISSIONS.VIEW_DICTIONARY_ACCESS_TYPE)) {
        const fetchedResult = await getAccessTypeDictionariesAction({ page: currentPage, pageSize: ITEMS_PER_PAGE });
         if (fetchedResult.success && fetchedResult.data) {
          setDictData(fetchedResult.data);
          if (fetchedResult.data.data.length === 0 && fetchedResult.data.currentPage > 1 && fetchedResult.data.currentPage > fetchedResult.data.totalPages) {
            const newTargetPage = fetchedResult.data.totalPages > 0 ? fetchedResult.data.totalPages : 1;
            const params = new URLSearchParams(searchParams.toString());
            params.set("page", String(newTargetPage));
            router.push(`${pathname}?${params.toString()}`);
            return;
          }
        } else {
          toast({ title: "获取数据错误", description: fetchedResult.error?.userMessage || "未能加载接入方式字典数据。", variant: "destructive" });
          setDictData({ data: [], totalCount: 0, currentPage: 1, totalPages: 0, pageSize: ITEMS_PER_PAGE });
        }
      } else {
        setDictData({ data: [], totalCount: 0, currentPage: 1, totalPages: 0, pageSize: ITEMS_PER_PAGE });
      }
    } catch (error) {
      toast({ title: "获取数据错误", description: (error as Error).message, variant: "destructive" });
      setDictData({ data: [], totalCount: 0, currentPage: 1, totalPages: 0, pageSize: ITEMS_PER_PAGE });
    } finally {
      setIsLoading(false);
      setSelectedIds(new Set());
    }
  }, [currentUser, isAuthLoading, toast, currentPage, router, pathname, searchParams]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

 const handleChangeSuccess = React.useCallback(async () => {
    const queryParams = { page: 1, pageSize: 1 };
    const paginationInfo = await getAccessTypeDictionariesAction(queryParams);
    if (paginationInfo.success && paginationInfo.data) {
        const newTotalPages = paginationInfo.data.totalPages;
        const targetPage = newTotalPages > 0 ? newTotalPages : 1;
        const currentUrlPage = Number(searchParams.get('page')) || 1;
         if (dictData && dictData.data.length === ITEMS_PER_PAGE && targetPage > currentUrlPage && dictData.totalCount % ITEMS_PER_PAGE === 0) {
            const params = new URLSearchParams(searchParams.toString());
            params.set("page", String(targetPage));
            router.push(`${pathname}?${params.toString()}`);
        } else {
           fetchData();
        }
    } else {
        fetchData();
    }
  }, [fetchData, router, pathname, searchParams, dictData]);


  const handleSelectAll = (checked: boolean | 'indeterminate') => {
    if (checked === true) setSelectedIds(new Set(dictData?.data.map(item => item.id) || []));
    else setSelectedIds(new Set());
  };

  const handleSelectItem = (id: string, checked: boolean | 'indeterminate') => {
    const newSelectedIds = new Set(selectedIds);
    if (checked === true) newSelectedIds.add(id);
    else newSelectedIds.delete(id);
    setSelectedIds(newSelectedIds);
  };

  if (isAuthLoading || (isLoading && !dictData)) return <LoadingPage />;
  if (!currentUser || !hasPermission(currentUser, PERMISSIONS.VIEW_DICTIONARY_ACCESS_TYPE)) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <ShieldAlert className="h-16 w-16 text-destructive mb-4" /><h2 className="text-2xl font-semibold mb-2">访问被拒绝</h2><p className="text-muted-foreground">您没有权限查看接入方式字典。</p>
      </div>
    );
  }

  const canCreate = hasPermission(currentUser, PERMISSIONS.CREATE_DICTIONARY_ACCESS_TYPE);
  const canEdit = hasPermission(currentUser, PERMISSIONS.EDIT_DICTIONARY_ACCESS_TYPE);
  const canDelete = hasPermission(currentUser, PERMISSIONS.DELETE_DICTIONARY_ACCESS_TYPE);

  const pageActionButtons = (
    <div className="flex flex-col sm:flex-row gap-2">
      {canDelete && selectedIds.size > 0 && <BatchDeleteConfirmationDialog selectedIds={selectedIds} itemTypeDisplayName="接入方式字典条目" batchDeleteAction={batchDeleteAccessTypeDictionariesAction} onBatchDeleted={fetchData} />}
      {canCreate && <AccessTypeDictionaryFormSheet onDataChange={handleChangeSuccess} buttonProps={{className: "w-full sm:w-auto"}}/>}
    </div>
  );
  
  const dataIsAvailable = !!(dictData && dictData.data && dictData.data.length > 0);
  const isAllOnPageSelected = dataIsAvailable ? dictData.data!.every(item => selectedIds.has(item.id)) : false;
  const isSomeOnPageSelected = dataIsAvailable ? dictData.data!.some(item => selectedIds.has(item.id)) : false;
  const itemsToDisplay = dictData?.data || [];
  const finalTotalCount = dictData?.totalCount || 0;
  const finalCurrentPage = dictData?.currentPage || 1;
  const finalTotalPages = dictData?.totalPages || 0;

  return (
    <>
      <PageHeader title="接入方式字典管理" description="管理网络接入方式类型。" icon={<Waypoints className="h-6 w-6 text-primary" />} actionElement={pageActionButtons} />
      <Card>
        <CardHeader><CardTitle>接入方式列表</CardTitle><CardDescription>显示 {itemsToDisplay.length} 条，共 {finalTotalCount} 条接入方式字典条目。</CardDescription></CardHeader>
        <CardContent>
          {dataIsAvailable ? (
            <>
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="w-[50px]">{canDelete && <Checkbox checked={isAllOnPageSelected ? true : (isSomeOnPageSelected ? 'indeterminate' : false)} onCheckedChange={handleSelectAll} aria-label="全选当前页"/>}</TableHead>
                  <TableHead>接入方式名称</TableHead>
                  {(canEdit || canDelete) && <TableHead className="text-right">操作</TableHead>}
                </TableRow></TableHeader>
                <TableBody>
                  {itemsToDisplay.map((item) => (
                    <TableRow key={item.id} data-state={selectedIds.has(item.id) ? "selected" : ""}>
                      <TableCell>{canDelete && <Checkbox checked={selectedIds.has(item.id)} onCheckedChange={(checked) => handleSelectItem(item.id, checked)} aria-label={`选择条目 ${item.name}`}/>}</TableCell>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      {(canEdit || canDelete) && (
                        <TableCell className="text-right">
                          {canEdit && <AccessTypeDictionaryFormSheet dictionaryEntry={item} onDataChange={fetchData}><Button variant="ghost" size="icon" aria-label="编辑条目"><Edit className="h-4 w-4" /></Button></AccessTypeDictionaryFormSheet>}
                          {canDelete && <DeleteConfirmationDialog itemId={item.id} itemName={item.name} deleteAction={deleteAccessTypeDictionaryAction} onDeleted={fetchData} triggerButton={<Button variant="ghost" size="icon" aria-label="删除条目"><Trash2 className="h-4 w-4" /></Button>} />}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {finalTotalPages > 1 && <PaginationControls currentPage={finalCurrentPage} totalPages={finalTotalPages} basePath={pathname} currentQuery={searchParams} />}
            </>
          ) : (
             <div className="text-center py-10">
              <p className="text-muted-foreground">未找到接入方式字典数据。</p>
              {canCreate && <AccessTypeDictionaryFormSheet onDataChange={handleChangeSuccess} buttonProps={{className: "mt-4"}}/>}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

export default function AccessTypeDictionaryPage() { return <Suspense fallback={<LoadingPage />}><AccessTypeDictionaryView /></Suspense>; }
