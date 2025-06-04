
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { getSubnetsAction, getIPAddressesAction, getAuditLogsAction } from "@/lib/actions";
import { cidrToPrefix, getUsableIpCount } from "@/lib/ip-utils";
import { Network, Globe, Users, Activity, AlertTriangle, ArrowUpRight } from "lucide-react";
import Link from "next/link";

export default async function DashboardPage() {
  try {
    const subnetsResponse = await getSubnetsAction(); 
    const ipsResponse = await getIPAddressesAction();   
    const auditLogsResponse = await getAuditLogsAction({ page: 1, pageSize: 5 });

    const subnetsForProcessing = Array.isArray(subnetsResponse.data) ? subnetsResponse.data : [];
    const allIpsForProcessing = Array.isArray(ipsResponse.data) ? ipsResponse.data : [];
    const recentLogsForDisplay = Array.isArray(auditLogsResponse.data) ? auditLogsResponse.data : [];

    const totalSubnetCount = subnetsResponse.totalCount;

    const totalIPs = subnetsForProcessing.reduce((acc, subnet) => {
      if (subnet && typeof subnet.cidr === 'string') {
        try {
          const prefix = cidrToPrefix(subnet.cidr);
          return acc + getUsableIpCount(prefix);
        } catch (e) {
          const error = e instanceof Error ? e : new Error(String(e));
          console.error(`DashboardPage: Error processing CIDR '${subnet.cidr}' for subnet ID '${subnet.id}' during totalIPs calculation: ${error.message}`);
          return acc;
        }
      }
      return acc;
    }, 0);

    const allocatedIPsCount = allIpsForProcessing.filter(ip => ip && ip.status === 'allocated').length;
    const utilizationPercentage = totalIPs > 0 ? Math.round((allocatedIPsCount / totalIPs) * 100) : 0;

    const criticalSubnets = subnetsForProcessing.filter(s => s && (s.utilization ?? 0) > 85);

    return (
      <div className="flex flex-col gap-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">子网总数</CardTitle>
              <Network className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalSubnetCount}</div>
              <p className="text-xs text-muted-foreground">受管网络段</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">可用 IP 总数</CardTitle>
              <Globe className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalIPs.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">预估可用 IP</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">已分配 IP</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{allocatedIPsCount}</div>
              <p className="text-xs text-muted-foreground">当前已使用</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">网络利用率</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{utilizationPercentage}%</div>
              <Progress value={utilizationPercentage} className="mt-2 h-2" />
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>最近活动</CardTitle>
              <CardDescription>系统中执行的最新操作。</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>用户</TableHead>
                    <TableHead>操作</TableHead>
                    <TableHead>详情</TableHead>
                    <TableHead className="text-right">时间戳</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentLogsForDisplay.map((log) => {
                    if (!log || !log.id) return null;
                    return (
                    <TableRow key={log.id}>
                      <TableCell>
                        <div className="font-medium">{log.username || "系统"}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">{log.action.replace(/_/g, " ")}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">{log.details}</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {new Date(log.timestamp).toLocaleTimeString()}
                        <span className="block">{new Date(log.timestamp).toLocaleDateString()}</span>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
               <Button variant="outline" size="sm" className="mt-4 w-full" asChild>
                  <Link href="/audit-logs">查看所有日志</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                子网健康状况
              </CardTitle>
              <CardDescription>即将达到容量上限的子网。</CardDescription>
            </CardHeader>
            <CardContent>
              {criticalSubnets.length > 0 ? (
                <ul className="space-y-3">
                  {criticalSubnets.map(subnet => {
                    if (!subnet || !subnet.id) return null;
                    let prefixDisplay: string | number = 'N/A';
                    if (subnet.cidr && typeof subnet.cidr === 'string') {
                      try {
                        prefixDisplay = cidrToPrefix(subnet.cidr);
                      } catch (prefixErr) {
                        const pError = prefixErr instanceof Error ? prefixErr : new Error(String(prefixErr));
                        console.warn(`DashboardPage: Error parsing prefix for subnet CIDR '${subnet.cidr}' in Subnet Health card: ${pError.message}`);
                        prefixDisplay = '无效';
                      }
                    }
                    return (
                    <li key={subnet.id} className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{subnet.networkAddress}/{prefixDisplay}</p>
                        <p className="text-sm text-muted-foreground">{subnet.description || '无描述'}</p>
                      </div>
                      <div className="text-right">
                         <Badge variant={ (subnet.utilization ?? 0) > 95 ? "destructive" : "secondary"}>{(subnet.utilization ?? 0)}% 已使用</Badge>
                         <Link href={`/ip-addresses?subnetId=${subnet.id}`}>
                            <Button variant="ghost" size="sm" className="text-xs mt-1">管理 IP <ArrowUpRight className="h-3 w-3 ml-1" /></Button>
                         </Link>
                      </div>
                    </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">没有子网处于严重利用状态。</p>
              )}
               <Button variant="outline" size="sm" className="mt-4 w-full" asChild>
                  <Link href="/subnets">查看所有子网</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  } catch (e) {
    let processedError: Error;
    if (e instanceof Error) {
      processedError = e;
    } else if (typeof e === 'string') {
      processedError = new Error(e);
    } else if (e === null || e === undefined) {
      processedError = new Error("仪表盘页面发生未知 null 或 undefined 错误。");
    } else {
      try {
        processedError = new Error(JSON.stringify(e));
      } catch (stringifyError) {
        processedError = new Error("仪表盘页面发生未知不可序列化错误。");
      }
    }
    console.error("仪表盘页面内部服务器错误:", processedError.message, processedError.stack);
    return (
      <div className="flex flex-col items-center justify-center h-full p-4">
        <AlertTriangle className="h-16 w-16 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2 text-destructive">仪表盘错误</h2>
        <p className="text-muted-foreground mb-2">加载仪表盘数据时出错：</p>
        <p className="text-sm text-destructive bg-destructive/10 p-2 rounded-md">{processedError.message}</p>
        <p className="text-xs text-muted-foreground mt-4">请检查服务器日志获取更多详情或稍后再试。</p>
      </div>
    );
  }
}
