
"use client";

import * as React from "react";
import { Suspense } from 'react';
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { HardDrive, Loader2, PlusCircle, Edit, Trash2, ShieldAlert } from "lucide-react";
import { useCurrentUser, hasPermission } from "@/hooks/use-current-user";
import { PERMISSIONS, type Device, type PaginatedResponse, DeviceType } from "@/types";
import { getDevicesAction, deleteDeviceAction, batchDeleteDevicesAction } from "@/lib/actions";
import { useToast } from "@/hooks/use-toast";
import { DeviceFormSheet } from "./device-form-sheet";
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog";
import { BatchDeleteConfirmationDialog } from "@/components/batch-delete-confirmation-dialog";
import { PaginationControls } from "@/components/pagination-controls";
import { Badge } from "@/components/ui/badge";

const ITEMS_PER_PAGE = 10;

const deviceTypeLabels: Record<DeviceType, string> = {
  [DeviceType.ROUTER]: "路由器",
  [DeviceType.SWITCH]: "交换机",
  [DeviceType.FIREWALL]: "防火墙",
  [DeviceType.SERVER]: "服务器",
  [DeviceType.ACCESS_POINT]: "无线AP",
  [DeviceType.OLT]: "OLT",
  [DeviceType.DDN_DEVICE]: "DDN设备",
  [DeviceType.OTHER]: "其他",
};

function LoadingDevicesPage() {
  return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
      <p className="ml-3 text-lg">加载设备管理页面...</p>
    </div>
  );
}

