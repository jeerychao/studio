
"use client";

import * as React from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { LayoutDashboard, Globe, Cable, Network as NetworkIcon, Percent, ListChecks, AlertTriangle, Loader2 } from "lucide-react";
import { useCurrentUser, hasPermission } from "@/hooks/use-current-user";
import { PERMISSIONS, type DashboardData, type AuditLog } from "@/types";
import { getDashboardDataAction, type ActionResponse } from "@/lib/actions";
import { IPStatusPieChart } from "@/components/dashboard/ip-status-pie-chart";
import { UsageBarChart } from "@/components/dashboard/usage-bar-chart";
import { VlanResourceBarChart } from "@/components/dashboard/vlan-resource-bar-chart";
import { Badge } from "@/components/ui/badge";
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { VirtualizedSubnetTable } from "@/components/dashboard/virtualized-subnet-table";
import { CHART_COLORS_REMAINDER, DASHBOARD_AUDIT_LOG_COUNT, DASHBOARD_TOP_N_COUNT } from "@/lib/constants";

function DashboardStatCard({ title, value, icon: IconComponent, description, linkTo }: { title: string; value: string | number; icon: React.ElementType; description?: string; linkTo?: string }) {
  const cardElement = (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <IconComponent className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="flex-grow">
        <div className="text-2xl font-bold">{value}</div>
        {description && <p className="text-xs text-muted-foreground pt-1">{description}</p>}
      </CardContent>
    </Card>
  );
  return linkTo ? <Link href={linkTo} className="block h-full hover:shadow-lg transition-shadow">{cardElement}</Link> : cardElement;
}

