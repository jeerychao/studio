
"use client";

import * as React from "react";
import { Suspense } from 'react';
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Globe, Edit, Trash2, PlusCircle, Loader2, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { 
  getIPAddressesAction, getSubnetsAction, getVLANsAction, deleteIPAddressAction, batchDeleteIPAddressesAction,
  getOperatorDictionariesAction, getLocalDeviceDictionariesAction, getPaymentSourceDictionariesAction,
  getAccessTypeDictionariesAction // Import new action
} from "@/lib/actions";
import type { AppIPAddressWithRelations } from "@/lib/actions";
import type { IPAddressStatus, Subnet, VLAN, PaginatedResponse, OperatorDictionary, LocalDeviceDictionary, PaymentSourceDictionary, AccessTypeDictionary } from "@/types"; // Import AccessTypeDictionary
import { PERMISSIONS } from "@/types";
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog";
import { BatchDeleteConfirmationDialog } from "@/components/batch-delete-confirmation-dialog";
import { IPAddressFormSheet } from "./ip-address-form-sheet";
import { IPBatchFormSheet } from "./ip-batch-form-sheet";
import { IPSubnetFilter } from "./ip-subnet-filter";
import { IPStatusFilter } from "./ip-status-filter";
import { useCurrentUser, hasPermission } from "@/hooks/use-current-user";
import { useToast } from "@/hooks/use-toast";
import { PaginationControls } from "@/components/pagination-controls";

