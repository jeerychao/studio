
"use client";

import * as React from "react";
import { Suspense } from 'react';
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, AlertCircle, Loader2, Info, CheckCircle, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser, hasPermission } from "@/hooks/use-current-user";
import { PERMISSIONS, type PaginatedResponse, type SubnetFreeIpDetails, type IPAddressStatus as AppIPAddressStatusType } from "@/types";
import type { SubnetQueryResult, VlanQueryResult } from "@/types";
import type { AppIPAddressWithRelations } from "@/lib/actions";
import { querySubnetsAction, queryVlansAction, queryIpAddressesAction, getSubnetFreeIpDetailsAction } from "@/lib/actions";
import { PaginationControls } from "@/components/pagination-controls";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DEFAULT_QUERY_PAGE_SIZE } from "@/lib/constants";

const DEBOUNCE_DELAY = 500;

const ipAddressStatusQueryOptions: Array<{ value: AppIPAddressStatusType | 'all'; label: string }> = [
  { value: "all", label: "全部状态" },
  { value: "allocated", label: "已分配" },
  { value: "free", label: "空闲" },
  { value: "reserved", label: "预留" },
];
const ipAddressStatusDisplayLabels: Record<AppIPAddressStatusType, string> = { allocated: "已分配", free: "空闲", reserved: "预留" };


function LoadingSpinner({ message = "正在查询..." }: { message?: string }) {
  return (
    <div className="flex items-center justify-center py-10">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="ml-2 text-muted-foreground">{message}</p>
    </div>
  );
}

function NoResultsFound() {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <Search className="h-12 w-12 text-muted-foreground mb-3" />
      <p className="text-muted-foreground">未找到符合条件的结果。</p>
      <p className="text-xs text-muted-foreground">请尝试更改您的搜索词或条件。</p>
    </div>
  );
}

function QueryErrorDisplay({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center text-destructive">
      <AlertCircle className="h-12 w-12 mb-3" />
      <p className="font-semibold">查询出错</p>
      <p className="text-xs">{message || "无法获取查询结果，请稍后再试。"}</p>
    </div>
  );
}


