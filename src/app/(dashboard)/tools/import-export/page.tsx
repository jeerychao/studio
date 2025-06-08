
"use client";

import * as React from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser, hasPermission } from "@/hooks/use-current-user";
import { PERMISSIONS } from "@/types";
import type { Subnet, VLAN, IPAddress } from "@/types"; // IPAddress type is not directly used for mapping here but kept for consistency
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
    let dataToExport: any[] = [];
    let filename = `${dataType}_export.csv`;
    let csvContent = "";
    let csvHeaders: string[] = [];
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
        filename = `ipam_lite_all_data_export.csv`;
        let subnetSequentialId = 1;

        const subnetsResponse = await getSubnetsAction();
        const allVlansForLookup = (await getVLANsAction()).data;

        if (subnetsResponse.data.length > 0) {
          const subnetsForCsv = subnetsResponse.data.map(subnet => {
            const vlanDetails = subnet.vlanId ? allVlansForLookup.find(v => v.id === subnet.vlanId) : null;
            return {
              id: subnetSequentialId++, // Use sequential ID for export
              cidr: subnet.cidr,
              networkAddress: subnet.networkAddress,
              subnetMask: subnet.subnetMask,
              ipRange: subnet.ipRange || "",
              vlanNumber: vlanDetails?.vlanNumber || "", // Keep vlanNumber
              vlanName: vlanDetails?.name || "",       // Keep vlanName
              description: subnet.description || "",
              utilization: subnet.utilization || 0,
            };
          });
          // Remove 'vlanId' from headers for subnets part
          const subnetHeaders = ["id", "cidr", "networkAddress", "subnetMask", "ipRange", "vlanNumber", "vlanName", "description", "utilization"];
          combinedCsvContent += "# --- SUBNETS ---" + lineSeparator;
          combinedCsvContent += convertToCSV(subnetsForCsv, subnetHeaders) + lineSeparator + lineSeparator;
        }

        const vlansResponse = await getVLANsAction();
        if (vlansResponse.data.length > 0) {
          const vlansForCsv = vlansResponse.data.map(vlan => ({
            id: vlan.id, // Keep original ID for VLANs
            vlanNumber: vlan.vlanNumber,
            name: vlan.name || "",
            description: vlan.description || "",
            resourceCount: vlan.subnetCount || 0,
          }));
          const vlanHeaders = ["id", "vlanNumber", "name", "description", "resourceCount"];
          combinedCsvContent += "# --- VLANS ---" + lineSeparator;
          combinedCsvContent += convertToCSV(vlansForCsv, vlanHeaders) + lineSeparator + lineSeparator;
        }

        const ipsResponse = await getIPAddressesAction();
        if (ipsResponse.data.length > 0) {
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
                  id: ip.id, // Keep original ID for IPs
                  ipAddress: ip.ipAddress,
                  subnetId: ip.subnetId || "", // Keep original subnetId for IPs
                  subnetCidr: ip.subnet?.cidr || "",
                  vlanId: ip.vlanId || "", // Keep original vlanId for IPs for referential integrity context
                  vlanNumber: vlanNumberStr,
                  vlanName: vlanNameStr,
                  status: ip.status,
                  allocatedTo: ip.allocatedTo || "",
                  description: ip.description || "",
              };
          });
          // Keep vlanId in IP export as it's a foreign key
          const ipHeaders = ["id", "ipAddress", "subnetId", "subnetCidr", "vlanId", "vlanNumber", "vlanName", "status", "allocatedTo", "description"];
          combinedCsvContent += "# --- IP ADDRESSES ---" + lineSeparator;
          combinedCsvContent += convertToCSV(ipsForCsv, ipHeaders);
        }

        if (combinedCsvContent.trim() === "" || combinedCsvContent.replace(/# --- SUBNETS ---\r\n/g, '').replace(/# --- VLANS ---\r\n/g, '').replace(/# --- IP ADDRESSES ---\r\n/g, '').replace(/\r\n/g, '').trim() === "") {
            toast({ title: "无数据", description: "系统中没有可导出的数据。" });
            setIsExporting(false);
            return;
        }
        csvContent = combinedCsvContent;

      } else if (dataType === "subnets") {
          const subnetsResponse = await getSubnetsAction();
          const allVlansForLookup = (await getVLANsAction()).data;
          let sequentialId = 1;

          const subnetsForCsv = subnetsResponse.data.map(subnet => {
            const vlanDetails = subnet.vlanId ? allVlansForLookup.find(v => v.id === subnet.vlanId) : null;
            return {
              id: sequentialId++, // Use sequential ID
              cidr: subnet.cidr,
              networkAddress: subnet.networkAddress,
              subnetMask: subnet.subnetMask,
              ipRange: subnet.ipRange || "",
              // vlanId: subnet.vlanId || "", // REMOVE vlanId
              vlanNumber: vlanDetails?.vlanNumber || "",
              vlanName: vlanDetails?.name || "",
              description: subnet.description || "",
              utilization: subnet.utilization || 0,
            };
          });
          dataToExport = subnetsForCsv;
          // Updated headers: removed 'vlanId'
          csvHeaders = ["id", "cidr", "networkAddress", "subnetMask", "ipRange", "vlanNumber", "vlanName", "description", "utilization"];
        } else if (dataType === "vlans") {
            const vlansResponse = await getVLANsAction();
            const vlansForCsv = vlansResponse.data.map(vlan => ({
              id: vlan.id, // Keep original ID
              vlanNumber: vlan.vlanNumber,
              name: vlan.name || "",
              description: vlan.description || "",
              resourceCount: vlan.subnetCount || 0,
            }));
            dataToExport = vlansForCsv;
            csvHeaders = ["id", "vlanNumber", "name", "description", "resourceCount"];
        } else if (dataType === "ips") {
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
                    id: ip.id, // Keep original ID
                    ipAddress: ip.ipAddress,
                    subnetId: ip.subnetId || "", // Keep original subnetId
                    subnetCidr: ip.subnet?.cidr || "",
                    vlanId: ip.vlanId || "", // Keep original vlanId
                    vlanNumber: vlanNumberStr,
                    vlanName: vlanNameStr,
                    status: ip.status,
                    allocatedTo: ip.allocatedTo || "",
                    description: ip.description || "",
                };
            });
            dataToExport = ipsForCsv;
            // Keep vlanId here as it's an attribute of IPAddress linking to a VLAN
            csvHeaders = ["id", "ipAddress", "subnetId", "subnetCidr", "vlanId", "vlanNumber", "vlanName", "status", "allocatedTo", "description"];
        }

        if (dataType !== "all" && dataToExport.length === 0) {
            toast({ title: "无数据", description: `没有可用于导出的 ${dataType === "ips" ? "IP 地址" : dataType === "subnets" ? "子网" : "VLAN"} 数据。`});
            setIsExporting(false);
            return;
        }
        if (dataType !== "all") {
          csvContent = convertToCSV(dataToExport, csvHeaders);
        }
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

    } catch (error) {
        toast({ title: "导出错误", description: (error as Error).message, variant: "destructive"});
    } finally {
        setIsExporting(false);
    }
  };

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
                  ? <Image src="/images/tool_icons/loader_icon.png" alt="Loading" width={16} height={16} className="mr-2 animate-spin" data-ai-hint="loading spinner icon" />
                  : <Image src="/images/tool_icons/file_down_icon.png" alt="Export Subnets" width={16} height={16} className="mr-2" data-ai-hint="download file icon" />
                }
                导出子网 (CSV)
              </Button>
              <Button variant="outline" onClick={() => handleExport("vlans")} className="w-full" disabled={!canExport || isExporting === "vlans"}>
                {isExporting === "vlans"
                  ? <Image src="/images/tool_icons/loader_icon.png" alt="Loading" width={16} height={16} className="mr-2 animate-spin" data-ai-hint="loading spinner icon" />
                  : <Image src="/images/tool_icons/file_down_icon.png" alt="Export VLANs" width={16} height={16} className="mr-2" data-ai-hint="download file icon" />
                }
                导出VLAN (CSV)
              </Button>
              <Button variant="outline" onClick={() => handleExport("ips")} className="w-full" disabled={!canExport || isExporting === "ips"}>
                {isExporting === "ips"
                  ? <Image src="/images/tool_icons/loader_icon.png" alt="Loading" width={16} height={16} className="mr-2 animate-spin" data-ai-hint="loading spinner icon" />
                  : <Image src="/images/tool_icons/file_down_icon.png" alt="Export IPs" width={16} height={16} className="mr-2" data-ai-hint="download file icon" />
                }
                导出IP地址 (CSV)
              </Button>
              <Button variant="outline" onClick={() => handleExport("all")} className="w-full sm:col-span-2" disabled={!canExport || isExporting === "all"}>
                {isExporting === "all"
                  ? <Image src="/images/tool_icons/loader_icon.png" alt="Loading" width={16} height={16} className="mr-2 animate-spin" data-ai-hint="loading spinner icon" />
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

    