
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { getSubnetsAction, getIPAddressesAction, getAuditLogsAction } from "@/lib/actions";
// Ensure correct imports from ip-utils
import { getUsableIpCount, getSubnetPropertiesFromCidr, getPrefixFromCidr } from "@/lib/ip-utils";
import Link from "next/link";
import Image from "next/image";
import { logger } from "@/lib/logger";
import type { AppError } from "@/lib/errors"; // Import AppError for type checking

export default async function DashboardPage() {
  try {
    // These actions should ideally not throw errors that break the page,
    // but rather return data or a well-structured error/empty state.
    // If getSubnetsAction throws, the catch block below will handle it.
    const subnetsResponse = await getSubnetsAction();
    const ipsResponse = await getIPAddressesAction();
    const auditLogsResponse = await getAuditLogsAction({ page: 1, pageSize: 5 });

    const subnetsForProcessing = Array.isArray(subnetsResponse.data) ? subnetsResponse.data : [];
    const allIpsForProcessing = Array.isArray(ipsResponse.data) ? ipsResponse.data : [];
    const recentLogsForDisplay = Array.isArray(auditLogsResponse.data) ? auditLogsResponse.data : [];

    const totalSubnetCount = subnetsResponse.totalCount;

    const totalIPs = subnetsForProcessing.reduce((acc, subnet) => {
      if (subnet && typeof subnet.cidr === 'string') {
        // Use getSubnetPropertiesFromCidr to safely parse and get prefix
        const props = getSubnetPropertiesFromCidr(subnet.cidr);
        if (props && typeof props.prefix === 'number') {
          return acc + getUsableIpCount(props.prefix);
        } else {
          logger.warn(`[DashboardPage] Could not parse CIDR properties or get prefix for '${subnet.cidr}' during totalIPs calculation.`, undefined, { subnetId: subnet.id });
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
              <Image src="/images/dashboard_placeholders/network_icon.png" alt="Network Icon" width={20} height={20} className="text-muted-foreground" data-ai-hint="network icon" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalSubnetCount}</div>
              <p className="text-xs text-muted-foreground">受管网络段</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">可用 IP 总数</CardTitle>
              <Image src="/images/dashboard_placeholders/globe_icon.png" alt="Globe Icon" width={20} height={20} className="text-muted-foreground" data-ai-hint="globe icon" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalIPs.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">预估可用 IP</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">已分配 IP</CardTitle>
              <Image src="/images/dashboard_placeholders/users_icon.png" alt="Users Icon" width={20} height={20} className="text-muted-foreground" data-ai-hint="users icon" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{allocatedIPsCount}</div>
              <p className="text-xs text-muted-foreground">当前已使用</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">网络利用率</CardTitle>
              <Image src="/images/dashboard_placeholders/activity_icon.png" alt="Activity Icon" width={20} height={20} className="text-muted-foreground" data-ai-hint="activity pulse icon" />
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
                <Image src="/images/dashboard_placeholders/alert_triangle_icon.png" alt="Alert Icon" width={20} height={20} className="text-destructive" data-ai-hint="warning alert icon" />
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
                        // Use getSubnetPropertiesFromCidr for safer prefix extraction
                        const props = getSubnetPropertiesFromCidr(subnet.cidr);
                        if (props && typeof props.prefix === 'number') {
                            prefixDisplay = props.prefix;
                        } else {
                            prefixDisplay = '无效'; // CIDR format might be wrong for parsing properties
                            logger.warn(`[DashboardPage] Could not parse CIDR properties for '${subnet.cidr}' in Subnet Health card.`, undefined, { subnetId: subnet.id });
                        }
                      } catch (parseErr) { // Catch if getSubnetPropertiesFromCidr itself throws (should be rare now)
                        const pError = parseErr instanceof Error ? parseErr : new Error(String(parseErr));
                        logger.warn(`[DashboardPage] Error parsing properties for subnet CIDR '${subnet.cidr}' in Subnet Health card: ${pError.message}`, pError, { subnetId: subnet.id });
                        prefixDisplay = '解析错误';
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
                            <Button variant="ghost" size="sm" className="text-xs mt-1">管理 IP
                              <Image src="/images/dashboard_placeholders/arrow_up_right_icon.png" alt="Manage IP" width={12} height={12} className="ml-1" data-ai-hint="arrow up right" />
                            </Button>
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
  } catch (e: unknown) { // Catch errors from await getSubnetsAction() etc.
    let processedError: Error;
    let userDisplayMessage: string;

    if (e instanceof Error) {
      processedError = e;
      // Check if it's an AppError with a userMessage, otherwise use the raw message
      userDisplayMessage = (e as AppError).userMessage || e.message;
    } else if (typeof e === 'string') {
      processedError = new Error(e);
      userDisplayMessage = e;
    } else if (e === null || e === undefined) {
      processedError = new Error("仪表盘页面发生未知 null 或 undefined 错误。");
      userDisplayMessage = "发生未知错误。";
    } else {
      try {
        processedError = new Error(JSON.stringify(e));
        userDisplayMessage = "发生序列化错误。";
      } catch (stringifyError) {
        processedError = new Error("仪表盘页面发生未知不可序列化错误。");
        userDisplayMessage = "发生未知且不可序列化的错误。";
      }
    }
    logger.error("[DashboardPage] Server Component render error:", processedError, { stack: processedError.stack, originalError: e });

    return (
      <div className="flex flex-col items-center justify-center h-full p-4">
        <Image src="/images/dashboard_placeholders/alert_triangle_icon.png" alt="Error" width={64} height={64} className="mb-4 text-destructive" data-ai-hint="error warning icon" />
        <h2 className="text-2xl font-semibold mb-2 text-destructive">仪表盘错误</h2>
        <p className="text-muted-foreground mb-2">加载仪表盘数据时出错：</p>
        <p className="text-sm text-destructive bg-destructive/10 p-2 rounded-md">{userDisplayMessage}</p>
        <p className="text-xs text-muted-foreground mt-4">请检查服务器日志获取更多详情或稍后再试。</p>
      </div>
    );
  }
}