function DevicesView() {
  const [devicesData, setDevicesData] = React.useState<PaginatedResponse<Device> | null>(null);
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
      if (hasPermission(currentUser, PERMISSIONS.VIEW_DEVICE)) {
        const fetchedResult = await getDevicesAction({ page: currentPage, pageSize: ITEMS_PER_PAGE });
        if (fetchedResult.success && fetchedResult.data) {
          setDevicesData(fetchedResult.data);
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
          toast({ title: "获取设备错误", description: fetchedResult.error?.userMessage || "未能加载设备数据。", variant: "destructive" });
          setDevicesData({ data: [], totalCount: 0, currentPage: 1, totalPages: 0, pageSize: ITEMS_PER_PAGE });
        }
      } else {
        setDevicesData({ data: [], totalCount: 0, currentPage: 1, totalPages: 0, pageSize: ITEMS_PER_PAGE });
      }
    } catch (error) {
      toast({ title: "获取设备错误", description: (error as Error).message, variant: "destructive" });
      setDevicesData({ data: [], totalCount: 0, currentPage: 1, totalPages: 0, pageSize: ITEMS_PER_PAGE });
    } finally {
      setIsLoading(false);
      setSelectedIds(new Set());
    }
  }, [currentUser, isAuthLoading, toast, currentPage, router, pathname, searchParams]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);
  
  const handleDeviceChangeSuccess = React.useCallback(async () => {
    try {
      const paginationInfo = await getDevicesAction({ page: 1, pageSize: 1 });
      if (paginationInfo.success && paginationInfo.data) {
        const newTotalPages = paginationInfo.data.totalPages;
        const targetPage = newTotalPages > 0 ? newTotalPages : 1; 
        const currentUrlPage = Number(searchParams.get('page')) || 1;
        if (devicesData && devicesData.data.length === ITEMS_PER_PAGE && targetPage > currentUrlPage && devicesData.totalCount % ITEMS_PER_PAGE === 0) {
           const params = new URLSearchParams(searchParams.toString());
           params.set("page", String(targetPage));
           router.push(`${pathname}?${params.toString()}`);
        } else {
           fetchData(); 
        }
      } else {
          fetchData(); 
      }
    } catch (error) {
      toast({ title: "刷新错误", description: "无法导航到目标页面，正在刷新当前页面。", variant: "destructive" });
      fetchData();
    }
  }, [fetchData, router, pathname, searchParams, toast, devicesData]);


  const handleSelectAll = (checked: boolean | 'indeterminate') => {
    if (checked === true) {
      const allIdsOnPage = devicesData?.data.map(dev => dev.id) || [];
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

  if (isAuthLoading || (isLoading && !devicesData)) {
    return <LoadingDevicesPage />;
  }

  if (!currentUser || !hasPermission(currentUser, PERMISSIONS.VIEW_DEVICE)) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <ShieldAlert className="h-16 w-16 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2">访问被拒绝</h2>
        <p className="text-muted-foreground">您没有权限查看设备管理页面。</p>
      </div>
    );
  }

  const canCreate = hasPermission(currentUser, PERMISSIONS.CREATE_DEVICE);
  const canEdit = hasPermission(currentUser, PERMISSIONS.EDIT_DEVICE);
  const canDelete = hasPermission(currentUser, PERMISSIONS.DELETE_DEVICE);

  const pageActionButtons = (
    <div className="flex flex-col sm:flex-row gap-2">
      {canDelete && selectedIds.size > 0 && (
        <BatchDeleteConfirmationDialog
          selectedIds={selectedIds}
          itemTypeDisplayName="设备"
          batchDeleteAction={batchDeleteDevicesAction}
          onBatchDeleted={fetchData}
        />
      )}
      {canCreate && (
        <DeviceFormSheet onDeviceChange={handleDeviceChangeSuccess} buttonProps={{className: "w-full sm:w-auto"}}/>
      )}
    </div>
  );
  
  const dataIsAvailable = !!(devicesData && devicesData.data && devicesData.data.length > 0);
  const isAllOnPageSelected = dataIsAvailable ? devicesData.data!.every(dev => selectedIds.has(dev.id)) : false;
  const isSomeOnPageSelected = dataIsAvailable ? devicesData.data!.some(dev => selectedIds.has(dev.id)) : false;

  const devicesToDisplay = devicesData?.data || [];
  const finalTotalCount = devicesData?.totalCount || 0;
  const finalCurrentPage = devicesData?.currentPage || 1;
  const finalTotalPages = devicesData?.totalPages || 0;

  return (
    <>
      <PageHeader
        title="设备管理"
        description="管理网络设备信息，如路由器、交换机、服务器等。"
        icon={<HardDrive className="h-6 w-6 text-primary" />}
        actionElement={pageActionButtons}
      />
      <Card>
        <CardHeader>
          <CardTitle>设备列表</CardTitle>
          <CardDescription>查看和管理系统中的网络设备条目。显示 {devicesToDisplay.length} 条，共 {finalTotalCount} 条设备。</CardDescription>
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
                    <TableHead>类型</TableHead>
                    <TableHead>位置</TableHead>
                    <TableHead>管理 IP</TableHead>
                    <TableHead>品牌</TableHead>
                    <TableHead>型号</TableHead>
                    <TableHead>序列号</TableHead>
                    <TableHead>描述</TableHead>
                    {(canEdit || canDelete) && <TableHead className="text-right">操作</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {devicesToDisplay.map((device) => (
                    <TableRow key={device.id} data-state={selectedIds.has(device.id) ? "selected" : ""}>
                      <TableCell>
                        {canDelete && (
                           <Checkbox
                            checked={selectedIds.has(device.id)}
                            onCheckedChange={(checked) => handleSelectItem(device.id, checked)}
                            aria-label={`选择设备 ${device.name}`}
                          />
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{device.name}</TableCell>
                      <TableCell>
                        {device.deviceType ? <Badge variant="outline">{deviceTypeLabels[device.deviceType] || device.deviceType}</Badge> : "无"}
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate">{device.location || "无"}</TableCell>
                      <TableCell className="max-w-[120px] truncate">{device.managementIp || "无"}</TableCell>
                      <TableCell className="max-w-[100px] truncate">{device.brand || "无"}</TableCell>
                      <TableCell className="max-w-[100px] truncate">{device.modelNumber || "无"}</TableCell>
                      <TableCell className="max-w-[150px] truncate">{device.serialNumber || "无"}</TableCell>
                      <TableCell className="max-w-xs truncate">{device.description || "无"}</TableCell>
                      {(canEdit || canDelete) && (
                        <TableCell className="text-right">
                          {canEdit && (
                            <DeviceFormSheet device={device} onDeviceChange={fetchData}>
                              <Button variant="ghost" size="icon" aria-label="编辑设备">
                                <Edit className="h-4 w-4" />
                              </Button>
                            </DeviceFormSheet>
                          )}
                          {canDelete && (
                            <DeleteConfirmationDialog
                              itemId={device.id}
                              itemName={device.name}
                              deleteAction={deleteDeviceAction}
                              onDeleted={fetchData}
                              triggerButton={
                                <Button variant="ghost" size="icon" aria-label="删除设备">
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
              <p className="text-muted-foreground">未找到设备数据。</p>
              {canCreate && <DeviceFormSheet onDeviceChange={handleDeviceChangeSuccess} buttonProps={{className: "mt-4"}}/>}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

export default function DeviceManagementPage() {
  return (
    <Suspense fallback={<LoadingDevicesPage />}>
      <DevicesView />
    </Suspense>
  );
}
      