function QueryPageContent() {
  const { toast } = useToast();
  const { currentUser, isAuthLoading } = useCurrentUser();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeTab = searchParams.get('tab') || 'subnet';

  const [subnetQuery, setSubnetQuery] = React.useState(activeTab === 'subnet' ? (searchParams.get('q_subnet') || '') : '');
  const [debouncedSubnetQuery, setDebouncedSubnetQuery] = React.useState(subnetQuery);
  const [subnetResultsData, setSubnetResultsData] = React.useState<PaginatedResponse<SubnetQueryResult> | null>(null);
  const [isSubnetLoading, setIsSubnetLoading] = React.useState(false);
  const [subnetError, setSubnetError] = React.useState<string | null>(null);
  const [currentSubnetPage, setCurrentSubnetPage] = React.useState(activeTab === 'subnet' ? (Number(searchParams.get('page')) || 1) : 1);

  const [isSubnetDetailsSheetOpen, setIsSubnetDetailsSheetOpen] = React.useState(false);
  const [selectedSubnetForSheet, setSelectedSubnetForSheet] = React.useState<SubnetQueryResult | null>(null);
  const [selectedSubnetFreeIpDetails, setSelectedSubnetFreeIpDetails] = React.useState<SubnetFreeIpDetails | null>(null);
  const [isSubnetDetailsLoading, setIsSubnetDetailsLoading] = React.useState(false);
  const [subnetDetailsError, setSubnetDetailsError] = React.useState<string | null>(null);

  const [vlanQuery, setVlanQuery] = React.useState(activeTab === 'vlan' ? (searchParams.get('q_vlan') || '') : '');
  const [debouncedVlanQuery, setDebouncedVlanQuery] = React.useState(vlanQuery);
  const [vlanResultsData, setVlanResultsData] = React.useState<PaginatedResponse<VlanQueryResult> | null>(null);
  const [isVlanLoading, setIsVlanLoading] = React.useState(false);
  const [vlanError, setVlanError] = React.useState<string | null>(null);
  const [currentVlanPage, setCurrentVlanPage] = React.useState(activeTab === 'vlan' ? (Number(searchParams.get('page')) || 1) : 1);
  const [selectedVlanDetails, setSelectedVlanDetails] = React.useState<VlanQueryResult | null>(null);

  const [ipQuery, setIpQuery] = React.useState(activeTab === 'ip_address' ? (searchParams.get('q_ip') || '') : '');
  const [ipQueryStatus, setIpQueryStatus] = React.useState<AppIPAddressStatusType | 'all'>(
    (activeTab === 'ip_address' ? searchParams.get('status') as (AppIPAddressStatusType | 'all') : null) || 'all'
  );
  const [debouncedIpQuery, setDebouncedIpQuery] = React.useState(ipQuery);
  const [debouncedIpQueryStatus, setDebouncedIpQueryStatus] = React.useState(ipQueryStatus);

  const [ipResultsData, setIpResultsData] = React.useState<PaginatedResponse<AppIPAddressWithRelations> | null>(null);
  const [isIpLoading, setIsIpLoading] = React.useState(false);
  const [ipError, setIpError] = React.useState<string | null>(null);
  const [currentIpPage, setCurrentIpPage] = React.useState(activeTab === 'ip_address' ? (Number(searchParams.get('page')) || 1) : 1);

  const [isIpDetailsSheetOpen, setIsIpDetailsSheetOpen] = React.useState(false);
  const [selectedIpDetails, setSelectedIpDetails] = React.useState<AppIPAddressWithRelations | null>(null);

  React.useEffect(() => { const handler = setTimeout(() => setDebouncedSubnetQuery(subnetQuery), DEBOUNCE_DELAY); return () => clearTimeout(handler); }, [subnetQuery]);
  React.useEffect(() => { const handler = setTimeout(() => setDebouncedVlanQuery(vlanQuery), DEBOUNCE_DELAY); return () => clearTimeout(handler); }, [vlanQuery]);
  React.useEffect(() => { const handler = setTimeout(() => { setDebouncedIpQuery(ipQuery); setDebouncedIpQueryStatus(ipQueryStatus); }, DEBOUNCE_DELAY); return () => clearTimeout(handler); }, [ipQuery, ipQueryStatus]);

  const fetchSubnetData = React.useCallback(async (page = 1, queryToUse = debouncedSubnetQuery) => {
    const trimmedQuery = queryToUse.trim();
    if (!trimmedQuery) { setSubnetResultsData(null); setSubnetError(null); setIsSubnetLoading(false); return; }
    setIsSubnetLoading(true); setSubnetError(null);
    try {
      const response = await querySubnetsAction({ queryString: trimmedQuery, page, pageSize: DEFAULT_QUERY_PAGE_SIZE });
      if (response.success && response.data) setSubnetResultsData(response.data);
      else { setSubnetResultsData(null); setSubnetError(response.error?.userMessage || "查询子网失败"); toast({ title: "子网查询失败", description: response.error?.userMessage, variant: "destructive" });}
    } catch (e: unknown) {
      setSubnetResultsData(null);
      setSubnetError("查询子网时发生意外错误。");
      const errorMessage = e instanceof Error ? e.message : "未知错误";
      toast({ title: "子网查询错误", description: errorMessage, variant: "destructive" });
    }
    finally { setIsSubnetLoading(false); }
  }, [toast, debouncedSubnetQuery]);

  const fetchVlanData = React.useCallback(async (page = 1, queryToUse = debouncedVlanQuery) => {
    const trimmedQuery = queryToUse.trim();
    if (!trimmedQuery) { setVlanResultsData(null); setVlanError(null); setIsVlanLoading(false); return; }
    setIsVlanLoading(true); setVlanError(null);
    try {
      const response = await queryVlansAction({ queryString: trimmedQuery, page, pageSize: DEFAULT_QUERY_PAGE_SIZE });
      if (response.success && response.data) setVlanResultsData(response.data);
      else { setVlanResultsData(null); setVlanError(response.error?.userMessage || "查询VLAN失败"); toast({ title: "VLAN查询失败", description: response.error?.userMessage, variant: "destructive" });}
    } catch (e: unknown) {
      setVlanResultsData(null);
      setVlanError("查询VLAN时发生意外错误。");
      const errorMessage = e instanceof Error ? e.message : "未知错误";
      toast({ title: "VLAN查询错误", description: errorMessage, variant: "destructive" });
    }
    finally { setIsVlanLoading(false); }
  }, [toast, debouncedVlanQuery]);

  const fetchIpData = React.useCallback(async (page = 1, queryToUse = debouncedIpQuery, statusToUse = debouncedIpQueryStatus) => {
    const trimmedQuery = queryToUse.trim();
    if (!trimmedQuery && statusToUse === 'all') { setIpResultsData(null); setIpError(null); setIsIpLoading(false); return; }
    setIsIpLoading(true); setIpError(null);
    try {
      const response = await queryIpAddressesAction({ searchTerm: trimmedQuery, status: statusToUse, page, pageSize: DEFAULT_QUERY_PAGE_SIZE });
      if (response.success && response.data) setIpResultsData(response.data);
      else { setIpResultsData(null); setIpError(response.error?.userMessage || "查询IP失败"); toast({ title: "IP查询失败", description: response.error?.userMessage, variant: "destructive" });}
    } catch (e: unknown) {
      setIpResultsData(null);
      setIpError("查询IP时发生意外错误。");
      const errorMessage = e instanceof Error ? e.message : "未知错误";
      toast({ title: "IP查询错误", description: errorMessage, variant: "destructive" });
    }
    finally { setIsIpLoading(false); }
  }, [toast, debouncedIpQuery, debouncedIpQueryStatus]);

  React.useEffect(() => { if (activeTab === 'subnet') { if (debouncedSubnetQuery.trim()) fetchSubnetData(currentSubnetPage, debouncedSubnetQuery); else { setSubnetResultsData(null); setSubnetError(null); } } }, [currentSubnetPage, debouncedSubnetQuery, fetchSubnetData, activeTab]);
  React.useEffect(() => { if (activeTab === 'vlan') { if (debouncedVlanQuery.trim()) fetchVlanData(currentVlanPage, debouncedVlanQuery); else { setVlanResultsData(null); setVlanError(null); } } }, [currentVlanPage, debouncedVlanQuery, fetchVlanData, activeTab]);
  React.useEffect(() => { if (activeTab === 'ip_address') { if (debouncedIpQuery.trim() || debouncedIpQueryStatus !== 'all') fetchIpData(currentIpPage, debouncedIpQuery, debouncedIpQueryStatus); else { setIpResultsData(null); setIpError(null); } } }, [currentIpPage, debouncedIpQuery, debouncedIpQueryStatus, fetchIpData, activeTab]);

  const handleSubnetQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => { const newValue = e.target.value; setSubnetQuery(newValue); if (newValue.trim() !== debouncedSubnetQuery.trim()) { setCurrentSubnetPage(1); router.push(`${pathname}?tab=subnet&q_subnet=${encodeURIComponent(newValue)}&page=1`); } else if (!newValue.trim()) { router.push(`${pathname}?tab=subnet`); }};
  const handleVlanQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => { const newValue = e.target.value; setVlanQuery(newValue); if (newValue.trim() !== debouncedVlanQuery.trim()) { setCurrentVlanPage(1); router.push(`${pathname}?tab=vlan&q_vlan=${encodeURIComponent(newValue)}&page=1`); } else if (!newValue.trim()) { router.push(`${pathname}?tab=vlan`); }};
  const handleIpQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => { const newValue = e.target.value; setIpQuery(newValue); if (newValue.trim() !== debouncedIpQuery.trim() || ipQueryStatus !== debouncedIpQueryStatus) { setCurrentIpPage(1); router.push(`${pathname}?tab=ip_address&q_ip=${encodeURIComponent(newValue)}&status=${ipQueryStatus}&page=1`); } else if (!newValue.trim() && ipQueryStatus === 'all') { router.push(`${pathname}?tab=ip_address`); }};
  const handleIpStatusChange = (statusValue: AppIPAddressStatusType | 'all') => { setIpQueryStatus(statusValue); setCurrentIpPage(1); router.push(`${pathname}?tab=ip_address&q_ip=${encodeURIComponent(ipQuery)}&status=${statusValue}&page=1`); };

  const handleTabChange = (newTab: string) => {
    router.push(`${pathname}?tab=${newTab}`);
    if (newTab !== 'subnet') { setSubnetQuery(''); setSubnetResultsData(null); setCurrentSubnetPage(1); setSelectedSubnetForSheet(null); setSelectedSubnetFreeIpDetails(null); }
    if (newTab !== 'vlan') { setVlanQuery(''); setVlanResultsData(null); setCurrentVlanPage(1); setSelectedVlanDetails(null); }
    if (newTab !== 'ip_address') { setIpQuery(''); setIpQueryStatus('all'); setIpResultsData(null); setCurrentIpPage(1); setSelectedIpDetails(null); }
  };

  const handleSubnetQuerySubmitButton = () => { setDebouncedSubnetQuery(subnetQuery); setCurrentSubnetPage(1); router.push(`${pathname}?tab=subnet&q_subnet=${encodeURIComponent(subnetQuery)}&page=1`); };
  const handleVlanQuerySubmitButton = () => { setDebouncedVlanQuery(vlanQuery); setCurrentVlanPage(1); router.push(`${pathname}?tab=vlan&q_vlan=${encodeURIComponent(vlanQuery)}&page=1`);};
  const handleIpQuerySubmitButton = () => { setDebouncedIpQuery(ipQuery); setDebouncedIpQueryStatus(ipQueryStatus); setCurrentIpPage(1); router.push(`${pathname}?tab=ip_address&q_ip=${encodeURIComponent(ipQuery)}&status=${ipQueryStatus}&page=1`);};

  const handleSubnetRowClick = async (subnetResult: SubnetQueryResult) => {
    setSelectedSubnetForSheet(subnetResult);
    setSelectedVlanDetails(null);
    setIsSubnetDetailsLoading(true);
    setSubnetDetailsError(null);
    setSelectedSubnetFreeIpDetails(null);
    try {
      const response = await getSubnetFreeIpDetailsAction(subnetResult.id);
      if (response.success && response.data) {
        setSelectedSubnetFreeIpDetails(response.data);
      } else {
        setSubnetDetailsError(response.error?.userMessage || "获取子网可用IP详情失败。");
        toast({ title: "获取详情失败", description: response.error?.userMessage, variant: "destructive" });
      }
    } catch (e: unknown) {
      setSubnetDetailsError("获取子网可用IP详情时发生意外错误。");
      const errorMessage = e instanceof Error ? e.message : "未知错误";
      toast({ title: "获取详情错误", description: errorMessage, variant: "destructive" });
    } finally {
      setIsSubnetDetailsLoading(false);
      setIsSubnetDetailsSheetOpen(true);
    }
  };

  const handleVlanRowClick = (vlan: VlanQueryResult) => {
    setSelectedSubnetForSheet(null);
    setSelectedSubnetFreeIpDetails(null);
    setSelectedVlanDetails(vlan);
    setSubnetDetailsError(null);
    setIsSubnetDetailsLoading(false);
    setIsSubnetDetailsSheetOpen(true);
  };

  const handleIpRowClick = (ip: AppIPAddressWithRelations) => { setSelectedIpDetails(ip); setIsIpDetailsSheetOpen(true); };

  const getStatusBadgeVariant = (status: AppIPAddressStatusType) => {
    switch (status) { case "allocated": return "default"; case "free": return "secondary"; case "reserved": return "outline"; default: return "secondary"; }
  };

  if (isAuthLoading) return <div className="flex flex-col items-center justify-center h-full"><Loader2 className="h-16 w-16 animate-spin text-primary mb-4" /><h2 className="text-2xl font-semibold mb-2">加载查询工具...</h2></div>;
  if (!currentUser || !hasPermission(currentUser, PERMISSIONS.VIEW_QUERY_PAGE)) return <div className="flex flex-col items-center justify-center h-full"><Search className="h-16 w-16 text-destructive mb-4" /><h2 className="text-2xl font-semibold mb-2">访问被拒绝</h2><p className="text-muted-foreground">您没有权限查看信息查询页面。</p></div>;

  const createPaginationQueryString = (baseParams: Record<string, string>): string => {
    const current = new URLSearchParams(searchParams);
    Object.entries(baseParams).forEach(([key, value]) => {
      if (value) current.set(key, value); else current.delete(key);
    });
    return current.toString();
  };

  const getIpDetails = (ip: AppIPAddressWithRelations | null) => {
    if (!ip) return [];
    return [
      { label: "IP 地址:", value: ip.ipAddress },
      { label: "状态:", value: <Badge variant={getStatusBadgeVariant(ip.status)}>{ipAddressStatusDisplayLabels[ip.status]}</Badge> },
      { label: "是否网关:", value: ip.isGateway ? '是' : '否' },
      { label: "子网:", value: ip.subnet?.cidr || "全局/无" },
      { label: "VLAN:", value: <Badge variant="outline">{ip.directVlan?.vlanNumber ? `VLAN ${ip.directVlan.vlanNumber} (${ip.directVlan.name || '无名称'}) (直接)` : (ip.subnet?.vlan ? `VLAN ${ip.subnet.vlan.vlanNumber} (${ip.subnet.vlan.name || '无名称'}) (继承)` : "无")}</Badge> },
      { label: "分配给:", value: ip.allocatedTo || "N/A" },
      { label: "使用单位:", value: ip.usageUnit || "N/A" },
      { label: "联系人:", value: ip.contactPerson || "N/A" },
      { label: "电话:", value: ip.phone || "N/A" },
      { label: "对端单位名称:", value: ip.peerUnitName || "N/A" },
      { label: "对端设备:", value: ip.peerDeviceName || "N/A" },
      { label: "对端端口:", value: ip.peerPortName || "N/A" },
      { label: "接入方式:", value: ip.selectedAccessType || "N/A" },
      { label: "本端设备:", value: ip.selectedLocalDeviceName || "N/A" },
      { label: "本端端口:", value: ip.selectedDevicePort || "N/A" },
      { label: "费用来源:", value: ip.selectedPaymentSource || "N/A" },
      { label: "描述:", value: ip.description || "无", fullWidth: true },
      { label: "记录创建时间:", value: ip.createdAt ? new Date(ip.createdAt).toLocaleString() : '未知' },
      { label: "记录最后更新:", value: ip.updatedAt ? new Date(ip.updatedAt).toLocaleString() : '未知' },
    ];
  };


  return (
    <>
      <PageHeader title="信息查询" description="输入时自动搜索相关信息（有短暂延迟）。" icon={<Search className="h-6 w-6 text-primary" />} />
      <Tabs defaultValue={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="subnet">子网查询</TabsTrigger>
          <TabsTrigger value="vlan">VLAN查询</TabsTrigger>
          <TabsTrigger value="ip_address">IP地址查询</TabsTrigger>
        </TabsList>

        <TabsContent value="subnet">
          <Card>
            <CardHeader>
              <CardTitle>查询子网</CardTitle>
              <CardDescription>按CIDR、名称、描述或网络地址模糊查询子网。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input placeholder="例如 192.168.1.0/24, 办公网络A区" value={subnetQuery} onChange={handleSubnetQueryChange} onKeyPress={(e) => e.key === 'Enter' && handleSubnetQuerySubmitButton()} />
                <Button onClick={handleSubnetQuerySubmitButton} disabled={isSubnetLoading}>
                  {isSubnetLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}查询
                </Button>
              </div>
              {isSubnetLoading && <LoadingSpinner />}
              {subnetError && <QueryErrorDisplay message={subnetError} />}
              {!isSubnetLoading && !subnetError && subnetResultsData && subnetResultsData.data.length === 0 && debouncedSubnetQuery.trim() && <NoResultsFound />}
              {!isSubnetLoading && !subnetError && subnetResultsData && subnetResultsData.data.length > 0 && (
                <>
                  <Table>
                    <TableHeader><TableRow><TableHead>CIDR (点看可用IP)</TableHead><TableHead>名称</TableHead><TableHead>VLAN</TableHead><TableHead>DHCP</TableHead><TableHead>描述</TableHead><TableHead>总可用</TableHead><TableHead>已分配</TableHead><TableHead>空闲</TableHead><TableHead>预留</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {subnetResultsData.data.map((subnet) => (
                        <TableRow key={subnet.id} onClick={() => handleSubnetRowClick(subnet)} className="cursor-pointer hover:bg-muted/50">
                          <TableCell className="font-medium text-primary hover:underline">{subnet.cidr}</TableCell>
                          <TableCell className="max-w-[150px] truncate">{subnet.name || "无"}</TableCell>
                          <TableCell>{subnet.vlanNumber ? `VLAN ${subnet.vlanNumber} (${subnet.vlanName || '无名称'})` : "无"}</TableCell>
                          <TableCell className="text-center">{subnet.dhcpEnabled ? <CheckCircle className="h-5 w-5 text-green-500 inline-block" /> : <XCircle className="h-5 w-5 text-muted-foreground inline-block" />}</TableCell>
                          <TableCell className="max-w-[200px] truncate">{subnet.description || "无"}</TableCell>
                          <TableCell>{subnet.totalUsableIPs}</TableCell><TableCell>{subnet.allocatedIPsCount}</TableCell><TableCell>{subnet.dbFreeIPsCount}</TableCell><TableCell>{subnet.reservedIPsCount}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {subnetResultsData.totalPages > 1 && ( <PaginationControls currentPage={currentSubnetPage} totalPages={subnetResultsData.totalPages} basePath={pathname} currentQuery={new URLSearchParams(createPaginationQueryString({ tab: "subnet", q_subnet: debouncedSubnetQuery }))} onPageChange={(newPage) => { setCurrentSubnetPage(newPage); router.push(`${pathname}?${createPaginationQueryString({ tab: "subnet", q_subnet: debouncedSubnetQuery, page: newPage.toString() })}`); }} /> )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vlan">
          <Card>
            <CardHeader>
              <CardTitle>VLAN查询</CardTitle>
              <CardDescription>按VLAN号码 (精确) 或名称/描述 (模糊) 查询。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input placeholder="例如 10, Office, 或 生产网" value={vlanQuery} onChange={handleVlanQueryChange} onKeyPress={(e) => e.key === 'Enter' && handleVlanQuerySubmitButton()} />
                <Button onClick={handleVlanQuerySubmitButton} disabled={isVlanLoading}>
                  {isVlanLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}查询
                </Button>
              </div>
              {isVlanLoading && <LoadingSpinner />}
              {vlanError && <QueryErrorDisplay message={vlanError} />}
              {!isVlanLoading && !vlanError && vlanResultsData && vlanResultsData.data.length === 0 && debouncedVlanQuery.trim() && <NoResultsFound />}
              {!isVlanLoading && !vlanError && vlanResultsData && vlanResultsData.data.length > 0 && (
                <>
                 <Table>
                    <TableHeader><TableRow><TableHead>VLAN号码 (点看详情)</TableHead><TableHead>名称</TableHead><TableHead>描述</TableHead><TableHead>关联资源数</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {vlanResultsData.data.map((vlan) => (
                        <TableRow key={vlan.id} onClick={() => handleVlanRowClick(vlan)} className="cursor-pointer hover:bg-muted/50">
                          <TableCell className="font-medium text-primary hover:underline">{vlan.vlanNumber}</TableCell>
                          <TableCell>{vlan.name || "无"}</TableCell>
                          <TableCell>{vlan.description || "无"}</TableCell>
                          <TableCell>{vlan.resourceCount}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                   {vlanResultsData.totalPages > 1 && ( <PaginationControls currentPage={currentVlanPage} totalPages={vlanResultsData.totalPages} basePath={pathname} currentQuery={new URLSearchParams(createPaginationQueryString({ tab: "vlan", q_vlan: debouncedVlanQuery }))} onPageChange={(newPage) => { setCurrentVlanPage(newPage); router.push(`${pathname}?${createPaginationQueryString({ tab: "vlan", q_vlan: debouncedVlanQuery, page: newPage.toString() })}`); }} /> )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ip_address">
          <Card>
            <CardHeader>
              <CardTitle>查询IP地址</CardTitle>
              <CardDescription>按IP、分配对象、使用单位、联系人、电话、描述或对端字段模糊查询。可按状态筛选。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                <Input className="flex-grow" placeholder="例如 Server01, 10.0.1.*, 市场部, 客户A" value={ipQuery} onChange={handleIpQueryChange} onKeyPress={(e) => e.key === 'Enter' && handleIpQuerySubmitButton()} />
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Label htmlFor="ip-status-filter" className="text-sm shrink-0">状态:</Label>
                  <Select value={ipQueryStatus} onValueChange={handleIpStatusChange}>
                    <SelectTrigger id="ip-status-filter" className="w-full sm:w-[150px]">
                      <SelectValue placeholder="选择状态" />
                    </SelectTrigger>
                    <SelectContent>
                      {ipAddressStatusQueryOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleIpQuerySubmitButton} disabled={isIpLoading} className="w-full sm:w-auto">
                  {isIpLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}查询
                </Button>
              </div>
              {isIpLoading && <LoadingSpinner />}
              {ipError && <QueryErrorDisplay message={ipError} />}
              {!isIpLoading && !ipError && ipResultsData && ipResultsData.data.length === 0 && (debouncedIpQuery.trim() || ipQueryStatus !== 'all') && <NoResultsFound />}
              {!isIpLoading && !ipError && ipResultsData && ipResultsData.data.length > 0 && (
                <>
                  <Table>
                    <TableHeader><TableRow><TableHead>IP地址 (点看详情)</TableHead><TableHead>状态</TableHead><TableHead>分配给</TableHead><TableHead>描述</TableHead><TableHead>子网</TableHead><TableHead>对端单位</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {ipResultsData.data.map((ip) => (
                        <TableRow key={ip.id} onClick={() => handleIpRowClick(ip)} className="cursor-pointer hover:bg-muted/50">
                          <TableCell className="font-medium text-primary hover:underline">{ip.ipAddress}</TableCell>
                          <TableCell><Badge variant={getStatusBadgeVariant(ip.status)}>{ipAddressStatusDisplayLabels[ip.status]}</Badge></TableCell>
                          <TableCell className="max-w-[150px] truncate">{ip.allocatedTo || "无"}</TableCell>
                          <TableCell className="max-w-[200px] truncate">{ip.description || "无"}</TableCell>
                          <TableCell>{ip.subnet ? `${ip.subnet.cidr}` : "全局/无"}</TableCell>
                          <TableCell className="max-w-[150px] truncate">{ip.peerUnitName || "N/A"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                   {ipResultsData.totalPages > 1 && ( <PaginationControls currentPage={currentIpPage} totalPages={ipResultsData.totalPages} basePath={pathname} currentQuery={new URLSearchParams(createPaginationQueryString({ tab: "ip_address", q_ip: debouncedIpQuery, status: debouncedIpQueryStatus }))} onPageChange={(newPage) => { setCurrentIpPage(newPage); router.push(`${pathname}?${createPaginationQueryString({ tab: "ip_address", q_ip: debouncedIpQuery, status: debouncedIpQueryStatus, page: newPage.toString() })}`); }} /> )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Sheet open={isSubnetDetailsSheetOpen} onOpenChange={setIsSubnetDetailsSheetOpen}>
        <SheetContent className="sm:max-w-xl w-full flex flex-col">
          <SheetHeader>
             <SheetTitle>
              {selectedSubnetForSheet ? `子网详情: ${selectedSubnetForSheet.name || selectedSubnetForSheet.cidr}` :
               (selectedVlanDetails ? `VLAN ${selectedVlanDetails.vlanNumber} (${selectedVlanDetails.name || '无名称'}) 关联资源` : '详情')}
            </SheetTitle>
            {selectedSubnetForSheet && (
              <SheetDescription>
                CIDR: {selectedSubnetForSheet.cidr} | DHCP: {selectedSubnetForSheet.dhcpEnabled ? '启用' : '禁用'} | VLAN: {selectedSubnetForSheet.vlanNumber ? `VLAN ${selectedSubnetForSheet.vlanNumber} (${selectedSubnetForSheet.vlanName || '无名称'})` : "无"}
              </SheetDescription>
            )}
            {selectedVlanDetails && <SheetDescription>描述: {selectedVlanDetails.description || '无'}</SheetDescription>}
          </SheetHeader>
          <div className="flex-grow overflow-hidden py-4">
            {isSubnetDetailsLoading && selectedSubnetForSheet && <LoadingSpinner message="加载子网可用IP详情中..." />}
            {subnetDetailsError && selectedSubnetForSheet && <QueryErrorDisplay message={subnetDetailsError} />}

            {selectedSubnetForSheet && selectedSubnetFreeIpDetails && (
              <div className="space-y-4 h-full flex flex-col">
                <Card><CardHeader className="pb-2 pt-4"><CardTitle className="text-lg">统计信息</CardTitle></CardHeader>
                  <CardContent className="text-sm space-y-1">
                    <p>总可用 IP (理论): {selectedSubnetFreeIpDetails.totalUsableIPs}</p>
                    <p>已分配 IP (数据库记录): {selectedSubnetFreeIpDetails.dbAllocatedIPsCount}</p>
                    <p>已预留 IP (数据库记录): {selectedSubnetFreeIpDetails.dbReservedIPsCount}</p>
                    <p>实际可用 IP (未分配/未预留): <strong className="text-green-600">{selectedSubnetFreeIpDetails.calculatedAvailableIPsCount}</strong></p>
                  </CardContent></Card>
                <div className="flex-grow min-h-0">
                  <h4 className="font-semibold mb-2 text-md">可用 IP 地址列表 ({selectedSubnetFreeIpDetails.calculatedAvailableIpRanges.length} 个条目/范围):</h4>
                  {selectedSubnetFreeIpDetails.calculatedAvailableIpRanges.length > 0 ? (
                    <ScrollArea className="h-full max-h-[calc(100vh-350px)] md:max-h-[350px] rounded-md border p-3 bg-muted/30">
                      <ul className="space-y-1 text-sm font-mono">{selectedSubnetFreeIpDetails.calculatedAvailableIpRanges.map((range, index) => (<li key={index} className="px-2 py-1 rounded bg-background shadow-sm">{range}</li>))}</ul>
                    </ScrollArea>
                  ) : (<p className="text-sm text-muted-foreground p-3 border rounded-md bg-muted/30">此子网中没有可用的 IP 地址。</p>)}
                </div>
              </div>
            )}
            {selectedVlanDetails && (
                <div className="space-y-3">
                    <h4 className="font-semibold text-md">关联子网 ({selectedVlanDetails.associatedSubnets.length}):</h4>
                    {selectedVlanDetails.associatedSubnets.length > 0 ? (
                        <ScrollArea className="h-auto max-h-[150px] rounded-md border p-2">
                            <ul className="list-disc list-inside pl-2 text-sm">
                                {selectedVlanDetails.associatedSubnets.map(s => <li key={s.id}>{s.cidr} ({s.name || s.description || '无描述'})</li>)}
                            </ul>
                        </ScrollArea>
                    ) : <p className="text-sm text-muted-foreground">无关联子网。</p>}

                    <h4 className="font-semibold text-md mt-3">直接关联IP地址 ({selectedVlanDetails.associatedDirectIPs.length}):</h4>
                    {selectedVlanDetails.associatedDirectIPs.length > 0 ? (
                         <ScrollArea className="h-auto max-h-[150px] rounded-md border p-2">
                            <ul className="list-disc list-inside pl-2 text-sm">
                                {selectedVlanDetails.associatedDirectIPs.map(ip => <li key={ip.id}>{ip.ipAddress} ({ip.description || '无描述'})</li>)}
                            </ul>
                        </ScrollArea>
                    ) : <p className="text-sm text-muted-foreground">无直接关联IP地址。</p>}

                    {selectedVlanDetails.resourceCount === 0 && <p className="text-sm text-muted-foreground mt-2">此 VLAN 当前未被任何子网或 IP 地址直接使用。</p>}
                </div>
            )}

            {!isSubnetDetailsLoading && !subnetDetailsError && !selectedSubnetForSheet && !selectedVlanDetails && (
                <div className="text-center py-10"><Info className="mx-auto h-10 w-10 text-muted-foreground mb-2" /><p>没有可显示的详情。</p></div>
            )}
          </div>
          <SheetFooter><SheetClose asChild><Button variant="outline">关闭</Button></SheetClose></SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet open={isIpDetailsSheetOpen} onOpenChange={setIsIpDetailsSheetOpen}>
        <SheetContent className="sm:max-w-md w-full flex flex-col">
          <SheetHeader>
            <SheetTitle>IP 地址详情: {selectedIpDetails?.ipAddress}</SheetTitle>
            <SheetDescription>查看所选 IP 地址的详细信息。</SheetDescription>
          </SheetHeader>
          <ScrollArea className="flex-grow py-4 pr-6">
            <div className="space-y-3">
              {getIpDetails(selectedIpDetails).map(detail => (
                <div key={detail.label} className={`flex ${detail.fullWidth ? 'flex-col items-start' : 'justify-between items-center'}`}>
                  <span className="text-sm text-muted-foreground">{detail.label}</span>
                  {detail.fullWidth ?
                    <div className="text-sm font-medium mt-1 break-words">{detail.value}</div> :
                    <div className="text-sm font-medium text-right truncate max-w-[60%]">{detail.value}</div>
                  }
                </div>
              ))}
            </div>
          </ScrollArea>
          <SheetFooter className="border-t pt-4"><SheetClose asChild><Button variant="outline">关闭</Button></SheetClose></SheetFooter>
        </SheetContent>
      </Sheet>

    </>
  );
}

export default function QueryPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="h-12 w-12 animate-spin text-primary" /><p className="ml-3 text-lg">加载查询页面...</p></div>}>
      <QueryPageContent />
    </Suspense>
  );
}
