
"use client";

import * as React from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LayoutDashboard, Cable, Globe, Percent, AlertTriangle, Loader2, Network as NetworkIcon } from "lucide-react";
import { useCurrentUser, hasPermission } from "@/hooks/use-current-user";
import { PERMISSIONS } from "@/types";
import { getIPAddressesAction, getVLANsAction, getSubnetsAction } from "@/lib/actions";
import type { ActionResponse } from "@/lib/actions"; // For PaginatedResponse if used directly

interface DashboardStatCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  description?: string;
}

function DashboardStatCard({ title, value, icon: IconComponent, description }: DashboardStatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <IconComponent className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </CardContent>
    </Card>
  );
}

interface DashboardStats {
  totalIpCount: number;
  usedIpCount: number;
  freeIpCount: number;
  ipUsagePercentage: number;
  totalVlanCount: number;
  totalSubnetCount: number;
}

export default function DashboardPage() {
  const { currentUser, isAuthLoading } = useCurrentUser();
  const [stats, setStats] = React.useState<DashboardStats | null>(null);
  const [isLoadingData, setIsLoadingData] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    async function fetchData() {
      if (isAuthLoading || !currentUser) {
        return;
      }
      setIsLoadingData(true);
      setError(null);

      if (!hasPermission(currentUser, PERMISSIONS.VIEW_DASHBOARD)) {
        setError("您没有权限查看仪表盘。");
        setIsLoadingData(false);
        setStats(null);
        return;
      }

      try {
        // Fetch all data for counts.
        // These actions will fetch all items if pagination params are omitted.
        const [ipsResult, vlansResult, subnetsResult] = await Promise.all([
          getIPAddressesAction({}), 
          getVLANsAction({}),    
          getSubnetsAction({})     
        ]);

        const allIps = ipsResult.data || [];
        const totalIpCount = allIps.length; // totalCount from action if paginated, or data.length if all fetched
        const usedIpCount = allIps.filter(ip => ip.status === 'allocated').length;
        const freeIpCount = allIps.filter(ip => ip.status === 'free' || ip.status === 'reserved').length;
        const ipUsagePercentage = totalIpCount > 0 ? Math.round((usedIpCount / totalIpCount) * 100) : 0;

        const totalVlanCount = vlansResult.totalCount || (vlansResult.data?.length || 0);
        const totalSubnetCount = subnetsResult.totalCount || (subnetsResult.data?.length || 0);
        
        setStats({
          totalIpCount,
          usedIpCount,
          freeIpCount,
          ipUsagePercentage,
          totalVlanCount,
          totalSubnetCount,
        });

      } catch (e) {
        setError((e as Error).message || "加载仪表盘数据时发生未知错误。");
        setStats(null);
      } finally {
        setIsLoadingData(false);
      }
    }
    fetchData();
  }, [currentUser, isAuthLoading]);

  if (isAuthLoading || (isLoadingData && !stats && !error)) {
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
        {error !== "您没有权限查看仪表盘。" &&
          <p className="text-xs text-muted-foreground">请尝试刷新页面或稍后再试。</p>
        }
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

  if (!stats) {
    // This case implies isLoadingData is false, no error, but stats is null.
    // Could be due to an issue in data transformation or unexpected API response.
    return (
      <div className="flex items-center justify-center h-full text-center p-4">
        <Loader2 className="h-12 w-12 text-muted-foreground mb-3 animate-spin" />
        <p className="text-muted-foreground">仪表盘数据当前不可用或正在处理。</p>
      </div>
    );
  }

  return (
    <>
      <PageHeader title="系统仪表盘" description="IPAM Lite 系统概览与关键指标。" icon={<LayoutDashboard className="h-6 w-6 text-primary" />} />
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
        <DashboardStatCard title="总 IP 地址数" value={stats.totalIpCount} icon={Globe} />
        <DashboardStatCard 
            title="IP 地址使用情况" 
            value={`${stats.usedIpCount} 已用 / ${stats.freeIpCount} 可用`} 
            icon={Percent} 
            description={`使用率: ${stats.ipUsagePercentage}%`}
        />
        <DashboardStatCard title="总 VLAN 数" value={stats.totalVlanCount} icon={Cable} />
        <DashboardStatCard title="总子网数" value={stats.totalSubnetCount} icon={NetworkIcon} />
      </div>
      
      <div className="text-center p-8 text-muted-foreground mt-6">
        <p className="text-sm">(核心数据展示区域和动态信息区域，如IP状态分布、使用单位排行等，将在此处进一步实现)</p>
      </div>
    </>
  );
}

