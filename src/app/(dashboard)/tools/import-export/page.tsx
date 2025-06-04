
"use client"; 

import * as React from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileUp, FileDown, Wrench, UploadCloud, DownloadCloud, FileText, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { mockSubnets, mockVLANs, mockIPAddresses } from "@/lib/data"; 
import { useCurrentUser, hasPermission } from "@/hooks/use-current-user";
import { PERMISSIONS } from "@/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function ImportExportPage() {
  const [importFile, setImportFile] = React.useState<File | null>(null);
  const [isImporting, setIsImporting] = React.useState(false);
  const [simulatedError, setSimulatedError] = React.useState<string | null>(null);
  const { toast } = useToast();
  const { currentUser, isAuthLoading } = useCurrentUser();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSimulatedError(null); // Reset error on new file selection
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      if (file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || file.type === "application/vnd.ms-excel" || file.name.endsWith('.csv')) {
        setImportFile(file);
      } else {
        toast({
          title: "文件类型无效",
          description: "请上传 Excel (.xlsx, .xls) 或 CSV (.csv) 文件。",
          variant: "destructive",
        });
        setImportFile(null);
        event.target.value = ""; 
      }
    }
  };

  const handleImport = async () => {
    if (isAuthLoading || !currentUser) {
        toast({ title: "认证错误", description: "请稍候或尝试重新登录。", variant: "destructive" });
        return;
    }
    if (!hasPermission(currentUser, PERMISSIONS.PERFORM_TOOLS_IMPORT)) {
        toast({ title: "权限被拒绝", description: "您没有权限导入数据。", variant: "destructive" });
        return;
    }
    if (!importFile) {
      toast({ title: "未选择文件", description: "请选择要导入的文件。", variant: "destructive" });
      return;
    }

    setIsImporting(true);
    setSimulatedError(null);
    // SIMULATE IMPORT AND VALIDATION
    await new Promise(resolve => setTimeout(resolve, 1500)); 
    
    const successChance = Math.random();
    if (successChance > 0.4) { // ~60% chance of simulated success
      toast({ title: "模拟导入成功", description: `${importFile.name} 已处理 (模拟)。实际系统中，数据将被验证并导入。` });
    } else { // ~40% chance of simulated error
      const errorTypes = [
        { type: "VLAN", message: `模拟错误：VLAN 100 已存在于数据库中。` },
        { type: "Subnet", message: `模拟错误：子网 192.168.1.0/24 与现有子网重叠。` },
        { type: "IP Address", message: `模拟错误：IP 地址 192.168.1.10 已在子网 192.168.1.0/24 中分配。`},
        { type: "Format", message: `模拟错误：文件 ${importFile.name} 第 5 行的 CIDR 格式无效。`},
        { type: "Dependency", message: `模拟错误：子网行引用了不存在的 VLAN 999。`}
      ];
      const randomError = errorTypes[Math.floor(Math.random() * errorTypes.length)];
      setSimulatedError(randomError.message);
      toast({ 
        title: "模拟导入失败", 
        description: `处理 ${importFile.name} 时发生模拟错误。详情见页面提示。`, 
        variant: "destructive" 
      });
    }
    // END SIMULATION

    setImportFile(null); 
    const fileInput = document.getElementById('import-file-input') as HTMLInputElement | null;
    if(fileInput) fileInput.value = "";
    setIsImporting(false);
  };

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
  
  const subnetTemplate = `cidr,vlanNumber,description
192.168.100.0/24,100,新办公室子网
10.20.0.0/16,,服务器DMZ区 (VLAN号可选, 匹配现有VLAN)
172.16.32.0/22,101,开发实验室`;

  const vlanTemplate = `vlanNumber,description
100,新办公室VLAN (VLAN号必须唯一)
101,开发实验室VLAN
200,语音VLAN (描述可选)`;

  const ipAddressTemplate = `ipAddress,subnetCidr,vlanNumber,status,allocatedTo,description
192.168.100.5,192.168.100.0/24,,allocated,工作站-01,用户PC (子网CIDR必须存在)
192.168.100.6,192.168.100.0/24,100,free,,(可选VLAN号用于直接分配, 必须存在)
10.20.0.10,,,reserved,,未来Web服务器 (如果subnetCidr为空, IP在全局池中)
172.16.0.10,172.16.0.0/20,,allocated,打印机-主楼, (状态为 'allocated', 'free', 或 'reserved')`;

  if (isAuthLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Wrench className="h-16 w-16 animate-spin text-primary mb-4" />
        <h2 className="text-2xl font-semibold mb-2">加载工具中...</h2>
      </div>
    );
  }

  if (!currentUser || !hasPermission(currentUser, PERMISSIONS.VIEW_TOOLS_IMPORT_EXPORT)) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Wrench className="h-16 w-16 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2">访问被拒绝</h2>
        <p className="text-muted-foreground">您没有权限查看导入/导出工具。</p>
      </div>
    );
  }
  
  const canImport = currentUser && hasPermission(currentUser, PERMISSIONS.PERFORM_TOOLS_IMPORT);
  const canExport = currentUser && hasPermission(currentUser, PERMISSIONS.PERFORM_TOOLS_EXPORT);

  return (
    <>
      <PageHeader
        title="数据导入与导出"
        description="使用 Excel 或 CSV 文件批量管理您的 IPAM 数据。"
        icon={Wrench}
      />
      <div className="grid lg:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><UploadCloud className="h-6 w-6 text-primary" /> 导入数据</CardTitle>
            <CardDescription>
              上传 Excel 或 CSV 文件以导入子网、VLAN 或 IP 地址。确保数据与所需格式匹配 (参见下面的模板)。
              <br/>
              <strong className="text-amber-600 dark:text-amber-400">注意：当前的导入功能为演示模拟，不会实际更改数据库。</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid w-full max-w-sm items-center gap-1.5">
              <Label htmlFor="import-file-input">选择文件 (.xlsx, .csv)</Label>
              <Input id="import-file-input" type="file" onChange={handleFileChange} accept=".xlsx,.xls,.csv" disabled={!canImport || isImporting} />
            </div>
            {importFile && <p className="text-sm text-muted-foreground">已选文件: {importFile.name}</p>}
            {simulatedError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>模拟导入错误</AlertTitle>
                <AlertDescription>{simulatedError}</AlertDescription>
              </Alert>
            )}
            <Button onClick={handleImport} disabled={!importFile || isImporting || !canImport} className="w-full">
              {isImporting ? "处理中 (模拟)..." : <><FileUp className="mr-2 h-4 w-4" /> 处理导入</>}
            </Button>
            {!canImport && <p className="text-xs text-destructive">您没有权限导入数据。</p>}
            
            <div className="text-xs text-muted-foreground space-y-2 pt-2">
              <p className="font-semibold">在实际的导入系统中，将执行以下检查：</p>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>格式验证:</strong> 检查 CSV/Excel 列是否正确，数据类型是否有效 (例如 VLAN 号码是数字)。</li>
                <li><strong>逻辑验证:</strong>
                  <ul className="list-disc list-inside pl-4">
                      <li>VLAN 号码在 1-4094 范围内。</li>
                      <li>CIDR 表示法有效，且 IP 部分是规范的网络地址。</li>
                      <li>IP 地址格式有效，且在其声明的子网范围内（如果提供了子网）。</li>
                      <li>状态字段 (如 "allocated", "free") 是预定义的值。</li>
                  </ul>
                </li>
                <li><strong>数据库冲突检查:</strong>
                  <ul className="list-disc list-inside pl-4">
                      <li>VLAN: 导入的 VLAN 号码是否已存在？</li>
                      <li>子网: 导入的 CIDR 是否与现有子网完全相同或部分重叠？</li>
                      <li>IP 地址: 导入的 IP 是否已在指定子网（或全局池）中存在？</li>
                  </ul>
                </li>
                <li><strong>依赖关系检查 (高级):</strong> 例如，CSV 中的子网行引用的 VLAN 号码必须已存在于数据库中，或也包含在当前导入批次中。</li>
              </ul>
               <p>任何验证失败的行都将被跳过，并报告错误详情。</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><DownloadCloud className="h-6 w-6 text-primary" /> 导出数据</CardTitle>
            <CardDescription>将您当前的 IPAM 数据下载为 CSV 文件。导出的数据基于系统中的模拟数据。</CardDescription>
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
      </div>

      <Card className="mt-8">
        <CardHeader>
            <CardTitle className="flex items-center gap-2"><FileText className="h-6 w-6 text-primary"/>导入模板 (CSV 格式)</CardTitle>
            <CardDescription>使用这些模板作为您的 CSV 导入文件的指南。第一行必须是与所示完全相同的表头行。</CardDescription>
        </CardHeader>
        <CardContent>
            <Tabs defaultValue="subnets">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="subnets">子网</TabsTrigger>
                    <TabsTrigger value="vlans">VLAN</TabsTrigger>
                    <TabsTrigger value="ipAddresses">IP 地址</TabsTrigger>
                </TabsList>
                <TabsContent value="subnets">
                    <Card>
                        <CardHeader><CardTitle className="text-lg">子网导入模板</CardTitle></CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground mb-2">必需表头: <code>cidr,vlanNumber,description</code></p>
                            <ScrollArea className="h-auto max-h-60 w-full rounded-md border p-4 bg-muted/50">
                                <pre className="text-sm">{subnetTemplate}</pre>
                            </ScrollArea>
                        </CardContent>
                    </Card>
                </TabsContent>
                <TabsContent value="vlans">
                    <Card>
                        <CardHeader><CardTitle className="text-lg">VLAN导入模板</CardTitle></CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground mb-2">必需表头: <code>vlanNumber,description</code></p>
                             <ScrollArea className="h-auto max-h-60 w-full rounded-md border p-4 bg-muted/50">
                                <pre className="text-sm">{vlanTemplate}</pre>
                            </ScrollArea>
                        </CardContent>
                    </Card>
                </TabsContent>
                <TabsContent value="ipAddresses">
                    <Card>
                        <CardHeader><CardTitle className="text-lg">IP 地址导入模板</CardTitle></CardHeader>
                        <CardContent>
                           <p className="text-sm text-muted-foreground mb-2">必需表头: <code>ipAddress,subnetCidr,vlanNumber,status,allocatedTo,description</code></p>
                           <ScrollArea className="h-auto max-h-60 w-full rounded-md border p-4 bg-muted/50">
                                <pre className="text-sm">{ipAddressTemplate}</pre>
                            </ScrollArea>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </CardContent>
      </Card>
    </>
  );
}