export default function DashboardPage() {
  const { currentUser, isAuthLoading } = useCurrentUser();
  const [dashboardData, setDashboardData] = React.useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const hasFetched = React.useRef(false); // Ref to track fetch status

  React.useEffect(() => {
    // Only fetch data if auth is complete, user exists, and we haven't fetched yet.
    if (!isAuthLoading && currentUser && !hasFetched.current) {
      hasFetched.current = true; // Mark as fetched immediately to prevent re-runs

      async function fetchData() {
        setIsLoading(true);
        setError(null);

        if (!hasPermission(currentUser!, PERMISSIONS.VIEW_DASHBOARD)) {
          setError("您没有权限查看仪表盘。");
          setIsLoading(false);
          setDashboardData(null);
          return;
        }

        try {
          const response: ActionResponse<DashboardData> = await getDashboardDataAction();
          if (response.success && response.data) {
            setDashboardData(response.data);
          } else {
            setError(response.error?.userMessage || "加载仪表盘数据失败。");
            setDashboardData(null);
          }
        } catch (e) {
          setError((e as Error).message || "加载仪表盘数据时发生未知错误。");
          setDashboardData(null);
        } finally {
          setIsLoading(false);
        }
      }

      fetchData();
    }
  }, [currentUser, isAuthLoading]); // Dependencies trigger the effect, but the ref gatekeeps the fetch call.

  if (isAuthLoading || (isLoading && !dashboardData && !error)) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-3 text-lg">{isAuthLoading ? "验证用户权限..." : "加载仪表盘数据..."}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-4">
        <AlertTriangle className="h-12 w-12 text-destructive mb-3" />
        <h2 className="text-xl font-semibold text-destructive mb-2">
          {error === "您没有权限查看仪表盘。" ? "访问被拒绝" : "加载仪表盘数据失败"}
        </h2>
        <p className="text-muted-foreground mb-4">{error}</p>
        {error !== "您没有权限查看仪表盘。" && <p className="text-xs text-muted-foreground">请尝试刷新页面或稍后再试。</p>}
      </div>
    );
  }

  if (!currentUser || !hasPermission(currentUser, PERMISSIONS.VIEW_DASHBOARD)) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-4">
        <AlertTriangle className="h-12 w-12 text-destructive mb-3" />
        <h2 className="text-xl font-semibold text-destructive mb-2">访问被拒绝</h2>
        <p className="text-muted-foreground">您没有权限查看仪表盘。</p>
      </div>
    );
  }

  if (!dashboardData) {
    return (
      <div className="flex items-center justify-center h-full text-center p-4">
        <Loader2 className="h-12 w-12 text-muted-foreground mb-3 animate-spin" />
        <p className="text-muted-foreground">仪表盘数据当前不可用或正在处理。</p>
      </div>
    );
  }

  const {
    totalIpCount, ipStatusCounts, totalVlanCount, totalSubnetCount,
    ipUsageByUnit,
    busiestVlans,
    subnetsNeedingAttention,
    recentAuditLogs
  } = dashboardData;

  const ipUsagePercentage = totalIpCount > 0 ? Math.round((ipStatusCounts.allocated / totalIpCount) * 100) : 0;
  const freeAndReservedIpCount = ipStatusCounts.free + ipStatusCounts.reserved;

  const ipStatusChartData = [
    { name: "已分配", value: ipStatusCounts.allocated, fill: "hsl(var(--chart-1))" },
    { name: "空闲", value: ipStatusCounts.free, fill: "hsl(var(--chart-2))" },
    { name: "预留", value: ipStatusCounts.reserved, fill: "hsl(var(--chart-3))" },
  ];
  
  const vlanResourceChartData = busiestVlans.map((vlan, index) => ({
    name: `VLAN ${vlan.vlanNumber}${vlan.name ? ` (${vlan.name.substring(0,10)+(vlan.name.length > 10 ? '...' : '')})` : ''}`,
    "资源数": vlan.resourceCount,
    fill: CHART_COLORS_REMAINDER[index % CHART_COLORS_REMAINDER.length]
  }));


  return (
    <>
      <PageHeader title="系统仪表盘" description="IPAM Lite 系统概览与关键指标。" icon={<LayoutDashboard className="h-6 w-6 text-primary" />} />
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
        <DashboardStatCard title="总 IP 地址数" value={totalIpCount} icon={Globe} linkTo="/ip-addresses" />
        <DashboardStatCard 
            title="IP 地址使用情况" 
            value={`${ipStatusCounts.allocated} 已用 / ${freeAndReservedIpCount} 可用`} 
            icon={Percent} 
            description={`使用率: ${ipUsagePercentage}%`}
            linkTo="/ip-addresses"
        />
        <DashboardStatCard title="总 VLAN 数" value={totalVlanCount} icon={Cable} linkTo="/vlans"/>
        <DashboardStatCard title="总子网数" value={totalSubnetCount} icon={NetworkIcon} linkTo="/subnets"/>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-2 mb-6">
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle className="text-base">IP 地址状态分布</CardTitle></CardHeader>
          <CardContent className="h-[250px]"><IPStatusPieChart data={ipStatusChartData} /></CardContent>
        </Card>
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle className="text-base">按使用单位的 IP 分配 (Top {DASHBOARD_TOP_N_COUNT})</CardTitle></CardHeader>
          <CardContent className="h-[250px]"><UsageBarChart data={ipUsageByUnit} layout="vertical" yAxisWidth={120} /></CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-1 mb-6">
        <Card>
            <CardHeader>
                <CardTitle className="text-base">最繁忙的 VLAN (按资源数 Top {DASHBOARD_TOP_N_COUNT})</CardTitle>
                <CardDescription>显示关联子网和直接IP数量最多的VLAN。</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px] pl-2 pr-6 pb-6">
              <VlanResourceBarChart data={vlanResourceChartData} />
            </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">高利用率子网 (Top {DASHBOARD_TOP_N_COUNT})</CardTitle>
            <CardDescription>利用率超过 80% 的子网，可能需要关注。</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <VirtualizedSubnetTable subnets={subnetsNeedingAttention} />
            <div className="p-6 pt-2 text-right">
                <Button variant="outline" size="sm" asChild>
                    <Link href="/subnets">查看所有子网</Link>
                </Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">最近活动日志 (Top {DASHBOARD_AUDIT_LOG_COUNT})</CardTitle>
            <CardDescription>系统最近的操作记录。</CardDescription>
          </CardHeader>
          <CardContent>
            {recentAuditLogs && recentAuditLogs.length > 0 ? (
              <ScrollArea className="h-[200px]">
                <ul className="space-y-2">
                  {recentAuditLogs.map(log => (
                    <li key={log.id} className="text-xs border-b pb-1">
                      <p className="font-medium truncate">
                        <span className="text-muted-foreground">{new Date(log.timestamp).toLocaleString()}</span> - {log.username || "系统"}
                      </p>
                      <p className="text-muted-foreground truncate ml-2">操作: <Badge variant="secondary" className="capitalize text-[10px] px-1 py-0">{log.action.replace(/_/g, " ")}</Badge> - {log.details || "无详情"}</p>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">没有最近的活动日志。</p>
            )}
            <div className="mt-4 text-right">
                <Button variant="outline" size="sm" asChild>
                    <Link href="/audit-logs">查看所有日志</Link>
                </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
