
"use client";

import * as React from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser, hasPermission } from "@/hooks/use-current-user";
import { PERMISSIONS } from "@/types";
import { getSubnetsAction, getVLANsAction, getIPAddressesAction } from "@/lib/actions";
import Image from "next/image";
import { Loader2 } from "lucide-react";


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
    let csvContent = "";
    const lineSeparator = "\r\n";

    const convertToCSV = (data: any[], headersToUse: string[]) => {
      let csv = headersToUse.join(",") + lineSeparator;
      data.forEach(row => {
        csv += headersToUse.map(header => JSON.stringify(row[header as keyof typeof row] ?? "")).join(",") + lineSeparator;
      });
      return csv;
    };

    try {
      if (dataType === "all") {
        let combinedCsvContent = "";
        
        // --- SUBNETS ---
        const subnetsResponse = await getSubnetsAction();
        const allVlansForLookupSubnet = (await getVLANsAction()).data; // Fetch once for lookups
        if (subnetsResponse.data.length > 0) {
          let subnetSequentialId = 1;
          const subnetsForCsv = subnetsResponse.data.map(subnet => {
            const vlanDetails = subnet.vlanId ? allVlansForLookupSubnet.find(v => v.id === subnet.vlanId) : null;
            return {
              id: subnetSequentialId++, // Use sequential ID for export
              cidr: subnet.cidr,
              networkAddress: subnet.networkAddress,
              subnetMask: subnet.subnetMask,
              ipRange: subnet.ipRange || "",
              vlanNumber: vlanDetails?.vlanNumber || "",
              vlanName: vlanDetails?.name || "", // Added vlanName
              description: subnet.description || "",
              utilization: subnet.utilization || 0,
            };
          });
          const subnetHeaders = ["id", "cidr", "networkAddress", "subnetMask", "ipRange", "vlanNumber", "vlanName", "description", "utilization"];
          combinedCsvContent += "# --- SUBNETS ---" + lineSeparator;
          combinedCsvContent += convertToCSV(subnetsForCsv, subnetHeaders) + lineSeparator + lineSeparator;
        }

        // --- VLANS ---
        const vlansResponse = await getVLANsAction();
        if (vlansResponse.data.length > 0) {
          let vlanSequentialId = 1;
          const vlansForCsv = vlansResponse.data.map(vlan => ({
            id: vlanSequentialId++, // Sequential ID for VLAN export
            vlanNumber: vlan.vlanNumber,
            name: vlan.name || "",
            description: vlan.description || "",
            resourceCount: vlan.subnetCount || 0, 
          }));
          const vlanHeaders = ["id", "vlanNumber", "name", "description", "resourceCount"];
          combinedCsvContent += "# --- VLANS ---" + lineSeparator;
          combinedCsvContent += convertToCSV(vlansForCsv, vlanHeaders) + lineSeparator + lineSeparator;
        }

        // --- IP ADDRESSES ---
        const ipsResponse = await getIPAddressesAction();
        if (ipsResponse.data.length > 0) {
          let ipSequentialId = 1;
          const ipsForCsv = ipsResponse.data.map(ip => {
              let vlanNumberStr = "";
              let vlanNameStr = "";
              // Use the vlan object directly attached to IP first, then fallback to subnet's vlan
              if (ip.vlan?.vlanNumber) { 
                  vlanNumberStr = ip.vlan.vlanNumber.toString();
                  vlanNameStr = ip.vlan.name || "";
              } else if (ip.subnet?.vlan?.vlanNumber) {
                  vlanNumberStr = ip.subnet.vlan.vlanNumber.toString();
                  vlanNameStr = ip.subnet.vlan.name || "";
              }
              return {
                  id: ipSequentialId++, // Sequential ID for IP export
                  ipAddress: ip.ipAddress,
                  subnetId: ip.subnetId || "", // Original subnet ID
                  subnetCidr: ip.subnet?.cidr || "",
                  // vlanId: ip.vlanId || "", // REMOVED as per request
                  vlanNumber: vlanNumberStr,
                  vlanName: vlanNameStr,
                  status: ip.status,
                  allocatedTo: ip.allocatedTo || "",
                  description: ip.description || "",
              };
          });
          const ipHeaders = ["id", "ipAddress", "subnetId", "subnetCidr", "vlanNumber", "vlanName", "status", "allocatedTo", "description"]; // vlanId REMOVED
          combinedCsvContent += "# --- IP ADDRESSES ---" + lineSeparator;
          combinedCsvContent += convertToCSV(ipsForCsv, ipHeaders);
        }

        if (combinedCsvContent.trim() === "" || combinedCsvContent.replace(/# --- [A-Z ]+ ---\r\n/g, '').replace(/\r\n/g, '').trim() === "") {
            toast({ title: "无数据", description: "系统中没有可导出的数据。" });
            setIsExporting(false);
            return;
        }
        csvContent = combinedCsvContent;

      } else { // Handling individual types: "subnets", "vlans", "ips"
        let localDataToExport: any[] = [];
        let localCsvHeaders: string[] = [];
        let filenameFragment = dataType;
        let sequentialId = 1;


        if (dataType === "subnets") {
          const subnetsResponse = await getSubnetsAction();
          const allVlansForLookupSubnet = (await getVLANsAction()).data;
          const subnetsForCsv = subnetsResponse.data.map(subnet => {
            const vlanDetails = subnet.vlanId ? allVlansForLookupSubnet.find(v => v.id === subnet.vlanId) : null;
            return {
              id: sequentialId++, // Use sequential ID for export
              cidr: subnet.cidr,
              networkAddress: subnet.networkAddress,
              subnetMask: subnet.subnetMask,
              ipRange: subnet.ipRange || "",
              vlanNumber: vlanDetails?.vlanNumber || "",
              vlanName: vlanDetails?.name || "",
              description: subnet.description || "",
              utilization: subnet.utilization || 0,
            };
          });
          localDataToExport = subnetsForCsv;
          localCsvHeaders = ["id", "cidr", "networkAddress", "subnetMask", "ipRange", "vlanNumber", "vlanName", "description", "utilization"];
        } else if (dataType === "vlans") {
          const vlansResponse = await getVLANsAction();
          const vlansForCsv = vlansResponse.data.map(vlan => ({
            id: sequentialId++, // Sequential ID for VLAN export
            vlanNumber: vlan.vlanNumber,
            name: vlan.name || "",
            description: vlan.description || "",
            resourceCount: vlan.subnetCount || 0,
          }));
          localDataToExport = vlansForCsv;
          localCsvHeaders = ["id", "vlanNumber", "name", "description", "resourceCount"];
        } else if (dataType === "ips") {
          filenameFragment = "ip_addresses";
          const ipsResponse = await getIPAddressesAction();
          const ipsForCsv = ipsResponse.data.map(ip => {
              let vlanNumberStr = "";
              let vlanNameStr = "";
              if (ip.vlan?.vlanNumber) {
                  vlanNumberStr = ip.vlan.vlanNumber.toString();
                  vlanNameStr = ip.vlan.name || "";
              } else if (ip.subnet?.vlan?.vlanNumber) {
                  vlanNumberStr = ip.subnet.vlan.vlanNumber.toString();
                  vlanNameStr = ip.subnet.vlan.name || "";
              }
              return {
                  id: sequentialId++, // Sequential ID for IP export
                  ipAddress: ip.ipAddress,
                  subnetId: ip.subnetId || "", // Original subnet ID
                  subnetCidr: ip.subnet?.cidr || "",
                  // vlanId: ip.vlanId || "", // REMOVED as per request
                  vlanNumber: vlanNumberStr,
                  vlanName: vlanNameStr,
                  status: ip.status,
                  allocatedTo: ip.allocatedTo || "",
                  description: ip.description || "",
              };
          });
          localDataToExport = ipsForCsv;
          localCsvHeaders = ["id", "ipAddress", "subnetId", "subnetCidr", "vlanNumber", "vlanName", "status", "allocatedTo", "description"]; // vlanId REMOVED
        } else {
          toast({ title: "错误", description: "未知的数据类型导出请求。", variant: "destructive" });
          setIsExporting(false);
          return;
        }

        if (localDataToExport.length === 0) {
            toast({ title: "无数据", description: `没有可用于导出的 ${dataType === "ips" ? "IP 地址" : dataType === "subnets" ? "子网" : "VLAN"} 数据。`});
            setIsExporting(false);
            return;
        }
        csvContent = convertToCSV(localDataToExport, localCsvHeaders);
      }

      // Final check to ensure csvContent is not empty before proceeding
      if (!csvContent || (dataType === "all" && !csvContent.replace(/# --- [A-Z ]+ ---\r\n/g, '').replace(/\r\n/g, '').trim())) {
          toast({ title: "无内容导出", description: "未能生成CSV内容或选定类型无数据。" });
          setIsExporting(false);
          return;
      }
      
      const filename = `${dataType === "ips" ? "ip_addresses" : dataType}_export_${new Date().toISOString().split('T')[0]}.csv`;
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
        URL.revokeObjectURL(url); // Clean up the object URL
        toast({ title: "导出已开始", description: `${filename} 正在下载。` });
      } else {
          toast({ title: "导出失败", description: "浏览器不支持直接下载。", variant: "destructive"});
      }

    } catch (error) {
        toast({ title: "导出错误", description: (error as Error).message, variant: "destructive"});
    } finally {
        setIsExporting(false);
    }
  }; // Semicolon here for the function expression

  if (isAuthLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-3 text-lg">加载数据导出工具中...</p>
      </div>
    );
  }

  if (!currentUser || !hasPermission(currentUser, PERMISSIONS.VIEW_TOOLS_IMPORT_EXPORT)) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Image src="/images/tool_icons/download_cloud_icon.png" alt="Access Denied" width={64} height={64} className="text-destructive mb-4" data-ai-hint="cloud download error icon" />
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
        description="将您当前的 IPAM 数据下载为 CSV 文件。导出的数据基于系统中的实时数据库。"
        icon={<Image src="/images/tool_icons/file_down_icon.png" alt="Export Icon" width={32} height={32} data-ai-hint="download file icon" />}
      />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Image src="/images/tool_icons/download_cloud_icon.png" alt="Export Data" width={24} height={24} className="text-primary" data-ai-hint="cloud download icon" />
            导出数据
          </CardTitle>
          <CardDescription>
            选择要导出的数据类型。所有类型的数据都将以 CSV 格式导出，基于系统当前的实时数据库。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">选择要导出的数据类型:</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Button variant="outline" onClick={() => handleExport("subnets")} className="w-full" disabled={!canExport || isExporting === "subnets"}>
                {isExporting === "subnets"
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <Image src="/images/tool_icons/file_down_icon.png" alt="Export Subnets" width={16} height={16} className="mr-2" data-ai-hint="download file icon" />
                }
                导出子网 (CSV)
              </Button>
              <Button variant="outline" onClick={() => handleExport("vlans")} className="w-full" disabled={!canExport || isExporting === "vlans"}>
                {isExporting === "vlans"
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <Image src="/images/tool_icons/file_down_icon.png" alt="Export VLANs" width={16} height={16} className="mr-2" data-ai-hint="download file icon" />
                }
                导出VLAN (CSV)
              </Button>
              <Button variant="outline" onClick={() => handleExport("ips")} className="w-full" disabled={!canExport || isExporting === "ips"}>
                {isExporting === "ips"
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <Image src="/images/tool_icons/file_down_icon.png" alt="Export IPs" width={16} height={16} className="mr-2" data-ai-hint="download file icon" />
                }
                导出IP地址 (CSV)
              </Button>
              <Button variant="outline" onClick={() => handleExport("all")} className="w-full sm:col-span-2" disabled={!canExport || isExporting === "all"}>
                {isExporting === "all"
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <Image src="/images/tool_icons/file_down_icon.png" alt="Export All" width={16} height={16} className="mr-2" data-ai-hint="download file icon" />
                }
                导出所有数据 (CSV)
              </Button>
          </div>
          {!canExport && <p className="text-xs text-destructive mt-2">您没有权限导出数据。</p>}
        </CardContent>
      </Card>
    </>
  );
}
