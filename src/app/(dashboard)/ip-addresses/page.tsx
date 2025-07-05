
"use client";

import * as React from "react";
import { Suspense } from 'react';
import { usePathname, useSearchParams } from "next/navigation";
import { Globe, Edit, Trash2, PlusCircle, Loader2, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import {
  getIPAddressesAction, getSubnetsAction, getVLANsAction, deleteIPAddressAction, batchDeleteIPAddressesAction,
  getDeviceDictionariesAction, getPaymentSourceDictionariesAction,
  getAccessTypeDictionariesAction, getInterfaceTypeDictionariesAction
} from "@/lib/actions";
import type { AppIPAddressWithRelations } from "@/lib/actions";
import type { IPAddressStatus, Subnet, VLAN, DeviceDictionary, PaymentSourceDictionary, AccessTypeDictionary, InterfaceTypeDictionary } from "@/types";
import { PERMISSIONS } from "@/types";
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog";
import { BatchDeleteConfirmationDialog } from "@/components/batch-delete-confirmation-dialog";
import { IPAddressFormSheet } from "./ip-address-form-sheet";
import { IPBatchFormSheet } from "./ip-batch-form-sheet";
import { IPSubnetFilter } from "./ip-subnet-filter";
import { IPStatusFilter } from "./ip-status-filter";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useToast } from "@/hooks/use-toast";
import { PaginationControls } from "@/components/pagination-controls";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useEntityManagement } from "@/hooks/use-entity-management";
import { useSelection } from "@/hooks/use-selection";

function LoadingIPAddressesPageContent() {
  return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
      <p className="ml-3 text-lg">加载IP地址数据中...</p>
    </div>
  );
}

