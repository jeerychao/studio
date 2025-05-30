
import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { getIPAddressesAction, getSubnetsAction, deleteIPAddressAction, getVLANsAction } from "@/lib/actions";
import type { IPAddress, IPAddressStatus, Subnet, VLAN } from "@/types";
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog";
import { IPAddressFormSheet } from "./ip-address-form-sheet";
import { IPSubnetFilter } from "./ip-subnet-filter";
import { Edit, Trash2 } from "lucide-react";

export default async function IPAddressesPage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const selectedSubnetId = typeof searchParams?.subnetId === 'string' ? searchParams.subnetId : undefined;

  const ipAddresses = await getIPAddressesAction(selectedSubnetId);
  const subnets = await getSubnetsAction();
  const vlans = await getVLANsAction();

  const getStatusBadgeVariant = (status: IPAddressStatus) => {
    switch (status) {
      case "allocated": return "default";
      case "free": return "secondary";
      case "reserved": return "outline";
      default: return "secondary";
    }
  };

  const currentSubnetName = selectedSubnetId ? subnets.find(s => s.id === selectedSubnetId)?.networkAddress : "All Subnets";

  const getVlanDisplayForIp = (ip: IPAddress): string => {
    let vlanToDisplay: VLAN | undefined;

    // 1. Check for IP-specific VLAN override
    if (ip.vlanId) {
      vlanToDisplay = vlans.find(v => v.id === ip.vlanId);
    }
    // 2. If no IP-specific override, check subnet's VLAN
    else if (ip.subnetId) {
      const subnet = subnets.find(s => s.id === ip.subnetId);
      if (subnet?.vlanId) {
        vlanToDisplay = vlans.find(v => v.id === subnet.vlanId);
      } else if (subnet) {
        return "No VLAN (Subnet)"; // Subnet exists but not assigned to a VLAN
      }
    }

    if (vlanToDisplay) {
      return `${vlanToDisplay.vlanNumber}`;
    }
    return "N/A"; // No VLAN assigned directly or via subnet
  };

  return (
    <>
      <PageHeader
        title="IP Address Management"
        description={`Manage IP addresses. Currently viewing: ${currentSubnetName}`}
        icon={Globe}
      />
      <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
        <IPSubnetFilter subnets={subnets} currentSubnetId={selectedSubnetId} />
        {/* Pass vlans to the IPAddressFormSheet for the Add IP Address button */}
        <IPAddressFormSheet subnets={subnets} vlans={vlans} currentSubnetId={selectedSubnetId} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>IP Address List</CardTitle>
          <CardDescription>
            {selectedSubnetId
              ? `IP addresses within subnet ${subnets.find(s => s.id === selectedSubnetId)?.networkAddress || ''}`
              : "All managed IP addresses."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {ipAddresses.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>IP Address</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Allocated To</TableHead>
                  <TableHead>Subnet</TableHead>
                  <TableHead>VLAN</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ipAddresses.map((ip) => (
                  <TableRow key={ip.id}>
                    <TableCell className="font-medium">{ip.ipAddress}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadgeVariant(ip.status)} className="capitalize">
                        {ip.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{ip.allocatedTo || "N/A"}</TableCell>
                    <TableCell>
                      {subnets.find(s => s.id === ip.subnetId)?.networkAddress || "N/A"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{getVlanDisplayForIp(ip)}</Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate">{ip.description || "N/A"}</TableCell>
                    <TableCell className="text-right">
                      {/* Pass vlans to the IPAddressFormSheet for each row's Edit button */}
                      <IPAddressFormSheet ipAddress={ip} subnets={subnets} vlans={vlans} currentSubnetId={selectedSubnetId}>
                        <Button variant="ghost" size="icon" aria-label="Edit IP Address">
                          <Edit className="h-4 w-4" />
                        </Button>
                      </IPAddressFormSheet>
                      <DeleteConfirmationDialog
                        itemId={ip.id}
                        itemName={ip.ipAddress}
                        deleteAction={deleteIPAddressAction}
                        triggerButton={
                          <Button variant="ghost" size="icon" aria-label="Delete IP Address">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-10">
              <p className="text-muted-foreground">
                {selectedSubnetId ? "No IP addresses found in this subnet." : "No IP addresses found. Select a subnet or add a new IP."}
              </p>
              {/* Pass vlans to the IPAddressFormSheet for the "Add IP Address" button in empty state */}
              <IPAddressFormSheet subnets={subnets} vlans={vlans} currentSubnetId={selectedSubnetId} buttonProps={{className: "mt-4"}} />
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
