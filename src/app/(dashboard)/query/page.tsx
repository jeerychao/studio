
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
import { Search, AlertCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser, hasPermission } from "@/hooks/use-current-user";
import { PERMISSIONS, type PaginatedResponse } from "@/types"; // Added PaginatedResponse to types import
import type { SubnetQueryResult, VlanQueryResult, IPAddressStatus as AppIPAddressStatusType } from "@/types";
import type { AppIPAddressWithRelations } from "@/lib/actions";
import { querySubnetsAction, queryVlansAction, queryIpAddressesAction } from "@/lib/actions";
import { PaginationControls } from "@/components/pagination-controls"; // Import PaginationControls

const ITEMS_PER_PAGE_QUERY = 10;

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-10">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="ml-2 text-muted-foreground">正在查询...</p>
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


  // Subnet Query State
  const [subnetQuery, setSubnetQuery] = React.useState("");
  const [subnetResultsData, setSubnetResultsData] = React.useState<PaginatedResponse<SubnetQueryResult> | null>(null);
  const [isSubnetLoading, setIsSubnetLoading] = React.useState(false);
  const [subnetError, setSubnetError] = React.useState<string | null>(null);
  const [currentSubnetPage, setCurrentSubnetPage] = React.useState(1);

  // VLAN Query State
  const [vlanQuery, setVlanQuery] = React.useState("");
  const [vlanResultsData, setVlanResultsData] = React.useState<PaginatedResponse<VlanQueryResult> | null>(null);
  const [isVlanLoading, setIsVlanLoading] = React.useState(false);
  const [vlanError, setVlanError] = React.useState<string | null>(null);
  const [currentVlanPage, setCurrentVlanPage] = React.useState(1);

  // IP Address Query State
  const [ipQuery, setIpQuery] = React.useState("");
  const [ipResultsData, setIpResultsData] = React.useState<PaginatedResponse<AppIPAddressWithRelations> | null>(null);
  const [isIpLoading, setIsIpLoading] = React.useState(false);
  const [ipError, setIpError] = React.useState<string | null>(null);
  const [currentIpPage, setCurrentIpPage] = React.useState(1);


  const fetchSubnetData = React.useCallback(async (page = 1) => {
    if (!subnetQuery.trim()) {
      setSubnetResultsData(null); // Clear results if query is empty
      setSubnetError(null);
      return;
    }
    setIsSubnetLoading(true);
    setSubnetError(null);
    try {
      const response = await querySubnetsAction({ queryString: subnetQuery, page, pageSize: ITEMS_PER_PAGE_QUERY });
      if (response.success && response.data) {
        setSubnetResultsData(response.data);
      } else {
        setSubnetResultsData(null);
        setSubnetError(response.error?.userMessage || "查询子网失败");
        toast({ title: "子网查询失败", description: response.error?.userMessage, variant: "destructive" });
      }
    } catch (e) {
      setSubnetResultsData(null);
      setSubnetError("查询子网时发生意外错误。");
      toast({ title: "子网查询错误", description: (e as Error).message, variant: "destructive" });
    } finally {
      setIsSubnetLoading(false);
    }
  }, [subnetQuery, toast]);

  const handleSubnetQuerySubmit = () => {
    setCurrentSubnetPage(1);
    fetchSubnetData(1);
  };
  
  React.useEffect(() => {
    if(subnetQuery.trim()){ // Fetch on page change only if there's an active query
        fetchSubnetData(currentSubnetPage);
    } else {
        setSubnetResultsData(null); // Clear if query becomes empty
    }
  }, [currentSubnetPage, fetchSubnetData, subnetQuery]);


  const fetchVlanData = React.useCallback(async (page = 1) => {
    const vlanNumber = parseInt(vlanQuery, 10);
    if (vlanQuery.trim() && (isNaN(vlanNumber) || vlanNumber < 1 || vlanNumber > 4094)) {
      toast({ title: "无效的VLAN号", description: "请输入1到4094之间的有效VLAN号码，或留空以查询所有。", variant: "destructive" });
      setVlanResultsData(null);
      setVlanError("无效的VLAN号输入");
      return;
    }
    setIsVlanLoading(true);
    setVlanError(null);
    try {
      const response = await queryVlansAction({ vlanNumberQuery: vlanQuery.trim() ? vlanNumber : undefined, page, pageSize: ITEMS_PER_PAGE_QUERY });
      if (response.success && response.data) {
        setVlanResultsData(response.data);
      } else {
        setVlanResultsData(null);
        setVlanError(response.error?.userMessage || "查询VLAN失败");
        toast({ title: "VLAN查询失败", description: response.error?.userMessage, variant: "destructive" });
      }
    } catch (e) {
      setVlanResultsData(null);
      setVlanError("查询VLAN时发生意外错误。");
      toast({ title: "VLAN查询错误", description: (e as Error).message, variant: "destructive" });
    } finally {
      setIsVlanLoading(false);
    }
  }, [vlanQuery, toast]);

  const handleVlanQuerySubmit = () => {
    setCurrentVlanPage(1);
    fetchVlanData(1);
  };

  React.useEffect(() => {
      fetchVlanData(currentVlanPage);
  }, [currentVlanPage, fetchVlanData]);
  

  const fetchIpData = React.useCallback(async (page = 1) => {
    if (!ipQuery.trim()) {
      setIpResultsData(null);
      setIpError(null);
      return;
    }
    setIsIpLoading(true);
    setIpError(null);
    try {
      const response = await queryIpAddressesAction({ searchTerm: ipQuery, page, pageSize: ITEMS_PER_PAGE_QUERY });
      if (response.success && response.data) {
        setIpResultsData(response.data);
      } else {
        setIpResultsData(null);
        setIpError(response.error?.userMessage || "查询IP失败");
        toast({ title: "IP查询失败", description: response.error?.userMessage, variant: "destructive" });
      }
    } catch (e) {
      setIpResultsData(null);
      setIpError("查询IP时发生意外错误。");
      toast({ title: "IP查询错误", description: (e as Error).message, variant: "destructive" });
    } finally {
      setIsIpLoading(false);
    }
  }, [ipQuery, toast]);

  const handleIpQuerySubmit = () => {
    setCurrentIpPage(1);
    fetchIpData(1);
  };

  React.useEffect(() => {
    if(ipQuery.trim()){
        fetchIpData(currentIpPage);
    } else {
        setIpResultsData(null);
    }
  }, [currentIpPage, fetchIpData, ipQuery]);


  const ipAddressStatusLabels: Record<AppIPAddressStatusType, string> = {
    allocated: "已分配",
    free: "空闲",
    reserved: "预留",
  };
  const getStatusBadgeVariant = (status: AppIPAddressStatusType) => {
    switch (status) {
      case "allocated": return "default";
      case "free": return "secondary";
      case "reserved": return "outline";
      default: return "secondary";
    }
  };


  if (isAuthLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Loader2 className="h-16 w-16 animate-spin text-primary mb-4" />
        <h2 className="text-2xl font-semibold mb-2">加载查询工具...</h2>
      </div>
    );
  }

  if (!currentUser || !hasPermission(currentUser, PERMISSIONS.VIEW_QUERY_PAGE)) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Search className="h-16 w-16 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2">访问被拒绝</h2>
        <p className="text-muted-foreground">您没有权限查看信息查询页面。</p>
      </div>
    );
  }
  
  // Helper to create query params for pagination
  const createPaginationQuery = (tabBaseParams: URLSearchParams = new URLSearchParams()): URLSearchParams => {
    const current = new URLSearchParams(searchParams); // Preserve existing URL params from other sources
    tabBaseParams.forEach((value, key) => current.set(key, value)); // Overlay tab-specific params
    return current;
  };


  return (
    <>
      <PageHeader
        title="信息查询"
        description="查询子网、VLAN和IP地址的详细信息。"
        icon={<Search className="h-6 w-6 text-primary" />}
      />
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
              <CardDescription>按CIDR、描述或网络地址模糊查询子网。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="例如 192.168.1.0/24 或 Main Office"
                  value={subnetQuery}
                  onChange={(e) => setSubnetQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSubnetQuerySubmit()}
                />
                <Button onClick={handleSubnetQuerySubmit} disabled={isSubnetLoading}>
                  {isSubnetLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                  查询
                </Button>
              </div>
              {isSubnetLoading && <LoadingSpinner />}
              {subnetError && <QueryErrorDisplay message={subnetError} />}
              {!isSubnetLoading && !subnetError && subnetResultsData && subnetResultsData.data.length === 0 && subnetQuery && <NoResultsFound />}
              {!isSubnetLoading && !subnetError && subnetResultsData && subnetResultsData.data.length > 0 && (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>CIDR</TableHead>
                        <TableHead>描述</TableHead>
                        <TableHead>VLAN</TableHead>
                        <TableHead>总可用IP</TableHead>
                        <TableHead>已分配</TableHead>
                        <TableHead>DB空闲</TableHead>
                        <TableHead>预留</TableHead>
                        <TableHead>示例空闲IP (DB)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {subnetResultsData.data.map((subnet) => (
                        <TableRow key={subnet.id}>
                          <TableCell className="font-medium">{subnet.cidr}</TableCell>
                          <TableCell>{subnet.description || "无"}</TableCell>
                          <TableCell>{subnet.vlanNumber ? `VLAN ${subnet.vlanNumber} (${subnet.vlanDescription || '无'})` : "无"}</TableCell>
                          <TableCell>{subnet.totalUsableIPs}</TableCell>
                          <TableCell>{subnet.allocatedIPsCount}</TableCell>
                          <TableCell>{subnet.dbFreeIPsCount}</TableCell>
                          <TableCell>{subnet.reservedIPsCount}</TableCell>
                          <TableCell className="text-xs">
                            {subnet.sampleFreeIPs.length > 0 ? subnet.sampleFreeIPs.join(", ") : "无"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {subnetResultsData.totalPages > 1 && (
                     <PaginationControls
                        currentPage={currentSubnetPage}
                        totalPages={subnetResultsData.totalPages}
                        basePath={pathname}
                        currentQuery={createPaginationQuery(new URLSearchParams({ tab: "subnet", q_subnet: subnetQuery }))}
                        onPageChange={(newPage) => setCurrentSubnetPage(newPage)}
                    />
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* VLAN Query Tab */}
        <TabsContent value="vlan">
          <Card>
            <CardHeader>
              <CardTitle>查询VLAN</CardTitle>
              <CardDescription>按VLAN号码查询 (1-4094)，或留空以查询所有活动的VLAN。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="例如 10 (或留空)"
                  value={vlanQuery}
                  onChange={(e) => setVlanQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleVlanQuerySubmit()}
                />
                <Button onClick={handleVlanQuerySubmit} disabled={isVlanLoading}>
                  {isVlanLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                  查询
                </Button>
              </div>
              {isVlanLoading && <LoadingSpinner />}
              {vlanError && <QueryErrorDisplay message={vlanError} />}
              {!isVlanLoading && !vlanError && vlanResultsData && vlanResultsData.data.length === 0 && vlanQuery && <NoResultsFound />}
              {!isVlanLoading && !vlanError && vlanResultsData && vlanResultsData.data.length > 0 && (
                <>
                  <div className="space-y-3">
                    {vlanResultsData.data.map((vlan) => (
                      <Card key={vlan.id}>
                        <CardHeader className="p-4">
                          <CardTitle className="text-lg">VLAN {vlan.vlanNumber}</CardTitle>
                          <CardDescription>{vlan.description || "无描述"}</CardDescription>
                        </CardHeader>
                        <CardContent className="p-4 pt-0 text-sm space-y-2">
                          <p><strong>关联子网:</strong> {vlan.associatedSubnets.length > 0 ? vlan.associatedSubnets.map(s => `${s.cidr} (${s.description || '无'})`).join('; ') : "无"}</p>
                          <p><strong>直接关联IP:</strong> {vlan.associatedDirectIPs.length > 0 ? vlan.associatedDirectIPs.map(ip => `${ip.ipAddress} (${ip.description || '无'})`).join('; ') : "无"}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                   {vlanResultsData.totalPages > 1 && (
                     <PaginationControls
                        currentPage={currentVlanPage}
                        totalPages={vlanResultsData.totalPages}
                        basePath={pathname}
                        currentQuery={createPaginationQuery(new URLSearchParams({ tab: "vlan", q_vlan: vlanQuery }))}
                        onPageChange={(newPage) => setCurrentVlanPage(newPage)}
                    />
                  )}
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
                按IP地址、分配对象或描述模糊查询。
                支持IP段通配符查询，例如: <code className="bg-muted px-1 py-0.5 rounded text-sm">10.0.1.*</code> (查询10.0.1.x段), <code className="bg-muted px-1 py-0.5 rounded text-sm">10.0.*</code> (查询10.0.x.x段), <code className="bg-muted px-1 py-0.5 rounded text-sm">10.*</code> (查询10.x.x.x段)。
                不带通配符的IP地址或部分IP地址 (如 <code className="bg-muted px-1 py-0.5 rounded text-sm">192.168.1</code>) 将进行前缀匹配。
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="例如 Server01, 10.0.1.*, 或 192.168.1.10"
                  value={ipQuery}
                  onChange={(e) => setIpQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleIpQuerySubmit()}
                />
                <Button onClick={handleIpQuerySubmit} disabled={isIpLoading}>
                  {isIpLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                  查询
                </Button>
              </div>
              {isIpLoading && <LoadingSpinner />}
              {ipError && <QueryErrorDisplay message={ipError} />}
              {!isIpLoading && !ipError && ipResultsData && ipResultsData.data.length === 0 && ipQuery && <NoResultsFound />}
              {!isIpLoading && !ipError && ipResultsData && ipResultsData.data.length > 0 && (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>IP地址</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead>分配给</TableHead>
                        <TableHead>描述</TableHead>
                        <TableHead>子网</TableHead>
                        <TableHead>VLAN (直接/继承)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ipResultsData.data.map((ip) => (
                        <TableRow key={ip.id}>
                          <TableCell className="font-medium">{ip.ipAddress}</TableCell>
                          <TableCell><Badge variant={getStatusBadgeVariant(ip.status)}>{ipAddressStatusLabels[ip.status]}</Badge></TableCell>
                          <TableCell>{ip.allocatedTo || "无"}</TableCell>
                          <TableCell>{ip.description || "无"}</TableCell>
                          <TableCell>{ip.subnet ? `${ip.subnet.cidr}` : "全局/无"}</TableCell>
                          <TableCell>
                            {ip.vlan ? `VLAN ${ip.vlan.vlanNumber} (直接)` : 
                             (ip.subnet?.vlan ? `VLAN ${ip.subnet.vlan.vlanNumber} (继承自子网)` : "无")}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                   {ipResultsData.totalPages > 1 && (
                     <PaginationControls
                        currentPage={currentIpPage}
                        totalPages={ipResultsData.totalPages}
                        basePath={pathname}
                        currentQuery={createPaginationQuery(new URLSearchParams({ tab: "ip_address", q_ip: ipQuery }))}
                        onPageChange={(newPage) => setCurrentIpPage(newPage)}
                    />
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}

export default function QueryPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}> {/* Fallback for the whole page if needed */}
      <QueryPageContent />
    </Suspense>
  );
}