function IPAddressesView() {
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const selectedSubnetId = searchParams.get("subnetId") || undefined;
  const selectedStatus = (searchParams.get("status") as IPAddressStatus | 'all') || 'all';

  const [subnets, setSubnets] = React.useState<Subnet[]>([]);
  const [vlans, setVlans] = React.useState<VLAN[]>([]);
  const [deviceDictionaries, setDeviceDictionaries] = React.useState<DeviceDictionary[]>([]);
  const [paymentSourceDictionaries, setPaymentSourceDictionaries] = React.useState<PaymentSourceDictionary[]>([]);
  const [accessTypeDictionaries, setAccessTypeDictionaries] = React.useState<AccessTypeDictionary[]>([]);
  const [interfaceTypes, setInterfaceTypes] = React.useState<InterfaceTypeDictionary[]>([]);
  
  const { toast } = useToast();
  const { currentUser } = useCurrentUser();

  const { data: ipAddressesData, isLoading, fetchData, canView, canCreate, canEdit, canDelete } = useEntityManagement<AppIPAddressWithRelations, any>({
    fetchAction: getIPAddressesAction,
    fetchActionParams: { subnetId: selectedSubnetId, status: selectedStatus },
    permission: {
      view: PERMISSIONS.VIEW_IPADDRESS,
      create: PERMISSIONS.CREATE_IPADDRESS,
      edit: PERMISSIONS.EDIT_IPADDRESS,
      delete: PERMISSIONS.DELETE_IPADDRESS,
    },
    dependencies: [selectedSubnetId, selectedStatus],
  });

  const ipsToDisplay = ipAddressesData?.data || [];
  const { selectedIds, setSelectedIds, handleSelectAll, handleSelectItem, checkboxState } = useSelection(ipsToDisplay);

  React.useEffect(() => {
    let isMounted = true;
    const fetchAuxiliaryData = async () => {
      try {
        if (!currentUser || !canView) return;
        const [
          fetchedSubnetsResult, fetchedVlansResult,
          fetchedDeviceDictResult, fetchedPaymentDictResult,
          fetchedAccessTypeDictResult, fetchedInterfaceTypesResult
        ] = await Promise.all([
          getSubnetsAction(), getVLANsAction(), getDeviceDictionariesAction(), getPaymentSourceDictionariesAction(), getAccessTypeDictionariesAction(), getInterfaceTypeDictionariesAction({ pageSize: 1000 }),
        ]);

        if (isMounted) {
          setSubnets(fetchedSubnetsResult.data);
          setVlans(fetchedVlansResult.data);
          setDeviceDictionaries(fetchedDeviceDictResult.data || []);
          setPaymentSourceDictionaries(fetchedPaymentDictResult.data || []);
          setAccessTypeDictionaries(fetchedAccessTypeDictResult.data || []);
          setInterfaceTypes(fetchedInterfaceTypesResult.data || []);
        }
      } catch (error) {
        toast({ title: "获取辅助数据错误", description: (error as Error).message, variant: "destructive" });
      }
    };
    fetchAuxiliaryData();
    return () => { isMounted = false; };
  }, [toast, currentUser, canView]);

  const onActionSuccess = () => {
    fetchData();
    setSelectedIds(new Set());
  };

  const getStatusBadgeVariant = (status: IPAddressStatus) => {
    switch (status) { case "allocated": return "default"; case "free": return "secondary"; case "reserved": return "outline"; default: return "secondary"; }
  };
  const ipAddressStatusLabels: Record<IPAddressStatus, string> = { allocated: "已分配", free: "空闲", reserved: "预留" };
  const currentSubnetName = selectedSubnetId ? subnets.find(s => s.id === selectedSubnetId)?.cidr : "所有子网";
  const getVlanDisplayForIp = (ip: AppIPAddressWithRelations): string => {
    if (ip.directVlan?.vlanNumber) return `VLAN ${ip.directVlan.vlanNumber}${ip.directVlan.name ? ` (${ip.directVlan.name})` : ''} (直接)`;
    if (ip.subnet?.vlan?.vlanNumber) return `VLAN ${ip.subnet.vlan.vlanNumber}${ip.subnet.vlan.name ? ` (${ip.subnet.vlan.name})` : ''} (继承)`;
    return "无";
  };

  if (isLoading) {
    return <LoadingIPAddressesPageContent />;
  }
  
  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Globe className="h-16 w-16 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2">访问被拒绝</h2>
        <p className="text-muted-foreground">您没有权限查看IP地址。</p>
      </div>
    );
  }

  const pageActionButtons = (
    <div className="flex flex-col sm:flex-row gap-2">
      {canDelete && selectedIds.size > 0 && <BatchDeleteConfirmationDialog selectedIds={selectedIds} itemTypeDisplayName="IP 地址" batchDeleteAction={batchDeleteIPAddressesAction} onBatchDeleted={onActionSuccess}/>}
      {canCreate && (
        <>
        <IPBatchFormSheet
            subnets={subnets} vlans={vlans}
            deviceDictionaries={deviceDictionaries}
            paymentSourceDictionaries={paymentSourceDictionaries} accessTypeDictionaries={accessTypeDictionaries}
            interfaceTypes={interfaceTypes}
            onIpAddressChange={onActionSuccess}>
          <Button variant="outline" className="w-full sm:w-auto"><PlusCircle className="mr-2 h-4 w-4" />批量添加IP</Button>
        </IPBatchFormSheet>
        <IPAddressFormSheet
            subnets={subnets} vlans={vlans}
            deviceDictionaries={deviceDictionaries}
            paymentSourceDictionaries={paymentSourceDictionaries} accessTypeDictionaries={accessTypeDictionaries}
            interfaceTypes={interfaceTypes}
            currentSubnetId={selectedSubnetId} onIpAddressChange={onActionSuccess} buttonProps={{className: "w-full sm:w-auto"}} />
        </>
      )}
    </div>
  );

  return (
    <TooltipProvider>
      <PageHeader title="IP 地址管理" description={`管理IP地址。当前查看: ${currentSubnetName || '所有子网'}`} icon={<Globe className="h-6 w-6 text-primary" />} />
      <div className="mb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex flex-col sm:flex-row gap-4"><IPSubnetFilter subnets={subnets} currentSubnetId={selectedSubnetId} /><IPStatusFilter currentStatus={selectedStatus} /></div>
        {pageActionButtons}
      </div>
      <Card>
        <CardHeader><CardTitle>IP 地址列表</CardTitle><CardDescription>
            {selectedSubnetId ? `子网 ${subnets.find(s => s.id === selectedSubnetId)?.cidr || ''} 内的IP地址` : "所有受管IP地址。"}
            {selectedStatus !== 'all' && ` (状态: ${ipAddressStatusLabels[selectedStatus as IPAddressStatus]})`} 显示 {ipsToDisplay.length} 条，共 {ipAddressesData?.totalCount || 0} 条IP。</CardDescription></CardHeader>
        <CardContent>
          {ipsToDisplay.length > 0 ? (
            <>
              <Table>
                <TableHeader><TableRow>
                    <TableHead className="w-[50px]">{canDelete && <Checkbox checked={checkboxState} onCheckedChange={handleSelectAll} aria-label="全选当前页"/>}</TableHead>
                    <TableHead>IP 地址</TableHead><TableHead>状态</TableHead><TableHead>网关?</TableHead>
                    <TableHead>分配给</TableHead><TableHead>使用单位</TableHead><TableHead>联系人</TableHead><TableHead>电话</TableHead>
                    <TableHead>对端单位</TableHead><TableHead>对端设备</TableHead><TableHead>对端端口</TableHead>
                    <TableHead>接入方式</TableHead>
                    <TableHead>本端设备</TableHead><TableHead>本端端口</TableHead><TableHead>费用来源</TableHead>
                    <TableHead>子网</TableHead><TableHead>VLAN</TableHead><TableHead>描述</TableHead>
                    <TableHead>最后更新</TableHead>
                    {(canEdit || canDelete) && <TableHead className="text-right">操作</TableHead>}
                </TableRow></TableHeader>
                <TableBody>
                  {ipsToDisplay.map((ip) => (
                    <TableRow key={ip.id} data-state={selectedIds.has(ip.id) ? "selected" : ""}>
                      <TableCell>{canDelete && <Checkbox checked={selectedIds.has(ip.id)} onCheckedChange={(checked) => handleSelectItem(ip.id, checked)} aria-label={`选择IP ${ip.ipAddress}`}/>}</TableCell>
                      <TableCell className="font-medium">{ip.ipAddress}</TableCell>
                      <TableCell><Badge variant={getStatusBadgeVariant(ip.status)} className="capitalize">{ipAddressStatusLabels[ip.status]}</Badge></TableCell>
                      <TableCell className="text-center">{ip.isGateway ? <CheckCircle className="h-5 w-5 text-green-500" /> : <XCircle className="h-5 w-5 text-muted-foreground" />}</TableCell>
                      <TableCell className="max-w-[100px] truncate">{ip.allocatedTo || "无"}</TableCell>
                      <TableCell className="max-w-[100px] truncate">{ip.usageUnit || "无"}</TableCell>
                      <TableCell className="max-w-[80px] truncate">{ip.contactPerson || "无"}</TableCell>
                      <TableCell className="max-w-[100px] truncate">{ip.phone || "无"}</TableCell>

                      <TableCell className="max-w-[100px] truncate">{ip.peerUnitName || "无"}</TableCell>
                      <TableCell className="max-w-[100px] truncate">{ip.peerDeviceName || "无"}</TableCell>
                      <TableCell className="max-w-[100px] truncate">{ip.peerPortName || "无"}</TableCell>

                      <TableCell className="max-w-[80px] truncate">{ip.selectedAccessType || "无"}</TableCell>
                      <TableCell className="max-w-[100px] truncate">{ip.selectedLocalDeviceName || "无"}</TableCell>
                      <TableCell className="max-w-[80px] truncate">{ip.selectedDevicePort || "无"}</TableCell>
                      <TableCell className="max-w-[100px] truncate">{ip.selectedPaymentSource || "无"}</TableCell>
                      <TableCell>{ip.subnet?.cidr || "无"}</TableCell>
                      <TableCell><Badge variant="outline">{getVlanDisplayForIp(ip)}</Badge></TableCell>
                      <TableCell className="max-w-[150px] truncate">
                        {ip.description ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-default">{ip.description}</span>
                            </TooltipTrigger>
                            <TooltipContent side="top" align="start">
                              <p className="max-w-xs whitespace-pre-wrap break-words">{ip.description}</p>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          "无"
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{ip.updatedAt ? new Date(ip.updatedAt).toLocaleString() : '未知'}</TableCell>
                      {(canEdit || canDelete) && (
                        <TableCell className="text-right whitespace-nowrap">
                          {canEdit && <IPAddressFormSheet ipAddress={ip} subnets={subnets} vlans={vlans} deviceDictionaries={deviceDictionaries} paymentSourceDictionaries={paymentSourceDictionaries} accessTypeDictionaries={accessTypeDictionaries} interfaceTypes={interfaceTypes} currentSubnetId={selectedSubnetId} onIpAddressChange={onActionSuccess}><Button variant="ghost" size="icon" aria-label="编辑IP地址"><Edit className="h-4 w-4" /></Button></IPAddressFormSheet>}
                          {canDelete && <DeleteConfirmationDialog itemId={ip.id} itemName={ip.ipAddress} deleteAction={deleteIPAddressAction} onDeleted={onActionSuccess} triggerButton={<Button variant="ghost" size="icon" aria-label="删除IP地址"><Trash2 className="h-4 w-4" /></Button>}/>}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {ipAddressesData && ipAddressesData.totalPages > 1 && <PaginationControls currentPage={ipAddressesData.currentPage} totalPages={ipAddressesData.totalPages} basePath={pathname} currentQuery={searchParams} />}
            </>
          ) : (
            <div className="text-center py-10">
              <p className="text-muted-foreground">{selectedSubnetId || selectedStatus !== 'all' ? "未找到符合当前筛选条件的IP地址。" : "未找到IP地址。选择一个子网或添加新的IP。"}</p>
              {canCreate && <IPAddressFormSheet subnets={subnets} vlans={vlans} deviceDictionaries={deviceDictionaries} paymentSourceDictionaries={paymentSourceDictionaries} accessTypeDictionaries={accessTypeDictionaries} interfaceTypes={interfaceTypes} currentSubnetId={selectedSubnetId} onIpAddressChange={onActionSuccess} buttonProps={{className: "mt-4"}} />}
            </div>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}

export default function IPAddressesPage() { return <Suspense fallback={<LoadingIPAddressesPageContent />}><IPAddressesView /></Suspense>; }
