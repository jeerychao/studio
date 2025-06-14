
import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { getDashboardDataAction, getAuditLogsAction } from "@/lib/actions";
import type { DashboardData, AuditLog } from "@/types";
import { PageHeader } from "@/components/page-header";
import Link from "next/link";
import { TrendingUp, FilePieChart, Cable, Globe, ListChecks, AlertTriangle, LayoutDashboard } from "lucide-react";
import { logger } from "@/lib/logger";
import type { AppError } from "@/lib/errors";
import { DASHBOARD_TOP_N_COUNT, DASHBOARD_AUDIT_LOG_COUNT } from "@/lib/constants";

// Import new client-side chart components
import { IPStatusPieChart } from "@/components/dashboard/ip-status-pie-chart";
import { UsageBarChart } from "@/components/dashboard/usage-bar-chart";
import { VlanResourceBarChart } from "@/components/dashboard/vlan-resource-bar-chart";


export default async function DashboardPage() {
  let dashboardData: DashboardData | null = null;
  let recentLogs: AuditLog[] = [];
  let fetchError: string | null = null;

  try {
    const [dashboardDataResult, auditLogsResult] = await Promise.all([
      getDashboardDataAction(),
      getAuditLogsAction({ page: 1, pageSize: DASHBOARD_AUDIT_LOG_COUNT })
    ]);

    if (dashboardDataResult.success && dashboardDataResult.data) {
      dashboardData = dashboardDataResult.data;
    } else {
      logger.error("[DashboardPage] Failed to load dashboard overview data.", undefined, { error: dashboardDataResult.error });
      throw new Error(dashboardDataResult.error?.userMessage || "无法加载仪表盘概览数据。");
    }

    if (auditLogsResult.data) {
      recentLogs = auditLogsResult.data;
    } else {
      logger.warn("[DashboardPage] Failed to load recent audit logs.", undefined, { error: (auditLogsResult as any).error });
    }

  } catch (e: unknown) {
    let processedError: Error;
    if (e instanceof Error) {
      processedError = e;
      fetchError = (e as AppError).userMessage || e.message;
    } else {
      processedError = new Error(String(e));
      fetchError = String(e);
    }
    logger.error("[DashboardPage] Server Component render error:", processedError, { stack: processedError.stack, originalError: e });
  }

  if (fetchError) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4">
        <AlertTriangle className="h-16 w-16 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2 text-destructive">仪表盘错误</h2>
        <p className="text-muted-foreground mb-2">加载仪表盘数据时出错：</p>
        <p className="text-sm text-destructive bg-destructive/10 p-2 rounded-md">{fetchError}</p>
        <p className="text-xs text-muted-foreground mt-4">请检查服务器日志获取更多详情或稍后再试。</p>
      </div>
    );
  }

  if (!dashboardData) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4">
        <LayoutDashboard className="h-16 w-16 text-muted-foreground animate-pulse mb-4" />
        <h2 className="text-2xl font-semibold mb-2">加载仪表盘数据中...</h2>
        <p className="text-muted-foreground">请稍候。</p>
      </div>
    );
  }

  const {
    totalIpCount,
    ipStatusCounts,
    totalVlanCount,
    totalSubnetCount,
    ipUsageByUnit,
    ipUsageByOperator,
    vlanResourceCounts,
    busiestVlans,
    unusedVlanCount
  } = dashboardData;

  const allocatedIps = ipStatusCounts.allocated;
  const freeIps = ipStatusCounts.free;
  const reservedIps = ipStatusCounts.reserved;
  const unusedIpTotal = freeIps + reservedIps;
  const totalKnownStatusIps = allocatedIps + unusedIpTotal;
  const ipUtilizationPercentage = totalKnownStatusIps > 0 ? Math.round((allocatedIps / totalKnownStatusIps) * 100) : 0;

  const ipStatusChartData = [
    { name: '已分配', value: allocatedIps, fill: "hsl(var(--chart-1))" },
    { name: '空闲', value: freeIps, fill: "hsl(var(--chart-2))"  },
    { name: '预留', value: reservedIps, fill: "hsl(var(--chart-3))"  },
  ];
  
  const CHART_COLORS_REMAINDER = [
    "hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))",
    "hsl(var(--chart-4))", "hsl(var(--chart-5))", "hsl(var(--muted))"
  ];
  
  const ipUsageByUnitChartData = ipUsageByUnit.map((item, index) => ({
    ...item, // contains name and count (which is 'value' for chart)
    name: item.item, // ensure 'name' field for chart
    value: item.count, // ensure 'value' field for chart
    fill: CHART_COLORS_REMAINDER[index % CHART_COLORS_REMAINDER.length]
  }));

  const ipUsageByOperatorChartData = ipUsageByOperator.map((item, index) => ({
    ...item,
    name: item.item,
    value: item.count,
    fill: CHART_COLORS_REMAINDER[index % CHART_COLORS_REMAINDER.length]
  }));
  
  const vlanResourceChartData = [...vlanResourceCounts]
    .sort((a, b) => b.resourceCount - a.resourceCount)
    .slice(0, 10) // Show top 10
    .map((vlan, index) => ({
      name: vlan.name ? `${vlan.name} (VLAN ${vlan.vlanNumber})` : `VLAN ${vlan.vlanNumber}`,
      "资源数": vlan.resourceCount, // Key for the Bar
      fill: CHART_COLORS_REMAINDER[index % CHART_COLORS_REMAINDER.length]
    }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="仪表盘" description="系统状态概览和关键指标。" icon={<LayoutDashboard className="h-6 w-6 text-primary" />} />
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">总 IP 地址数量</CardTitle>
            <TrendingUp className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalIpCount.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">数据库中记录的总 IP 数</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">IP 使用率</CardTitle>
            <FilePieChart className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{ipUtilizationPercentage}%</div>
            <p className="text-xs text-muted-foreground">{allocatedIps.toLocaleString()} 已分配 / {unusedIpTotal.toLocaleString()} 未使用</p>
            <Progress value={ipUtilizationPercentage} className="mt-2 h-2" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">VLAN 总数</CardTitle>
            <Cable className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalVlanCount.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">已配置的 VLAN 总数</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">子网总数</CardTitle>
            <Globe className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalSubnetCount.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">已配置的子网总数</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>IP 地址状态分布</CardTitle>
            <CardDescription>按已分配、空闲和预留状态显示 IP 地址。</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px] md:h-[350px]">
            <IPStatusPieChart data={ipStatusChartData} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>按使用单位的 IP 分布 (Top {DASHBOARD_TOP_N_COUNT})</CardTitle>
            <CardDescription>显示 IP 地址数量最多的前 {DASHBOARD_TOP_N_COUNT} 个使用单位。</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px] md:h-[350px]">
            <UsageBarChart data={ipUsageByUnitChartData} dataKey="value" layout="vertical" yAxisWidth={100} />
          </CardContent>
        </Card>
      </div>
      
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>按运营商的 IP 分布 (Top {DASHBOARD_TOP_N_COUNT})</CardTitle>
            <CardDescription>显示 IP 地址数量最多的前 {DASHBOARD_TOP_N_COUNT} 个运营商。</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px] md:h-[350px]">
            <UsageBarChart data={ipUsageByOperatorChartData} dataKey="value" layout="vertical" yAxisWidth={100} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>VLAN 资源分布 (Top 10)</CardTitle>
            <CardDescription>显示关联资源数（子网+直接IP）最多的前10个VLAN。</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px] md:h-[350px]">
            <VlanResourceBarChart data={vlanResourceChartData} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>最繁忙的 VLAN (Top {DASHBOARD_TOP_N_COUNT})</CardTitle>
            <CardDescription>按关联的子网和直接 IP 地址总数排名。</CardDescription>
          </CardHeader>
          <CardContent>
            {busiestVlans.length > 0 ? (
              <ul className="space-y-2">
                {busiestVlans.map(vlan => (
                  <li key={vlan.id} className="flex justify-between items-center text-sm p-2 rounded-md hover:bg-muted/50">
                    <span>VLAN {vlan.vlanNumber} {vlan.name ? `(${vlan.name})` : ''}</span>
                    <Badge variant="secondary">{vlan.resourceCount} 个资源</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">没有繁忙的 VLAN 数据。</p>
            )}
             <Button variant="outline" size="sm" className="mt-4 w-full" asChild>
                <Link href="/vlans">查看所有 VLAN</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>未使用的 VLAN</CardTitle>
            <CardDescription>当前没有任何子网或直接 IP 地址关联的 VLAN。</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{unusedVlanCount}</div>
            <p className="text-xs text-muted-foreground">个 VLAN 当前未使用</p>
            {unusedVlanCount > 0 && (
                 <Button variant="link" size="sm" className="mt-2 p-0 h-auto" asChild>
                    {/* This link might need adjustment based on actual query page capabilities */}
                    <Link href="/query?tab=vlan&q_vlan_unused=true">查看未使用列表 (查询待实现)</Link>
                 </Button>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-1">
        <Card>
          <CardHeader>
            <CardTitle>最近活动日志</CardTitle>
            <CardDescription>系统中最近执行的 {DASHBOARD_AUDIT_LOG_COUNT} 条操作。</CardDescription>
          </CardHeader>
          <CardContent>
            {recentLogs.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>用户</TableHead>
                    <TableHead>操作</TableHead>
                    <TableHead className="max-w-[300px]">详情</TableHead>
                    <TableHead className="text-right">时间戳</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>
                        <div className="font-medium">{log.username || "系统"}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">{log.action.replace(/_/g, " ")}</Badge>
                      </TableCell>
                      <TableCell className="truncate max-w-[300px]">{log.details || "无"}</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {new Date(log.timestamp).toLocaleTimeString()}
                        <span className="block">{new Date(log.timestamp).toLocaleDateString()}</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
               <p className="text-sm text-muted-foreground py-4 text-center">暂无最近活动日志。</p>
            )}
            <Button variant="outline" size="sm" className="mt-4 w-full" asChild>
              <Link href="/audit-logs">查看所有日志</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

    