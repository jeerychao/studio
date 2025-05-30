
"use client"; 

import * as React from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileUp, FileDown, Wrench, UploadCloud, DownloadCloud } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { mockSubnets, mockVLANs, mockIPAddresses } from "@/lib/data"; 

export default function ImportExportPage() {
  const [importFile, setImportFile] = React.useState<File | null>(null);
  const [isImporting, setIsImporting] = React.useState(false);
  const { toast } = useToast();

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
    let dataToExport: any[] = [];
    let filename = `${dataType}_export.csv`;
    let csvContent = "";

    const convertToCSV = (data: any[], headers: string[]) => {
      let csv = headers.join(",") + "\n";
      data.forEach(row => {
        csv += headers.map(header => JSON.stringify(row[header as keyof typeof row] || "")).join(",") + "\n";
      });
      return csv;
    };

    // Note: Using mock data directly. A real export would fetch fresh data via actions.
    if (dataType === "subnets") {
      dataToExport = mockSubnets; 
      csvContent = convertToCSV(dataToExport, ["id", "cidr", "networkAddress", "subnetMask", "ipRange", "vlanId", "description", "utilization"]);
    } else if (dataType === "vlans") {
      dataToExport = mockVLANs;
      csvContent = convertToCSV(dataToExport, ["id", "vlanNumber", "description", "subnetCount"]);
    } else if (dataType === "ips") {
      dataToExport = mockIPAddresses;
      csvContent = convertToCSV(dataToExport, ["id", "ipAddress", "subnetId", "vlanId", "status", "allocatedTo", "description"]);
    }

    if(dataToExport.length === 0) {
        toast({ title: "Export Failed", description: `No data available for ${dataType}.`, variant: "destructive"});
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


  return (
    <>
      <PageHeader
        title="Data Import & Export"
        description="Bulk manage your IPAM data using Excel or CSV files."
        icon={Wrench}
      />
      <div className="grid md:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><UploadCloud className="h-6 w-6 text-primary" /> Import Data</CardTitle>
            <CardDescription>Upload an Excel or CSV file to import subnets, VLANs, or IP addresses. Ensure data matches required format.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid w-full max-w-sm items-center gap-1.5">
              <Label htmlFor="import-file-input">Select File (.xlsx, .csv)</Label>
              <Input id="import-file-input" type="file" onChange={handleFileChange} accept=".xlsx,.xls,.csv" />
            </div>
            {importFile && <p className="text-sm text-muted-foreground">Selected file: {importFile.name}</p>}
            <Button onClick={handleImport} disabled={!importFile || isImporting} className="w-full">
              {isImporting ? "Importing..." : <><FileUp className="mr-2 h-4 w-4" /> Process Import</>}
            </Button>
            <p className="text-xs text-muted-foreground">
              Note: Ensure columns match the expected schema. First row should be headers. 
              Refer to documentation for template. All column data will be validated.
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
                <Button variant="outline" onClick={() => handleExport("subnets")} className="w-full">
                <FileDown className="mr-2 h-4 w-4" /> Export Subnets
                </Button>
                <Button variant="outline" onClick={() => handleExport("vlans")} className="w-full">
                <FileDown className="mr-2 h-4 w-4" /> Export VLANs
                </Button>
                <Button variant="outline" onClick={() => handleExport("ips")} className="w-full">
                <FileDown className="mr-2 h-4 w-4" /> Export IP Addresses
                </Button>
                 <Button variant="outline" onClick={() => toast({title: "Coming Soon", description:"Full system backup export is planned."})} className="w-full sm:col-span-2">
                <FileDown className="mr-2 h-4 w-4" /> Export All Data (Backup)
                </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
