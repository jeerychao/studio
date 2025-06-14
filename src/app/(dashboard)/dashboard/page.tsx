
import * as React from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LayoutDashboard, Users, Network, Cable, Link2, Server, DownloadCloud, AlertTriangle, Percent, Palette, FileText, Sigma, Users2, Waypoints, CreditCard, HardDrive, SlidersHorizontal, Search, Globe } from "lucide-react";
import { useCurrentUser, hasPermission } from "@/hooks/use-current-user";
import { PERMISSIONS, type DashboardData } from "@/types";
import { getDashboardDataAction } from "@/lib/actions";
import { IPStatusPieChart } from "@/components/dashboard/ip-status-pie-chart";
import { UsageBarChart } from "@/components/dashboard/usage-bar-chart";
import { VlanResourceBarChart } from "@/components/dashboard/vlan-resource-bar-chart";
import { Badge } from "@/components/ui/badge";
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

const CHART_COLORS_REMAINDER = [
  "hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))",
  "hsl(var(--chart-4))", "hsl(var(--chart-5))", "hsl(var(--muted))"
];

function DashboardStatCard({ title, value, icon, description, link, linkText }: { title: string, value: string | number, icon: React.ElementType, description?: string, link?: string, linkText?: string }) {
  const IconComponent = icon;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <IconComponent className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
        {link && linkText && (
          <Button variant="link" asChild className="px-0 pt-1 text-xs h-auto">
            <Link href={link}>{linkText}</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { currentUser } = useCurrentUser();
  const [dashboardData, setDashboardData] = React.useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    async function fetchData() {
      if (!currentUser || !hasPermission(currentUser, PERMISSIONS.VIEW_DASHBOARD)) {
        setIsLoading(false);
        return;
      }
      try {
        setIsLoading(true);
        const response = await getDashboardDataAction();
        if (response.success && response.data) {
          setDashboardData(response.data);
        } else {
          setError(response.error?.userMessage || "无法加载仪表盘数据。");
        }
      } catch (e) {
        setError((e as Error).message || "加载数据时发生未知错误。");
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, [currentUser]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <LayoutDashboard className="h-12 w-12 animate-ping text-primary" />
        <p className="ml-3 text-lg">加载仪表盘数据...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-4">
        <AlertTriangle className="h-12 w-12 text-destructive mb-3" />
        <h2 className="text-xl font-semibold text-destructive mb-2">加载仪表盘数据失败</h2>
        <p className="text-muted-foreground mb-4">{error}</p>
        <p className="text-xs text-muted-foreground">请尝试刷新页面或稍后再试。如果问题持续存在，请联系管理员。</p>
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
        <Sigma className="h-12 w-12 text-muted-foreground mb-3" />
        <p className="text-muted-foreground">仪表盘数据当前不可用。</p>
      </div>
    );
  }
  
  const ipStatusChartData = [
    { name: "已分配", value: dashboardData.ipStatusCounts.allocated, fill: "hsl(var(--chart-1))" },
    { name: "空闲", value: dashboardData.ipStatusCounts.free, fill: "hsl(var(--chart-2))" },
    { name: "预留", value: dashboardData.ipStatusCounts.reserved, fill: "hsl(var(--chart-3))" },
  ];

  const busiestVlansForChart = dashboardData.busiestVlans.map((vlan, index) => ({
    name: `VLAN ${vlan.vlanNumber}${vlan.name ? ` (${vlan.name.substring(0,15)+(vlan.name.length > 15 ? '...' : '')})` : ''}`, // Ensure name is suitable for chart
    "资源数": vlan.resourceCount,
    fill: CHART_COLORS_REMAINDER[index % CHART_COLORS_REMAINDER.length]
  }));

  return (
    <>
      <PageHeader title="系统仪表盘" description="IPAM Lite 系统概览与关键指标。" icon={<LayoutDashboard className="h-6 w-6 text-primary" />} />
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
        <DashboardStatCard title="总 IP 地址数" value={dashboardData.totalIpCount} icon={Globe} link="/ip-addresses" linkText="管理IP地址" />
        <DashboardStatCard title="总子网数" value={dashboardData.totalSubnetCount} icon={Network} link="/subnets" linkText="管理子网"/>
        <DashboardStatCard title="总 VLAN 数" value={dashboardData.totalVlanCount} icon={Cable} link="/vlans" linkText="管理VLAN"/>
        <DashboardStatCard title="系统用户数" value={(dashboardData as any).userCount || 0} icon={Users2} link="/users" linkText="管理用户" />
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">IP 地址状态分布</CardTitle>
            <CardDescription>系统中所有 IP 地址的状态概览。</CardDescription>
          </CardHeader>
          <CardContent className="h-[250px] pb-4">
            <IPStatusPieChart data={ipStatusChartData} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">按使用单位的 IP 分配排行 (Top 5)</CardTitle>
            <CardDescription>显示 IP 地址分配最多的前5个使用单位。</CardDescription>
          </CardHeader>
          <CardContent className="h-[250px] pl-2">
            <UsageBarChart data={dashboardData.ipUsageByUnit} dataKey="count" layout="vertical" yAxisWidth={100} />
          </CardContent>
        </Card>
        
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-lg">按运营商的 IP 分配排行 (Top 5)</CardTitle>
            <CardDescription>显示 IP 地址分配最多的前5个运营商。</CardDescription>
          </CardHeader>
          <CardContent className="h-[250px] pb-4">
             <UsageBarChart data={dashboardData.ipUsageByOperator} dataKey="count" layout="horizontal" chartMargin={{ bottom: 70, left: 5, right: 30, top: 5 }} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">最繁忙的 VLAN (Top 5 资源数)</CardTitle>
            <CardDescription>显示关联资源（子网和直接IP）最多的前5个VLAN。</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px] pb-4">
            <VlanResourceBarChart data={busiestVlansForChart} />
          </CardContent>
        </Card>
        
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">高利用率子网 (Top 5)</CardTitle>
            <CardDescription>利用率超过80%的子网，按利用率降序排列。</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            {dashboardData.subnetsNeedingAttention.length > 0 ? (
              <ScrollArea className="h-full">
                <ul className="space-y-3">
                  {dashboardData.subnetsNeedingAttention.map(subnet => (
                    <li key={subnet.id} className="flex items-center justify-between p-2.5 rounded-md border bg-card hover:bg-muted/50 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" title={subnet.name ? `${subnet.cidr} (${subnet.name})` : subnet.cidr}>
                          {subnet.name ? `${subnet.cidr} (${subnet.name})` : subnet.cidr}
                        </p>
                        <p className="text-xs text-muted-foreground">利用率: <Badge variant="destructive">{subnet.utilization}%</Badge></p>
                      </div>
                      <Button variant="outline" size="sm" asChild className="ml-2 shrink-0">
                        <Link href={`/ip-addresses?subnetId=${subnet.id}`}>查看</Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-sm text-muted-foreground">目前没有高利用率子网。</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
