
"use client";

import * as React from "react";
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
import { PERMISSIONS } from "@/types";
import type { SubnetQueryResult, VlanQueryResult, IPAddressStatus as AppIPAddressStatusType } from "@/types";
import type { AppIPAddressWithRelations } from "@/lib/actions";
import { querySubnetsAction, queryVlansAction, queryIpAddressesAction } from "@/lib/actions";

function QueryLoading() {
  return (
    <div className="flex items-center justify-center py-10">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="ml-2 text-muted-foreground">正在查询...</p>
    </div>
  );
}

function NoResults() {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <Search className="h-12 w-12 text-muted-foreground mb-3" />
      <p className="text-muted-foreground">未找到符合条件的结果。</p>
      <p className="text-xs text-muted-foreground">请尝试更改您的搜索词或条件。</p>
    </div>
  );
}

function QueryError({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center text-destructive">
      <AlertCircle className="h-12 w-12 mb-3" />
      <p className="font-semibold">查询出错</p>
      <p className="text-xs">{message || "无法获取查询结果，请稍后再试。"}</p>
    </div>
  );
}


export default function QueryPage() {
  const { toast } = useToast();
  const { currentUser, isAuthLoading } = useCurrentUser();

  const [subnetQuery, setSubnetQuery] = React.useState("");
  const [subnetResults, setSubnetResults] = React.useState<SubnetQueryResult[]>([]);
  const [isSubnetLoading, setIsSubnetLoading] = React.useState(false);
  const [subnetError, setSubnetError] = React.useState<string | null>(null);

  const [vlanQuery, setVlanQuery] = React.useState("");
  const [vlanResults, setVlanResults] = React.useState<VlanQueryResult[]>([]);
  const [isVlanLoading, setIsVlanLoading] = React.useState(false);
  const [vlanError, setVlanError] = React.useState<string | null>(null);

  const [ipQuery, setIpQuery] = React.useState("");
  const [ipResults, setIpResults] = React.useState<AppIPAddressWithRelations[]>([]);
  const [isIpLoading, setIsIpLoading] = React.useState(false);
  const [ipError, setIpError] = React.useState<string | null>(null);

  const handleSubnetQuery = async () => {
    if (!subnetQuery.trim()) {
      toast({ title: "请输入查询条件", description: "子网查询条件不能为空。", variant: "destructive" });
      return;
    }
    setIsSubnetLoading(true);
    setSubnetError(null);
    setSubnetResults([]);
    try {
      const response = await querySubnetsAction(subnetQuery);
      if (response.success && response.data) {
        setSubnetResults(response.data);
      } else {
        setSubnetError(response.error?.userMessage || "查询子网失败");
        toast({ title: "子网查询失败", description: response.error?.userMessage, variant: "destructive" });
      }
    } catch (e) {
      setSubnetError("查询子网时发生意外错误。");
      toast({ title: "子网查询错误", description: (e as Error).message, variant: "destructive" });
    } finally {
      setIsSubnetLoading(false);
    }
  };

  const handleVlanQuery = async () => {
    const vlanNumber = parseInt(vlanQuery, 10);
    if (vlanQuery.trim() && (isNaN(vlanNumber) || vlanNumber < 1 || vlanNumber > 4094)) {
      toast({ title: "无效的VLAN号", description: "请输入1到4094之间的有效VLAN号码，或留空以查询所有。", variant: "destructive" });
      return;
    }
    setIsVlanLoading(true);
    setVlanError(null);
    setVlanResults([]);
    try {
      const response = await queryVlansAction(vlanQuery.trim() ? vlanNumber : undefined);
      if (response.success && response.data) {
        setVlanResults(response.data);
      } else {
        setVlanError(response.error?.userMessage || "查询VLAN失败");
        toast({ title: "VLAN查询失败", description: response.error?.userMessage, variant: "destructive" });
      }
    } catch (e) {
      setVlanError("查询VLAN时发生意外错误。");
      toast({ title: "VLAN查询错误", description: (e as Error).message, variant: "destructive" });
    } finally {
      setIsVlanLoading(false);
    }
  };

  const handleIpQuery = async () => {
    if (!ipQuery.trim()) {
      toast({ title: "请输入查询条件", description: "IP查询条件不能为空。", variant: "destructive" });
      return;
    }
    setIsIpLoading(true);
    setIpError(null);
    setIpResults([]);
    try {
      const response = await queryIpAddressesAction(ipQuery);
      if (response.success && response.data) {
        setIpResults(response.data);
      } else {
        setIpError(response.error?.userMessage || "查询IP失败");
        toast({ title: "IP查询失败", description: response.error?.userMessage, variant: "destructive" });
      }
    } catch (e) {
      setIpError("查询IP时发生意外错误。");
      toast({ title: "IP查询错误", description: (e as Error).message, variant: "destructive" });
    } finally {
      setIsIpLoading(false);
    }
  };
  
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

  return (
    <>
      <PageHeader
        title="信息查询"
        description="查询子网、VLAN和IP地址的详细信息。"
        icon={<Search className="h-6 w-6 text-primary" />}
      />
      <Tabs defaultValue="subnet">
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
              <CardDescription>按CIDR、描述或网络地址模糊查询子网。最多显示20条结果。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="例如 192.168.1.0/24 或 Main Office"
                  value={subnetQuery}
                  onChange={(e) => setSubnetQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSubnetQuery()}
                />
                <Button onClick={handleSubnetQuery} disabled={isSubnetLoading}>
                  {isSubnetLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                  查询
                </Button>
              </div>
              {isSubnetLoading && <QueryLoading />}
              {subnetError && <QueryError message={subnetError} />}
              {!isSubnetLoading && !subnetError && subnetResults.length === 0 && subnetQuery && <NoResults />}
              {!isSubnetLoading && !subnetError && subnetResults.length > 0 && (
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
                    {subnetResults.map((subnet) => (
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
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* VLAN Query Tab */}
        <TabsContent value="vlan">
          <Card>
            <CardHeader>
              <CardTitle>查询VLAN</CardTitle>
              <CardDescription>按VLAN号码查询 (1-4094)，或留空以查询所有活动的VLAN。结果限制为20条VLAN，每个VLAN最多显示10条关联记录。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="例如 10 (或留空)"
                  value={vlanQuery}
                  onChange={(e) => setVlanQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleVlanQuery()}
                />
                <Button onClick={handleVlanQuery} disabled={isVlanLoading}>
                  {isVlanLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                  查询
                </Button>
              </div>
              {isVlanLoading && <QueryLoading />}
              {vlanError && <QueryError message={vlanError} />}
              {!isVlanLoading && !vlanError && vlanResults.length === 0 && vlanQuery && <NoResults />}
              {!isVlanLoading && !vlanError && vlanResults.length > 0 && (
                <div className="space-y-3">
                  {vlanResults.map((vlan) => (
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
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* IP Address Query Tab */}
        <TabsContent value="ip_address">
          <Card>
            <CardHeader>
              <CardTitle>查询IP地址</CardTitle>
              <CardDescription>按IP地址 (支持 `10.0.1.*` 通配符)、分配对象或描述模糊查询。最多显示50条结果。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="例如 Server01 或 10.0.1.*"
                  value={ipQuery}
                  onChange={(e) => setIpQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleIpQuery()}
                />
                <Button onClick={handleIpQuery} disabled={isIpLoading}>
                  {isIpLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                  查询
                </Button>
              </div>
              {isIpLoading && <QueryLoading />}
              {ipError && <QueryError message={ipError} />}
              {!isIpLoading && !ipError && ipResults.length === 0 && ipQuery && <NoResults />}
              {!isIpLoading && !ipError && ipResults.length > 0 && (
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
                    {ipResults.map((ip) => (
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
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
