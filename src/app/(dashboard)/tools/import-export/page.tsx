
"use client"; 

import * as React from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
// Input, Label, FileUp, UploadCloud, FileText, AlertCircle related to import are removed
import { FileDown, DownloadCloud } from "lucide-react"; // Kept DownloadCloud and FileDown
import { useToast } from "@/hooks/use-toast";
import { mockSubnets, mockVLANs, mockIPAddresses } from "@/lib/data"; 
import { useCurrentUser, hasPermission } from "@/hooks/use-current-user";
import { PERMISSIONS } from "@/types";
// Tabs related to import templates are removed

export default function ImportExportPage() {
  // State related to import is removed: importFile, isImporting, simulatedError
  const { toast } = useToast();
  const { currentUser, isAuthLoading } = useCurrentUser();

  // handleFileChange and handleImport functions are removed

  const handleExport = (dataType: "subnets" | "vlans" | "ips") => {
    if (isAuthLoading || !currentUser) { 
        toast({ title: "认证错误", description: "请稍候或尝试重新登录。", variant: "destructive" });
        return;
    }
    if (!hasPermission(currentUser, PERMISSIONS.PERFORM_TOOLS_EXPORT)) {
        toast({ title: "权限被拒绝", description: "您没有权限导出数据。", variant: "destructive" });
        return;
    }
    let dataToExport: any[] = [];
    let filename = `${dataType}_export.csv`;
    let csvContent = "";
    let csvHeaders: string[] = [];

    const convertToCSV = (data: any[], headersToUse: string[]) => {
      let csv = headersToUse.join(",") + "\n";
      data.forEach(row => {
        csv += headersToUse.map(header => JSON.stringify(row[header as keyof typeof row] || "")).join(",") + "\n";
      });
      return csv;
    };

    if (dataType === "subnets") {
      const subnetsForCsv = mockSubnets.map(subnet => {
        const vlan = mockVLANs.find(v => v.id === subnet.vlanId);
        return {
          id: subnet.id,
          cidr: subnet.cidr,
          networkAddress: subnet.networkAddress,
          subnetMask: subnet.subnetMask,
          ipRange: subnet.ipRange || "",
          vlanNumber: vlan ? vlan.vlanNumber.toString() : "",
          description: subnet.description || "",
          utilization: subnet.utilization || 0, 
        };
      });
      dataToExport = subnetsForCsv;
      csvHeaders = ["id", "cidr", "networkAddress", "subnetMask", "ipRange", "vlanNumber", "description", "utilization"];
      csvContent = convertToCSV(dataToExport, csvHeaders);
    } else if (dataType === "vlans") {
      dataToExport = mockVLANs.map(vlan => ({
        id: vlan.id,
        vlanNumber: vlan.vlanNumber,
        description: vlan.description || "",
        subnetCount: vlan.subnetCount || 0, 
      }));
      csvHeaders = ["id", "vlanNumber", "description", "subnetCount"];
      csvContent = convertToCSV(dataToExport, csvHeaders);
    } else if (dataType === "ips") {
      const ipsForCsv = mockIPAddresses.map(ip => {
        let effectiveVlanNumberStr = "";
        if (ip.vlanId) {
          const directVlan = mockVLANs.find(v => v.id === ip.vlanId);
          if (directVlan) effectiveVlanNumberStr = directVlan.vlanNumber.toString();
        } else if (ip.subnetId) {
          const parentSubnetForIp = mockSubnets.find(s => s.id === ip.subnetId);
          if (parentSubnetForIp?.vlanId) {
            const inheritedVlan = mockVLANs.find(v => v.id === parentSubnetForIp.vlanId);
            if (inheritedVlan) effectiveVlanNumberStr = inheritedVlan.vlanNumber.toString();
          }
        }
        const parentSubnet = ip.subnetId ? mockSubnets.find(s => s.id === ip.subnetId) : undefined;
        return {
          id: ip.id,
          ipAddress: ip.ipAddress,
          subnetId: ip.subnetId || "",
          subnetCidr: parentSubnet ? parentSubnet.cidr : "",
          vlanNumber: effectiveVlanNumberStr,
          status: ip.status,
          allocatedTo: ip.allocatedTo || "",
          description: ip.description || "",
        };
      });
      dataToExport = ipsForCsv;
      csvHeaders = ["id", "ipAddress", "subnetId", "subnetCidr", "vlanNumber", "status", "allocatedTo", "description"];
      csvContent = convertToCSV(dataToExport, csvHeaders);
    }

    if(dataToExport.length === 0 && dataType !== "vlans" && dataType !== "ips" && dataType !== "subnets" ) {
        toast({ title: "导出错误", description: `未知数据类型: ${dataType}。`, variant: "destructive"});
        return;
    }
    if (dataToExport.length === 0) {
         toast({ title: "无数据", description: `没有可用于导出的 ${dataType} 数据。`});
        return;
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
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
        description="将您当前的 IPAM 数据下载为 CSV 文件。导出的数据基于系统中的模拟数据。"
        icon={FileDown} // Changed icon
      />
      {/* Removed the grid that held import and export cards. Now only export card is direct child. */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><DownloadCloud className="h-6 w-6 text-primary" /> 导出数据</CardTitle>
          <CardDescription>
            选择要导出的数据类型。导出的数据为 CSV 格式，基于系统当前的模拟数据集。
            <br/>
            <strong className="text-amber-600 dark:text-amber-400">注意：当前导出的数据是基于预定义的模拟数据，并非来自实时数据库。</strong>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">选择要导出的数据类型:</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Button variant="outline" onClick={() => handleExport("subnets")} className="w-full" disabled={!canExport}>
              <FileDown className="mr-2 h-4 w-4" /> 导出子网
              </Button>
              <Button variant="outline" onClick={() => handleExport("vlans")} className="w-full" disabled={!canExport}>
              <FileDown className="mr-2 h-4 w-4" /> 导出VLAN
              </Button>
              <Button variant="outline" onClick={() => handleExport("ips")} className="w-full" disabled={!canExport}>
              <FileDown className="mr-2 h-4 w-4" /> 导出IP地址
              </Button>
              <Button variant="outline" onClick={() => toast({title: "即将推出", description:"完整系统备份导出功能正在计划中。"})} className="w-full sm:col-span-2" disabled={!canExport}>
              <FileDown className="mr-2 h-4 w-4" /> 导出所有数据 (备份)
              </Button>
          </div>
          {!canExport && <p className="text-xs text-destructive mt-2">您没有权限导出数据。</p>}
        </CardContent>
      </Card>
      {/* Removed the Import Templates Card */}
    </>
  );
}
