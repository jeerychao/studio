
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
import { Search, AlertCircle, Loader2, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser, hasPermission } from "@/hooks/use-current-user";
import { PERMISSIONS, type PaginatedResponse, type SubnetFreeIpDetails } from "@/types";
import type { SubnetQueryResult, VlanQueryResult, IPAddressStatus as AppIPAddressStatusType } from "@/types";
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

const ITEMS_PER_PAGE_QUERY = 10;
const DEBOUNCE_DELAY = 500;

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

  // --- Subnet Query State ---
  const [subnetQuery, setSubnetQuery] = React.useState("");
  const [debouncedSubnetQuery, setDebouncedSubnetQuery] = React.useState("");
  const [subnetResultsData, setSubnetResultsData] = React.useState<PaginatedResponse<SubnetQueryResult> | null>(null);
  const [isSubnetLoading, setIsSubnetLoading] = React.useState(false);
  const [subnetError, setSubnetError] = React.useState<string | null>(null);
  const [currentSubnetPage, setCurrentSubnetPage] = React.useState(1);

  // --- Subnet IP Details Sheet State ---
  const [isSubnetDetailsSheetOpen, setIsSubnetDetailsSheetOpen] = React.useState(false);
  const [selectedSubnetDetails, setSelectedSubnetDetails] = React.useState<SubnetFreeIpDetails | null>(null);
  const [isSubnetDetailsLoading, setIsSubnetDetailsLoading] = React.useState(false);
  const [subnetDetailsError, setSubnetDetailsError] = React.useState<string | null>(null);


  // --- VLAN Query State ---
  const [vlanQuery, setVlanQuery] = React.useState("");
  const [debouncedVlanQuery, setDebouncedVlanQuery] = React.useState("");
  const [vlanResultsData, setVlanResultsData] = React.useState<PaginatedResponse<VlanQueryResult> | null>(null);
  const [isVlanLoading, setIsVlanLoading] = React.useState(false);
  const [vlanError, setVlanError] = React.useState<string | null>(null);
  const [currentVlanPage, setCurrentVlanPage] = React.useState(1);

  // --- IP Address Query State ---
  const [ipQuery, setIpQuery] = React.useState("");
  const [debouncedIpQuery, setDebouncedIpQuery] = React.useState("");
  const [ipResultsData, setIpResultsData] = React.useState<PaginatedResponse<AppIPAddressWithRelations> | null>(null);
  const [isIpLoading, setIsIpLoading] = React.useState(false);
  const [ipError, setIpError] = React.useState<string | null>(null);
  const [currentIpPage, setCurrentIpPage] = React.useState(1);

  // Debounce effects
  React.useEffect(() => {
    const handler = setTimeout(() => setDebouncedSubnetQuery(subnetQuery), DEBOUNCE_DELAY);
    return () => clearTimeout(handler);
  }, [subnetQuery]);

  React.useEffect(() => {
    const handler = setTimeout(() => setDebouncedVlanQuery(vlanQuery), DEBOUNCE_DELAY);
    return () => clearTimeout(handler);
  }, [vlanQuery]);

  React.useEffect(() => {
    const handler = setTimeout(() => setDebouncedIpQuery(ipQuery), DEBOUNCE_DELAY);
    return () => clearTimeout(handler);
  }, [ipQuery]);

  // Data fetching functions
  const fetchSubnetData = React.useCallback(async (page = 1, queryToUse = debouncedSubnetQuery) => {
    const trimmedQuery = queryToUse.trim();
    if (!trimmedQuery) {
      setSubnetResultsData(null); setSubnetError(null); setIsSubnetLoading(false); return;
    }
    setIsSubnetLoading(true); setSubnetError(null);
    try {
      const response = await querySubnetsAction({ queryString: trimmedQuery, page, pageSize: ITEMS_PER_PAGE_QUERY });
      if (response.success && response.data) setSubnetResultsData(response.data);
      else { setSubnetResultsData(null); setSubnetError(response.error?.userMessage || "查询子网失败"); toast({ title: "子网查询失败", description: response.error?.userMessage, variant: "destructive" });}
    } catch (e) { setSubnetResultsData(null); setSubnetError("查询子网时发生意外错误。"); toast({ title: "子网查询错误", description: (e as Error).message, variant: "destructive" });}
    finally { setIsSubnetLoading(false); }
  }, [toast, debouncedSubnetQuery]);

  const fetchVlanData = React.useCallback(async (page = 1, queryToUse = debouncedVlanQuery) => {
    const trimmedQuery = queryToUse.trim();
    if (!trimmedQuery) {
      setVlanResultsData(null); setVlanError(null); setIsVlanLoading(false); return;
    }
    setIsVlanLoading(true); setVlanError(null);
    const vlanNumber = parseInt(trimmedQuery, 10);
    if (isNaN(vlanNumber) || vlanNumber < 1 || vlanNumber > 4094) {
      toast({ title: "无效的VLAN号", description: "请输入1到4094之间的有效VLAN号码进行精确查询。留空以清除结果。", variant: "destructive" });
      setVlanResultsData(null); setVlanError("无效的VLAN号输入。仅支持数字查询。"); setIsVlanLoading(false); return;
    }
    try {
      const response = await queryVlansAction({ vlanNumberQuery: vlanNumber, page, pageSize: ITEMS_PER_PAGE_QUERY });
      if (response.success && response.data) setVlanResultsData(response.data);
      else { setVlanResultsData(null); setVlanError(response.error?.userMessage || "查询VLAN失败"); toast({ title: "VLAN查询失败", description: response.error?.userMessage, variant: "destructive" });}
    } catch (e) { setVlanResultsData(null); setVlanError("查询VLAN时发生意外错误。"); toast({ title: "VLAN查询错误", description: (e as Error).message, variant: "destructive" });}
    finally { setIsVlanLoading(false); }
  }, [toast, debouncedVlanQuery]);

  const fetchIpData = React.useCallback(async (page = 1, queryToUse = debouncedIpQuery) => {
    const trimmedQuery = queryToUse.trim();
    if (!trimmedQuery) {
      setIpResultsData(null); setIpError(null); setIsIpLoading(false); return;
    }
    setIsIpLoading(true); setIpError(null);
    try {
      const response = await queryIpAddressesAction({ searchTerm: trimmedQuery, page, pageSize: ITEMS_PER_PAGE_QUERY });
      if (response.success && response.data) setIpResultsData(response.data);
      else { setIpResultsData(null); setIpError(response.error?.userMessage || "查询IP失败"); toast({ title: "IP查询失败", description: response.error?.userMessage, variant: "destructive" });}
    } catch (e) { setIpResultsData(null); setIpError("查询IP时发生意外错误。"); toast({ title: "IP查询错误", description: (e as Error).message, variant: "destructive" });}
    finally { setIsIpLoading(false); }
  }, [toast, debouncedIpQuery]);

  // Effects for debounced queries and pagination
  React.useEffect(() => {
    if (debouncedSubnetQuery.trim()) fetchSubnetData(currentSubnetPage, debouncedSubnetQuery);
    else { setSubnetResultsData(null); setSubnetError(null); }
  }, [currentSubnetPage, debouncedSubnetQuery, fetchSubnetData]);

  React.useEffect(() => {
    if (debouncedVlanQuery.trim()) fetchVlanData(currentVlanPage, debouncedVlanQuery);
    else { setVlanResultsData(null); setVlanError(null); }
  }, [currentVlanPage, debouncedVlanQuery, fetchVlanData]);

  React.useEffect(() => {
    if (debouncedIpQuery.trim()) fetchIpData(currentIpPage, debouncedIpQuery);
    else { setIpResultsData(null); setIpError(null); }
  }, [currentIpPage, debouncedIpQuery, fetchIpData]);

  // Input change handlers
  const handleSubnetQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setSubnetQuery(newValue);
    if (newValue.trim() !== debouncedSubnetQuery.trim()) setCurrentSubnetPage(1);
  };
  const handleVlanQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setVlanQuery(newValue);
    if (newValue.trim() !== debouncedVlanQuery.trim()) setCurrentVlanPage(1);
  };
  const handleIpQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setIpQuery(newValue);
    if (newValue.trim() !== debouncedIpQuery.trim()) setCurrentIpPage(1);
  };

  // Submit handlers (for button click or Enter key)
  const handleSubnetQuerySubmitButton = () => { setDebouncedSubnetQuery(subnetQuery); setCurrentSubnetPage(1); };
  const handleVlanQuerySubmitButton = () => { setDebouncedVlanQuery(vlanQuery); setCurrentVlanPage(1); };
  const handleIpQuerySubmitButton = () => { setDebouncedIpQuery(ipQuery); setCurrentIpPage(1); };

  // Subnet details sheet logic
  const handleSubnetRowClick = async (subnetId: string) => {
    setIsSubnetDetailsSheetOpen(true);
    setIsSubnetDetailsLoading(true);
    setSubnetDetailsError(null);
    setSelectedSubnetDetails(null);
    try {
      const response = await getSubnetFreeIpDetailsAction(subnetId);
      if (response.success && response.data) {
        setSelectedSubnetDetails(response.data);
      } else {
        setSubnetDetailsError(response.error?.userMessage || "无法加载子网详情。");
        toast({ title: "加载子网详情失败", description: response.error?.userMessage, variant: "destructive" });
      }
    } catch (e) {
      setSubnetDetailsError("加载子网详情时发生意外错误。");
      toast({ title: "加载子网详情错误", description: (e as Error).message, variant: "destructive" });
    } finally {
      setIsSubnetDetailsLoading(false);
    }
  };

  const ipAddressStatusLabels: Record<AppIPAddressStatusType, string> = { allocated: "已分配", free: "空闲", reserved: "预留" };
  const getStatusBadgeVariant = (status: AppIPAddressStatusType) => {
    switch (status) { case "allocated": return "default"; case "free": return "secondary"; case "reserved": return "outline"; default: return "secondary"; }
  };

  if (isAuthLoading) return <div className="flex flex-col items-center justify-center h-full"><Loader2 className="h-16 w-16 animate-spin text-primary mb-4" /><h2 className="text-2xl font-semibold mb-2">加载查询工具...</h2></div>;
  if (!currentUser || !hasPermission(currentUser, PERMISSIONS.VIEW_QUERY_PAGE)) return <div className="flex flex-col items-center justify-center h-full"><Search className="h-16 w-16 text-destructive mb-4" /><h2 className="text-2xl font-semibold mb-2">访问被拒绝</h2><p className="text-muted-foreground">您没有权限查看信息查询页面。</p></div>;
  
  const createPaginationQuery = (baseParams: URLSearchParams = new URLSearchParams()): URLSearchParams => {
    const current = new URLSearchParams(searchParams); 
    baseParams.forEach((value, key) => current.set(key, value)); 
    return current;
  };

  return (
    <>
      <PageHeader title="信息查询" description="输入时自动搜索相关信息（有短暂延迟）。" icon={<Search className="h-6 w-6 text-primary" />} />
      <Tabs defaultValue="subnet" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="subnet">子网查询</TabsTrigger>
          <TabsTrigger value="vlan">VLAN查询</TabsTrigger>
          <TabsTrigger value="ip_address">IP地址查询</TabsTrigger>
        </TabsList>

        {/* Subnet Query Tab */}
        <TabsContent value="subnet">
          <Card>
            <CardHeader>
              <CardTitle>查询子网</CardTitle>
              <CardDescription>按CIDR、描述或网络地址模糊查询子网。结果将自动更新。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input placeholder="例如 192.168.1.0/24 或 Main Office" value={subnetQuery} onChange={handleSubnetQueryChange} onKeyPress={(e) => e.key === 'Enter' && handleSubnetQuerySubmitButton()} />
                <Button onClick={handleSubnetQuerySubmitButton} disabled={isSubnetLoading && subnetQuery === debouncedSubnetQuery}>
                  {(isSubnetLoading && subnetQuery === debouncedSubnetQuery) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}查询
                </Button>
              </div>
              {isSubnetLoading && <LoadingSpinner />}
              {subnetError && <QueryErrorDisplay message={subnetError} />}
              {!isSubnetLoading && !subnetError && subnetResultsData && subnetResultsData.data.length === 0 && debouncedSubnetQuery.trim() && <NoResultsFound />}
              {!isSubnetLoading && !subnetError && subnetResultsData && subnetResultsData.data.length > 0 && (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>CIDR (点击查看详情)</TableHead>
                        <TableHead>描述</TableHead>
                        <TableHead>VLAN</TableHead>
                        <TableHead>总可用IP</TableHead>
                        <TableHead>已分配 (DB)</TableHead>
                        <TableHead>空闲 (DB)</TableHead>
                        <TableHead>预留 (DB)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {subnetResultsData.data.map((subnet) => (
                        <TableRow key={subnet.id} onClick={() => handleSubnetRowClick(subnet.id)} className="cursor-pointer hover:bg-muted/50">
                          <TableCell className="font-medium text-primary hover:underline">{subnet.cidr}</TableCell>
                          <TableCell>{subnet.description || "无"}</TableCell>
                          <TableCell>{subnet.vlanNumber ? `VLAN ${subnet.vlanNumber} (${subnet.vlanDescription || '无'})` : "无"}</TableCell>
                          <TableCell>{subnet.totalUsableIPs}</TableCell>
                          <TableCell>{subnet.allocatedIPsCount}</TableCell>
                          <TableCell>{subnet.dbFreeIPsCount}</TableCell>
                          <TableCell>{subnet.reservedIPsCount}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {subnetResultsData.totalPages > 1 && ( <PaginationControls currentPage={currentSubnetPage} totalPages={subnetResultsData.totalPages} basePath={pathname} currentQuery={createPaginationQuery(new URLSearchParams({ tab: "subnet", q_subnet: debouncedSubnetQuery }))} onPageChange={(newPage) => setCurrentSubnetPage(newPage)} /> )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* VLAN Query Tab */}
        <TabsContent value="vlan">
          <Card>
            <CardHeader>
              <CardTitle>VLAN查询</CardTitle>
              <CardDescription>按VLAN号码 (1-4094) 查询。请输入后结果将自动更新。仅支持数字查询。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input type="number" placeholder="例如 10 (仅支持数字)" value={vlanQuery} onChange={handleVlanQueryChange} onKeyPress={(e) => e.key === 'Enter' && handleVlanQuerySubmitButton()} />
                <Button onClick={handleVlanQuerySubmitButton} disabled={isVlanLoading && vlanQuery === debouncedVlanQuery}>
                  {(isVlanLoading && vlanQuery === debouncedVlanQuery) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}查询
                </Button>
              </div>
              {isVlanLoading && <LoadingSpinner />}
              {vlanError && <QueryErrorDisplay message={vlanError} />}
              {!isVlanLoading && !vlanError && vlanResultsData && vlanResultsData.data.length === 0 && debouncedVlanQuery.trim() && <NoResultsFound />}
              {!isVlanLoading && !vlanError && vlanResultsData && vlanResultsData.data.length > 0 && (
                <>
                  <div className="space-y-3">
                    {vlanResultsData.data.map((vlan) => (
                      <Card key={vlan.id}>
                        <CardHeader className="p-4"><CardTitle className="text-lg">VLAN {vlan.vlanNumber}</CardTitle><CardDescription>{vlan.description || "无描述"}</CardDescription></CardHeader>
                        <CardContent className="p-4 pt-0 text-sm space-y-2">
                          <p><strong>关联子网:</strong> {vlan.associatedSubnets.length > 0 ? vlan.associatedSubnets.map(s => `${s.cidr} (${s.description || '无'})`).join('; ') : "无"}</p>
                          <p><strong>直接关联IP:</strong> {vlan.associatedDirectIPs.length > 0 ? vlan.associatedDirectIPs.map(ip => `${ip.ipAddress} (${ip.description || '无'})`).join('; ') : "无"}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                   {vlanResultsData.totalPages > 1 && ( <PaginationControls currentPage={currentVlanPage} totalPages={vlanResultsData.totalPages} basePath={pathname} currentQuery={createPaginationQuery(new URLSearchParams({ tab: "vlan", q_vlan: debouncedVlanQuery }))} onPageChange={(newPage) => setCurrentVlanPage(newPage)} /> )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* IP Address Query Tab */}
        <TabsContent value="ip_address">
          <Card>
            <CardHeader>
              <CardTitle>查询IP地址</CardTitle>
              <CardDescription>
                按IP地址、分配对象或描述模糊查询。结果将自动更新。<br/>
                IP地址支持前缀匹配 (如 <code className="bg-muted px-1 py-0.5 rounded text-sm">10.0.1</code>) 和后缀通配符 (如 <code className="bg-muted px-1 py-0.5 rounded text-sm">10.0.1.*</code>, <code className="bg-muted px-1 py-0.5 rounded text-sm">10.0.*</code>, <code className="bg-muted px-1 py-0.5 rounded text-sm">10.*</code>)。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input placeholder="例如 Server01, 10.0.1.*, 或 192.168.1.10" value={ipQuery} onChange={handleIpQueryChange} onKeyPress={(e) => e.key === 'Enter' && handleIpQuerySubmitButton()} />
                <Button onClick={handleIpQuerySubmitButton} disabled={isIpLoading && ipQuery === debouncedIpQuery}>
                  {(isIpLoading && ipQuery === debouncedIpQuery) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}查询
                </Button>
              </div>
              {isIpLoading && <LoadingSpinner />}
              {ipError && <QueryErrorDisplay message={ipError} />}
              {!isIpLoading && !ipError && ipResultsData && ipResultsData.data.length === 0 && debouncedIpQuery.trim() && <NoResultsFound />}
              {!isIpLoading && !ipError && ipResultsData && ipResultsData.data.length > 0 && (
                <>
                  <Table>
                    <TableHeader><TableRow><TableHead>IP地址</TableHead><TableHead>状态</TableHead><TableHead>分配给</TableHead><TableHead>描述</TableHead><TableHead>子网</TableHead><TableHead>VLAN (直接/继承)</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {ipResultsData.data.map((ip) => (
                        <TableRow key={ip.id}>
                          <TableCell className="font-medium">{ip.ipAddress}</TableCell>
                          <TableCell><Badge variant={getStatusBadgeVariant(ip.status)}>{ipAddressStatusLabels[ip.status]}</Badge></TableCell>
                          <TableCell>{ip.allocatedTo || "无"}</TableCell>
                          <TableCell>{ip.description || "无"}</TableCell>
                          <TableCell>{ip.subnet ? `${ip.subnet.cidr}` : "全局/无"}</TableCell>
                          <TableCell>{ip.vlan ? `VLAN ${ip.vlan.vlanNumber} (直接)` : (ip.subnet?.vlan ? `VLAN ${ip.subnet.vlan.vlanNumber} (继承自子网)` : "无")}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                   {ipResultsData.totalPages > 1 && ( <PaginationControls currentPage={currentIpPage} totalPages={ipResultsData.totalPages} basePath={pathname} currentQuery={createPaginationQuery(new URLSearchParams({ tab: "ip_address", q_ip: debouncedIpQuery }))} onPageChange={(newPage) => setCurrentIpPage(newPage)} /> )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Subnet IP Details Sheet */}
      <Sheet open={isSubnetDetailsSheetOpen} onOpenChange={setIsSubnetDetailsSheetOpen}>
        <SheetContent className="sm:max-w-xl w-full flex flex-col">
          <SheetHeader>
            <SheetTitle>子网 IP 使用详情</SheetTitle>
            {selectedSubnetDetails && <SheetDescription>CIDR: {selectedSubnetDetails.subnetCidr}</SheetDescription>}
          </SheetHeader>
          <div className="flex-grow overflow-hidden py-4">
            {isSubnetDetailsLoading && <LoadingSpinner message="加载详情中..." />}
            {subnetDetailsError && <QueryErrorDisplay message={subnetDetailsError} />}
            {!isSubnetDetailsLoading && !subnetDetailsError && selectedSubnetDetails && (
              <div className="space-y-4 h-full flex flex-col">
                <Card>
                  <CardHeader className="pb-2 pt-4">
                    <CardTitle className="text-lg">统计信息</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm space-y-1">
                    <p>总可用 IP (理论): {selectedSubnetDetails.totalUsableIPs}</p>
                    <p>已分配 IP (数据库记录): {selectedSubnetDetails.dbAllocatedIPsCount}</p>
                    <p>已预留 IP (数据库记录): {selectedSubnetDetails.dbReservedIPsCount}</p>
                    <p>实际可用 IP (未分配/未预留): <strong className="text-green-600">{selectedSubnetDetails.calculatedAvailableIPsCount}</strong></p>
                  </CardContent>
                </Card>
                
                <div className="flex-grow min-h-0">
                  <h4 className="font-semibold mb-2 text-md">可用 IP 地址列表 ({selectedSubnetDetails.calculatedAvailableIpRanges.length} 个条目/范围):</h4>
                  {selectedSubnetDetails.calculatedAvailableIpRanges.length > 0 ? (
                    <ScrollArea className="h-full max-h-[calc(100vh-300px)] md:max-h-[400px] rounded-md border p-3 bg-muted/30">
                      <ul className="space-y-1 text-sm font-mono">
                        {selectedSubnetDetails.calculatedAvailableIpRanges.map((range, index) => (
                          <li key={index} className="px-2 py-1 rounded bg-background shadow-sm">{range}</li>
                        ))}
                      </ul>
                    </ScrollArea>
                  ) : (
                    <p className="text-sm text-muted-foreground p-3 border rounded-md bg-muted/30">此子网中没有可用的 IP 地址。</p>
                  )}
                </div>
              </div>
            )}
            {!isSubnetDetailsLoading && !subnetDetailsError && !selectedSubnetDetails && (
                <div className="text-center py-10"><Info className="mx-auto h-10 w-10 text-muted-foreground mb-2" /><p>没有可显示的子网详情。</p></div>
            )}
          </div>
          <SheetFooter>
            <SheetClose asChild>
              <Button variant="outline">关闭</Button>
            </SheetClose>
          </SheetFooter>
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