const ITEMS_PER_PAGE = 10;

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
  const router = useRouter();
  const pathname = usePathname();

  const selectedSubnetId = searchParams.get("subnetId") || undefined;
  const selectedStatus = searchParams.get("status") as IPAddressStatus | 'all' || 'all';
  const currentPage = Number(searchParams.get('page')) || 1;

  const [ipAddressesData, setIpAddressesData] = React.useState<PaginatedResponse<AppIPAddressWithRelations> | null>(null);
  const [subnets, setSubnets] = React.useState<Subnet[]>([]);
  const [vlans, setVlans] = React.useState<VLAN[]>([]);
  const [operatorDictionaries, setOperatorDictionaries] = React.useState<OperatorDictionary[]>([]);
  const [localDeviceDictionaries, setLocalDeviceDictionaries] = React.useState<LocalDeviceDictionary[]>([]);
  const [paymentSourceDictionaries, setPaymentSourceDictionaries] = React.useState<PaymentSourceDictionary[]>([]);
  const [accessTypeDictionaries, setAccessTypeDictionaries] = React.useState<AccessTypeDictionary[]>([]); // New state
  const [isLoading, setIsLoading] = React.useState(true);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());

  const { currentUser, isAuthLoading } = useCurrentUser();
  const { toast } = useToast();

  const fetchData = React.useCallback(async () => {
    if (isAuthLoading || !currentUser) return;
    setIsLoading(true);
    try {
      if (!hasPermission(currentUser, PERMISSIONS.VIEW_IPADDRESS)) {
        setIpAddressesData({ data: [], totalCount: 0, currentPage: 1, totalPages: 0, pageSize: ITEMS_PER_PAGE });
        setSubnets([]); setVlans([]); setOperatorDictionaries([]); setLocalDeviceDictionaries([]); setPaymentSourceDictionaries([]); setAccessTypeDictionaries([]);
        setIsLoading(false);
        return;
      }
      const [
        fetchedIpsResult, fetchedSubnetsResult, fetchedVlansResult, 
        fetchedOpsDictResult, fetchedLocalDictResult, fetchedPaymentDictResult,
        fetchedAccessTypeDictResult // Fetch new dictionary
      ] = await Promise.all([
        getIPAddressesAction({ subnetId: selectedSubnetId, status: selectedStatus, page: currentPage, pageSize: ITEMS_PER_PAGE }),
        getSubnetsAction(),
        getVLANsAction(),
        getOperatorDictionariesAction(), 
        getLocalDeviceDictionariesAction(), 
        getPaymentSourceDictionariesAction(), 
        getAccessTypeDictionariesAction(), // Call new action
      ]);

      setIpAddressesData(fetchedIpsResult);
      setSubnets(fetchedSubnetsResult.data);
      setVlans(fetchedVlansResult.data);
      if (fetchedOpsDictResult.success) setOperatorDictionaries(fetchedOpsDictResult.data?.data || []); else setOperatorDictionaries([]);
      if (fetchedLocalDictResult.success) setLocalDeviceDictionaries(fetchedLocalDictResult.data?.data || []); else setLocalDeviceDictionaries([]);
      if (fetchedPaymentDictResult.success) setPaymentSourceDictionaries(fetchedPaymentDictResult.data?.data || []); else setPaymentSourceDictionaries([]);
      if (fetchedAccessTypeDictResult.success) setAccessTypeDictionaries(fetchedAccessTypeDictResult.data?.data || []); else setAccessTypeDictionaries([]); // Set new dictionary state
      
      if (fetchedIpsResult.data.length === 0 && fetchedIpsResult.currentPage > 1) {
        const newTargetPage = fetchedIpsResult.totalPages > 0 ? fetchedIpsResult.totalPages : 1;
        const currentUrlPage = Number(searchParams.get('page')) || 1;
        if (currentUrlPage !== newTargetPage && currentUrlPage > fetchedIpsResult.totalPages) {
            const params = new URLSearchParams(searchParams.toString());
            if (selectedSubnetId) params.set("subnetId", selectedSubnetId); else params.delete("subnetId");
            if (selectedStatus && selectedStatus !== 'all') params.set("status", selectedStatus); else params.delete("status");
            params.set("page", String(newTargetPage));
            router.push(`${pathname}?${params.toString()}`);
            return;
        }
      }

    } catch (error) {
      toast({ title: "获取数据错误", description: (error as Error).message, variant: "destructive" });
      setIpAddressesData({ data: [], totalCount: 0, currentPage: 1, totalPages: 0, pageSize: ITEMS_PER_PAGE });
    } finally {
      setIsLoading(false);
      setSelectedIds(new Set());
    }
  }, [currentUser, isAuthLoading, toast, selectedSubnetId, selectedStatus, currentPage, router, pathname, searchParams]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleIpAddressChangeSuccess = React.useCallback(async () => {
    try {
      const paginationInfo = await getIPAddressesAction({
        page: 1, pageSize: 1, subnetId: selectedSubnetId, status: selectedStatus,
      });
      const newTotalPages = paginationInfo.totalPages;
      const targetPage = newTotalPages > 0 ? newTotalPages : 1;
      const currentUrlPage = Number(searchParams.get('page')) || 1;

      if (targetPage !== currentUrlPage || (ipAddressesData && ipAddressesData.data.length === ITEMS_PER_PAGE && targetPage > currentUrlPage)) {
        const params = new URLSearchParams(searchParams.toString());
        if (selectedSubnetId) params.set("subnetId", selectedSubnetId); else params.delete("subnetId");
        if (selectedStatus && selectedStatus !== 'all') params.set("status", selectedStatus); else params.delete("status");
        params.set("page", String(targetPage));
        router.push(`${pathname}?${params.toString()}`);
      } else {
        fetchData();
      }
    } catch (error) {
      toast({ title: "刷新错误", description: "操作后无法导航到目标页面，正在刷新当前页面。", variant: "destructive" });
      fetchData();
    }
  }, [fetchData, router, pathname, searchParams, toast, selectedSubnetId, selectedStatus, ipAddressesData]);

  const handleSelectAll = (checked: boolean | 'indeterminate') => {
    if (checked === true) setSelectedIds(new Set(ipAddressesData?.data.map(ip => ip.id) || []));
    else setSelectedIds(new Set());
  };

  const handleSelectItem = (id: string, checked: boolean | 'indeterminate') => {
    const newSelectedIds = new Set(selectedIds);
    if (checked === true) newSelectedIds.add(id); else newSelectedIds.delete(id);
    setSelectedIds(newSelectedIds);
  };

  if (isAuthLoading || isLoading && !ipAddressesData) return <LoadingIPAddressesPageContent />;
  if (!currentUser || !hasPermission(currentUser, PERMISSIONS.VIEW_IPADDRESS)) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Globe className="h-16 w-16 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2">访问被拒绝</h2>
        <p className="text-muted-foreground">您没有权限查看IP地址。</p>
      </div>
    );
  }

  const canCreate = hasPermission(currentUser, PERMISSIONS.CREATE_IPADDRESS);
  const canEdit = hasPermission(currentUser, PERMISSIONS.EDIT_IPADDRESS);
  const canDelete = hasPermission(currentUser, PERMISSIONS.DELETE_IPADDRESS);

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

  const pageActionButtons = (
    <div className="flex flex-col sm:flex-row gap-2">
      {canDelete && selectedIds.size > 0 && <BatchDeleteConfirmationDialog selectedIds={selectedIds} itemTypeDisplayName="IP 地址" batchDeleteAction={batchDeleteIPAddressesAction} onBatchDeleted={fetchData}/>}
      {canCreate && (
        <>
        <IPBatchFormSheet 
            subnets={subnets} vlans={vlans} 
            operatorDictionaries={operatorDictionaries} localDeviceDictionaries={localDeviceDictionaries} 
            paymentSourceDictionaries={paymentSourceDictionaries} accessTypeDictionaries={accessTypeDictionaries}
            onIpAddressChange={handleIpAddressChangeSuccess}>
          <Button variant="outline" className="w-full sm:w-auto"><PlusCircle className="mr-2 h-4 w-4" />批量添加IP</Button>
        </IPBatchFormSheet>
        <IPAddressFormSheet 
            subnets={subnets} vlans={vlans} 
            operatorDictionaries={operatorDictionaries} localDeviceDictionaries={localDeviceDictionaries} 
            paymentSourceDictionaries={paymentSourceDictionaries} accessTypeDictionaries={accessTypeDictionaries}
            currentSubnetId={selectedSubnetId} onIpAddressChange={handleIpAddressChangeSuccess} buttonProps={{className: "w-full sm:w-auto"}} />
        </>
      )}
    </div>
  );

  const dataIsAvailable = !!(ipAddressesData && ipAddressesData.data && ipAddressesData.data.length > 0);
  const isAllOnPageSelected = dataIsAvailable ? ipAddressesData.data!.every(ip => selectedIds.has(ip.id)) : false;
  const isSomeOnPageSelected = dataIsAvailable ? ipAddressesData.data!.some(ip => selectedIds.has(ip.id)) : false;
  const finalCurrentPage = ipAddressesData?.currentPage || 1;
  const finalTotalPages = ipAddressesData?.totalPages || 0;
  const finalTotalCount = ipAddressesData?.totalCount || 0;
  const ipsToDisplay = ipAddressesData?.data || [];

  return (
    <>
      <PageHeader title="IP 地址管理" description={`管理IP地址。当前查看: ${currentSubnetName || '所有子网'}`} icon={<Globe className="h-6 w-6 text-primary" />} />
      <div className="mb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex flex-col sm:flex-row gap-4"><IPSubnetFilter subnets={subnets} currentSubnetId={selectedSubnetId} /><IPStatusFilter currentStatus={selectedStatus} /></div>
        {pageActionButtons}
      </div>
      <Card>
        <CardHeader><CardTitle>IP 地址列表</CardTitle><CardDescription>
            {selectedSubnetId ? `子网 ${subnets.find(s => s.id === selectedSubnetId)?.cidr || ''} 内的IP地址` : "所有受管IP地址。"}
            {selectedStatus !== 'all' && ` (状态: ${ipAddressStatusLabels[selectedStatus as IPAddressStatus]})`} 显示 {ipsToDisplay.length} 条，共 {finalTotalCount} 条IP。</CardDescription></CardHeader>
        <CardContent>
          {dataIsAvailable ? (
            <>
              <Table>
                <TableHeader><TableRow>
                    <TableHead className="w-[50px]">{canDelete && <Checkbox checked={isAllOnPageSelected ? true : (isSomeOnPageSelected ? 'indeterminate' : false)} onCheckedChange={handleSelectAll} aria-label="全选当前页"/>}</TableHead>
                    <TableHead>IP 地址</TableHead><TableHead>状态</TableHead><TableHead>网关?</TableHead>
                    <TableHead>分配给</TableHead><TableHead>使用单位</TableHead><TableHead>联系人</TableHead><TableHead>电话</TableHead>
                    <TableHead>运营商名称</TableHead><TableHead>运营商设备</TableHead><TableHead>接入方式</TableHead>
                    <TableHead>本端设备</TableHead><TableHead>设备端口</TableHead><TableHead>费用来源</TableHead>
                    <TableHead>子网</TableHead><TableHead>VLAN</TableHead><TableHead>描述</TableHead>
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
                      <TableCell className="max-w-[100px] truncate">{ip.selectedOperatorName || "无"}</TableCell>
                      <TableCell className="max-w-[100px] truncate">{ip.selectedOperatorDevice || "无"}</TableCell>
                      <TableCell className="max-w-[80px] truncate">{ip.selectedAccessType || "无"}</TableCell>
                      <TableCell className="max-w-[100px] truncate">{ip.selectedLocalDeviceName || "无"}</TableCell>
                      <TableCell className="max-w-[80px] truncate">{ip.selectedDevicePort || "无"}</TableCell>
                      <TableCell className="max-w-[100px] truncate">{ip.selectedPaymentSource || "无"}</TableCell>
                      <TableCell>{ip.subnet?.cidr || "无"}</TableCell>
                      <TableCell><Badge variant="outline">{getVlanDisplayForIp(ip)}</Badge></TableCell>
                      <TableCell className="max-w-[150px] truncate">{ip.description || "无"}</TableCell>
                      {(canEdit || canDelete) && (
                        <TableCell className="text-right whitespace-nowrap">
                          {canEdit && <IPAddressFormSheet ipAddress={ip} subnets={subnets} vlans={vlans} operatorDictionaries={operatorDictionaries} localDeviceDictionaries={localDeviceDictionaries} paymentSourceDictionaries={paymentSourceDictionaries} accessTypeDictionaries={accessTypeDictionaries} currentSubnetId={selectedSubnetId} onIpAddressChange={fetchData}><Button variant="ghost" size="icon" aria-label="编辑IP地址"><Edit className="h-4 w-4" /></Button></IPAddressFormSheet>}
                          {canDelete && <DeleteConfirmationDialog itemId={ip.id} itemName={ip.ipAddress} deleteAction={deleteIPAddressAction} onDeleted={fetchData} triggerButton={<Button variant="ghost" size="icon" aria-label="删除IP地址"><Trash2 className="h-4 w-4" /></Button>}/>}
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
              <p className="text-muted-foreground">{selectedSubnetId || selectedStatus !== 'all' ? "未找到符合当前筛选条件的IP地址。" : "未找到IP地址。选择一个子网或添加新的IP。"}</p>
              {canCreate && <IPAddressFormSheet subnets={subnets} vlans={vlans} operatorDictionaries={operatorDictionaries} localDeviceDictionaries={localDeviceDictionaries} paymentSourceDictionaries={paymentSourceDictionaries} accessTypeDictionaries={accessTypeDictionaries} currentSubnetId={selectedSubnetId} onIpAddressChange={handleIpAddressChangeSuccess} buttonProps={{className: "mt-4"}} />}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

export default function IPAddressesPage() { return <Suspense fallback={<LoadingIPAddressesPageContent />}><IPAddressesView /></Suspense>; }
