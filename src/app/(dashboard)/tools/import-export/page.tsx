
"use client"; 

import * as React from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileUp, FileDown, Wrench, UploadCloud, DownloadCloud, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { mockSubnets, mockVLANs, mockIPAddresses } from "@/lib/data"; 
import type { Subnet, VLAN, IPAddress } from "@/types";
import { useCurrentUser, hasPermission } from "@/hooks/use-current-user";
import { PERMISSIONS } from "@/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function ImportExportPage() {
  const [importFile, setImportFile] = React.useState<File | null>(null);
  const [isImporting, setIsImporting] = React.useState(false);
  const { toast } = useToast();
  const currentUser = useCurrentUser();

  const canView = hasPermission(currentUser, PERMISSIONS.VIEW_TOOLS_IMPORT_EXPORT);
  const canImport = hasPermission(currentUser, PERMISSIONS.PERFORM_TOOLS_IMPORT);
  const canExport = hasPermission(currentUser, PERMISSIONS.PERFORM_TOOLS_EXPORT);


  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      if (file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || file.type === "application/vnd.ms-excel" || file.name.endsWith('.csv')) {
        setImportFile(file);
      } else {
        toast({
          title: "Invalid File Type",
          description: "Please upload an Excel (.xlsx, .xls) or CSV (.csv) file.",
          variant: "destructive",
        });
        setImportFile(null);
        event.target.value = ""; 
      }
    }
  };

  const handleImport = async () => {
    if (!canImport) {
        toast({ title: "Permission Denied", description: "You do not have permission to import data.", variant: "destructive" });
        return;
    }
    if (!importFile) {
      toast({ title: "No File Selected", description: "Please select a file to import.", variant: "destructive" });
      return;
    }
    setIsImporting(true);
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const validationSuccess = Math.random() > 0.3; 
    if (validationSuccess) {
      toast({ title: "Import Successful", description: `${importFile.name} has been imported (simulated).` });
    } else {
       toast({ title: "Import Failed", description: `Validation errors in ${importFile.name}. Columns A, C have issues (simulated).`, variant: "destructive" });
    }
    setImportFile(null); 
    const fileInput = document.getElementById('import-file-input') as HTMLInputElement | null;
    if(fileInput) fileInput.value = "";

    setIsImporting(false);
  };

  const handleExport = (dataType: "subnets" | "vlans" | "ips") => {
    if (!canExport) {
        toast({ title: "Permission Denied", description: "You do not have permission to export data.", variant: "destructive" });
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
        toast({ title: "Export Error", description: `Unknown data type: ${dataType}.`, variant: "destructive"});
        return;
    }
    if (dataToExport.length === 0) {
         toast({ title: "No Data", description: `No data available to export for ${dataType}.`});
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
      toast({ title: "Export Started", description: `${filename} is being downloaded.` });
    } else {
        toast({ title: "Export Failed", description: "Browser does not support direct download.", variant: "destructive"});
    }
  };
  
  const subnetTemplate = `cidr,vlanNumber,description
192.168.100.0/24,100,New Office Subnet
10.20.0.0/16,,Server Farm DMZ (VLAN number is optional, matches existing VLAN)
172.16.32.0/22,101,Development Lab`;

  const vlanTemplate = `vlanNumber,description
100,New Office VLAN (VLAN number must be unique)
101,Development Lab VLAN
200,Voice VLAN (Description is optional)`;

  const ipAddressTemplate = `ipAddress,subnetCidr,vlanNumber,status,allocatedTo,description
192.168.100.5,192.168.100.0/24,,allocated,Workstation-01,User PC (Subnet CIDR must exist)
192.168.100.6,192.168.100.0/24,100,free,,(Optional VLAN number for direct assignment, must exist)
10.20.0.10,,,reserved,,Future Web Server (IP in global pool if subnetCidr is empty)
172.16.0.10,172.16.0.0/20,,allocated,Printer-Main, (Status is 'allocated', 'free', or 'reserved')`;


  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Wrench className="h-16 w-16 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2">Access Denied</h2>
        <p className="text-muted-foreground">You do not have permission to view Import/Export tools.</p>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Data Import & Export"
        description="Bulk manage your IPAM data using Excel or CSV files."
        icon={Wrench}
      />
      <div className="grid lg:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><UploadCloud className="h-6 w-6 text-primary" /> Import Data</CardTitle>
            <CardDescription>Upload an Excel or CSV file to import subnets, VLANs, or IP addresses. Ensure data matches the required format (see templates below).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid w-full max-w-sm items-center gap-1.5">
              <Label htmlFor="import-file-input">Select File (.xlsx, .csv)</Label>
              <Input id="import-file-input" type="file" onChange={handleFileChange} accept=".xlsx,.xls,.csv" disabled={!canImport} />
            </div>
            {importFile && <p className="text-sm text-muted-foreground">Selected file: {importFile.name}</p>}
            <Button onClick={handleImport} disabled={!importFile || isImporting || !canImport} className="w-full">
              {isImporting ? "Importing..." : <><FileUp className="mr-2 h-4 w-4" /> Process Import</>}
            </Button>
            {!canImport && <p className="text-xs text-destructive">You do not have permission to import data.</p>}
            <p className="text-xs text-muted-foreground">
              Note: First row should be headers. All column data will be validated during actual import.
              The current import functionality is a placeholder and performs simulated validation.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><DownloadCloud className="h-6 w-6 text-primary" /> Export Data</CardTitle>
            <CardDescription>Download your current IPAM data as CSV files.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm">Select data type to export:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Button variant="outline" onClick={() => handleExport("subnets")} className="w-full" disabled={!canExport}>
                <FileDown className="mr-2 h-4 w-4" /> Export Subnets
                </Button>
                <Button variant="outline" onClick={() => handleExport("vlans")} className="w-full" disabled={!canExport}>
                <FileDown className="mr-2 h-4 w-4" /> Export VLANs
                </Button>
                <Button variant="outline" onClick={() => handleExport("ips")} className="w-full" disabled={!canExport}>
                <FileDown className="mr-2 h-4 w-4" /> Export IP Addresses
                </Button>
                 <Button variant="outline" onClick={() => toast({title: "Coming Soon", description:"Full system backup export is planned."})} className="w-full sm:col-span-2" disabled={!canExport}>
                <FileDown className="mr-2 h-4 w-4" /> Export All Data (Backup)
                </Button>
            </div>
            {!canExport && <p className="text-xs text-destructive mt-2">You do not have permission to export data.</p>}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-8">
        <CardHeader>
            <CardTitle className="flex items-center gap-2"><FileText className="h-6 w-6 text-primary"/>Import Templates (CSV Format)</CardTitle>
            <CardDescription>Use these templates as a guide for your CSV import files. The first row must be the header row exactly as shown.</CardDescription>
        </CardHeader>
        <CardContent>
            <Tabs defaultValue="subnets">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="subnets">Subnets</TabsTrigger>
                    <TabsTrigger value="vlans">VLANs</TabsTrigger>
                    <TabsTrigger value="ipAddresses">IP Addresses</TabsTrigger>
                </TabsList>
                <TabsContent value="subnets">
                    <Card>
                        <CardHeader><CardTitle className="text-lg">Subnet Import Template</CardTitle></CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground mb-2">Required headers: <code>cidr,vlanNumber,description</code></p>
                            <ScrollArea className="h-auto max-h-60 w-full rounded-md border p-4 bg-muted/50">
                                <pre className="text-sm">{subnetTemplate}</pre>
                            </ScrollArea>
                        </CardContent>
                    </Card>
                </TabsContent>
                <TabsContent value="vlans">
                    <Card>
                        <CardHeader><CardTitle className="text-lg">VLAN Import Template</CardTitle></CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground mb-2">Required headers: <code>vlanNumber,description</code></p>
                             <ScrollArea className="h-auto max-h-60 w-full rounded-md border p-4 bg-muted/50">
                                <pre className="text-sm">{vlanTemplate}</pre>
                            </ScrollArea>
                        </CardContent>
                    </Card>
                </TabsContent>
                <TabsContent value="ipAddresses">
                    <Card>
                        <CardHeader><CardTitle className="text-lg">IP Address Import Template</CardTitle></CardHeader>
                        <CardContent>
                           <p className="text-sm text-muted-foreground mb-2">Required headers: <code>ipAddress,subnetCidr,vlanNumber,status,allocatedTo,description</code></p>
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
