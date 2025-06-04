
"use client"; 

import * as React from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileDown, DownloadCloud, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser, hasPermission } from "@/hooks/use-current-user";
import { PERMISSIONS } from "@/types";
import type { Subnet, VLAN, IPAddress } from "@/types";
import { getSubnetsAction, getVLANsAction, getIPAddressesAction } from "@/lib/actions";


export default function ImportExportPage() {
  const { toast } = useToast();
  const { currentUser, isAuthLoading } = useCurrentUser();
  const [isExporting, setIsExporting] = React.useState<false | "subnets" | "vlans" | "ips" | "all">(false);

  const handleExport = async (dataType: "subnets" | "vlans" | "ips" | "all") => {
    if (isAuthLoading || !currentUser) { 
        toast({ title: "认证错误", description: "请稍候或尝试重新登录。", variant: "destructive" });
        return;
    }
    if (!hasPermission(currentUser, PERMISSIONS.PERFORM_TOOLS_EXPORT)) {
        toast({ title: "权限被拒绝", description: "您没有权限导出数据。", variant: "destructive" });
        return;
    }

    setIsExporting(dataType);
    let dataToExport: any[] = [];
    let filename = `${dataType}_export.csv`;
    let csvContent = "";
    let csvHeaders: string[] = [];

    const convertToCSV = (data: any[], headersToUse: string[]) => {
      let csv = headersToUse.join(",") + "\n";
      data.forEach(row => {
        csv += headersToUse.map(header => JSON.stringify(row[header as keyof typeof row] ?? "")).join(",") + "\n";
      });
      return csv;
    };

    try {
      if (dataType === "subnets" || dataType === "all") {
        const subnetsResponse = await getSubnetsAction(); // Fetch all
        const subnetsForCsv = subnetsResponse.data.map(subnet => ({
          id: subnet.id,
          cidr: subnet.cidr,
          networkAddress: subnet.networkAddress,
          subnetMask: subnet.subnetMask,
          ipRange: subnet.ipRange || "",
          vlanNumber: (subnet as any).vlan?.vlanNumber?.toString() ?? "", // Assuming getSubnetsAction includes vlan: {select: {vlanNumber:true}}
          description: subnet.description || "",
          utilization: subnet.utilization || 0, 
        }));
        if (dataType === "subnets") {
            dataToExport = subnetsForCsv;
            csvHeaders = ["id", "cidr", "networkAddress", "subnetMask", "ipRange", "vlanNumber", "description", "utilization"];
        } else { // for "all"
            dataToExport.push(...subnetsForCsv.map(s => ({type: 'subnet', ...s})));
        }
      }
      
      if (dataType === "vlans" || dataType === "all") {
        const vlansResponse = await getVLANsAction(); // Fetch all
        const vlansForCsv = vlansResponse.data.map(vlan => ({
          id: vlan.id,
          vlanNumber: vlan.vlanNumber,
          description: vlan.description || "",
          subnetCount: vlan.subnetCount || 0, 
        }));
         if (dataType === "vlans") {
            dataToExport = vlansForCsv;
            csvHeaders = ["id", "vlanNumber", "description", "subnetCount"];
        } else { // for "all"
            dataToExport.push(...vlansForCsv.map(v => ({type: 'vlan', ...v})));
        }
      }
      
      if (dataType === "ips" || dataType === "all") {
        const ipsResponse = await getIPAddressesAction(); // Fetch all
        const ipsForCsv = ipsResponse.data.map(ip => {
            let effectiveVlanNumberStr = "";
            if (ip.vlan?.vlanNumber) { // Direct VLAN on IP
                effectiveVlanNumberStr = ip.vlan.vlanNumber.toString();
            } else if (ip.subnet?.vlan?.vlanNumber) { // VLAN inherited from subnet
                effectiveVlanNumberStr = ip.subnet.vlan.vlanNumber.toString();
            }
            return {
                id: ip.id,
                ipAddress: ip.ipAddress,
                subnetId: ip.subnetId || "",
                subnetCidr: ip.subnet?.cidr || "",
                vlanNumber: effectiveVlanNumberStr,
                status: ip.status,
                allocatedTo: ip.allocatedTo || "",
                description: ip.description || "",
            };
        });
        if (dataType === "ips") {
            dataToExport = ipsForCsv;
            csvHeaders = ["id", "ipAddress", "subnetId", "subnetCidr", "vlanNumber", "status", "allocatedTo", "description"];
        } else { // for "all"
             dataToExport.push(...ipsForCsv.map(i => ({type: 'ipaddress', ...i})));
        }
      }

      if (dataType === "all") {
        // For "all", we don't generate a single CSV directly here,
        // as structures are different. We'd typically create a zip or multiple files.
        // For this example, we'll just simulate it or consider a JSON export.
        // For simplicity, we'll just toast a message and not generate a combined file.
        if (dataToExport.length > 0) {
            filename = `ipam_lite_all_data_export.json`; // Changed to JSON for "all"
            csvContent = JSON.stringify(dataToExport, null, 2);
        } else {
            toast({ title: "无数据", description: "系统中没有可导出的数据。" });
            setIsExporting(false);
            return;
        }
      } else { // For specific types
        if (dataToExport.length === 0) {
            toast({ title: "无数据", description: `没有可用于导出的 ${dataType === "ips" ? "IP 地址" : dataType === "subnets" ? "子网" : "VLAN"} 数据。`});
            setIsExporting(false);
            return;
        }
        csvContent = convertToCSV(dataToExport, csvHeaders);
      }


      const blob = new Blob([csvContent], { type: dataType === 'all' ? 'application/json;charset=utf-8;' : 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast({ title: "导出已开始", description: `${filename} 正在下载。` });
      } else {
          toast({ title: "导出失败", description: "浏览器不支持直接下载。", variant: "destructive"});
      }

    } catch (error) {
        toast({ title: "导出错误", description: (error as Error).message, variant: "destructive"});
    } finally {
        setIsExporting(false);
    }
  };
  
  if (isAuthLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <DownloadCloud className="h-16 w-16 animate-spin text-primary mb-4" />
        <h2 className="text-2xl font-semibold mb-2">加载数据导出工具中...</h2>
      </div>
    );
  }

  if (!currentUser || !hasPermission(currentUser, PERMISSIONS.VIEW_TOOLS_IMPORT_EXPORT)) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <DownloadCloud className="h-16 w-16 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2">访问被拒绝</h2>
        <p className="text-muted-foreground">您没有权限查看数据导出工具。</p>
      </div>
    );
  }
  
  const canExport = currentUser && hasPermission(currentUser, PERMISSIONS.PERFORM_TOOLS_EXPORT);

  return (
    <>
      <PageHeader
        title="数据导出"
        description="将您当前的 IPAM 数据下载为 CSV 或 JSON 文件。导出的数据基于系统中的实时数据库。"
        icon={FileDown}
      />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><DownloadCloud className="h-6 w-6 text-primary" /> 导出数据</CardTitle>
          <CardDescription>
            选择要导出的数据类型。导出的数据为 CSV 格式 (特定类型) 或 JSON 格式 (全部数据)，基于系统当前的实时数据库。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">选择要导出的数据类型:</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Button variant="outline" onClick={() => handleExport("subnets")} className="w-full" disabled={!canExport || isExporting === "subnets"}>
                {isExporting === "subnets" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
                导出子网 (CSV)
              </Button>
              <Button variant="outline" onClick={() => handleExport("vlans")} className="w-full" disabled={!canExport || isExporting === "vlans"}>
                {isExporting === "vlans" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
                导出VLAN (CSV)
              </Button>
              <Button variant="outline" onClick={() => handleExport("ips")} className="w-full" disabled={!canExport || isExporting === "ips"}>
                {isExporting === "ips" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
                导出IP地址 (CSV)
              </Button>
              <Button variant="outline" onClick={() => handleExport("all")} className="w-full sm:col-span-2" disabled={!canExport || isExporting === "all"}>
                {isExporting === "all" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
                导出所有数据 (JSON)
              </Button>
          </div>
          {!canExport && <p className="text-xs text-destructive mt-2">您没有权限导出数据。</p>}
        </CardContent>
      </Card>
    </>
  );
}

    