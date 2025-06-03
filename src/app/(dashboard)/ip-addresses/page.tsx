
"use client";

import * as React from "react";
import { Suspense } from 'react';
import { Globe, Edit, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { getIPAddressesAction, getSubnetsAction, deleteIPAddressAction, getVLANsAction } from "@/lib/actions";
import type { IPAddress, IPAddressStatus, Subnet, VLAN } from "@/types"; // Removed unused PermissionId
import { PERMISSIONS } from "@/types";
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog";
import { IPAddressFormSheet } from "./ip-address-form-sheet";
import { IPSubnetFilter } from "./ip-subnet-filter";
import { useCurrentUser, hasPermission } from "@/hooks/use-current-user";
// Removed unused CurrentUserContextValue
import { useToast } from "@/hooks/use-toast";
import { useSearchParams } from 'next/navigation';

function LoadingIPAddressesPageContent() { // Renamed to avoid conflict if exported
  return (
    <>
      <PageHeader
        title="IP Address Management"
        description="Loading IP address data..."
        icon={Globe}
      />
      <Card>
        <CardHeader>
          <CardTitle>IP Address List</CardTitle>
          <CardDescription>Fetching IP addresses from the system...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-10">
             <Globe className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Loading IP addresses, subnets, and VLANs...</p>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function IPAddressesView() {
  const searchParams = useSearchParams();
  const selectedSubnetId = searchParams.get("subnetId") || undefined;

  const [ipAddresses, setIpAddresses] = React.useState<IPAddress[]>([]);
  const [subnets, setSubnets] = React.useState<Subnet[]>([]);
  const [vlans, setVlans] = React.useState<VLAN[]>([]);

  const { currentUser, isAuthLoading } = useCurrentUser();
  const { toast } = useToast();

  const fetchData = React.useCallback(async () => {
    // Wait for auth to complete and ensure user is available
    if (isAuthLoading || !currentUser) {
        setIpAddresses([]);
        setSubnets([]);
        setVlans([]);
        return;
    }
    // Check permission after ensuring currentUser is loaded
    if (!hasPermission(currentUser, PERMISSIONS.VIEW_IPADDRESS)) {
        setIpAddresses([]);
        setSubnets([]);
        setVlans([]);
        return;
    }
    try {
      const [fetchedIps, fetchedSubnets, fetchedVlans] = await Promise.all([
        getIPAddressesAction(selectedSubnetId),
        getSubnetsAction(),
        getVLANsAction(),
      ]);
      setIpAddresses(fetchedIps);
      setSubnets(fetchedSubnets);
      setVlans(fetchedVlans);
    } catch (error) {
      toast({ title: "Error fetching data", description: (error as Error).message, variant: "destructive" });
    }
  }, [selectedSubnetId, toast, currentUser, isAuthLoading]); // isAuthLoading added

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);
  
  if (isAuthLoading) {
    return <LoadingIPAddressesPageContent />;
  }

  // Ensure currentUser is available before checking permission
  if (!currentUser || !hasPermission(currentUser, PERMISSIONS.VIEW_IPADDRESS)) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Globe className="h-16 w-16 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2">Access Denied</h2>
        <p className="text-muted-foreground">You do not have permission to view IP addresses.</p>
      </div>
    );
  }

  const canCreate = currentUser && hasPermission(currentUser, PERMISSIONS.CREATE_IPADDRESS);
  const canEdit = currentUser && hasPermission(currentUser, PERMISSIONS.EDIT_IPADDRESS);
  const canDelete = currentUser && hasPermission(currentUser, PERMISSIONS.DELETE_IPADDRESS);


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
    if (ip.vlanId) {
      vlanToDisplay = vlans.find(v => v.id === ip.vlanId);
    } else if (ip.subnetId) {
      const subnet = subnets.find(s => s.id === ip.subnetId);
      if (subnet?.vlanId) {
        vlanToDisplay = vlans.find(v => v.id === subnet.vlanId);
      } else if (subnet) { // Subnet exists but has no VLAN
        return "No VLAN (Subnet)";
      }
    }
    return vlanToDisplay ? `${vlanToDisplay.vlanNumber}` : "N/A";
  };


  return (
    <>
      <PageHeader
        title="IP Address Management"
        description={`Manage IP addresses. Currently viewing: ${currentSubnetName || 'All Subnets'}`}
        icon={Globe}
      />
      <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
        <IPSubnetFilter subnets={subnets} currentSubnetId={selectedSubnetId} />
        {canCreate && <IPAddressFormSheet subnets={subnets} vlans={vlans} currentSubnetId={selectedSubnetId} onIpAddressChange={fetchData} />}
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
                  {(canEdit || canDelete) && <TableHead className="text-right">Actions</TableHead>}
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
                    {(canEdit || canDelete) && (
                      <TableCell className="text-right">
                        {canEdit && (
                            <IPAddressFormSheet ipAddress={ip} subnets={subnets} vlans={vlans} currentSubnetId={selectedSubnetId} onIpAddressChange={fetchData}>
                            <Button variant="ghost" size="icon" aria-label="Edit IP Address">
                                <Edit className="h-4 w-4" />
                            </Button>
                            </IPAddressFormSheet>
                        )}
                        {canDelete && (
                            <DeleteConfirmationDialog
                            itemId={ip.id}
                            itemName={ip.ipAddress}
                            deleteAction={deleteIPAddressAction}
                            onDeleted={fetchData}
                            triggerButton={
                                <Button variant="ghost" size="icon" aria-label="Delete IP Address">
                                <Trash2 className="h-4 w-4" />
                                </Button>
                            }
                            />
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-10">
              <p className="text-muted-foreground">
                {selectedSubnetId ? "No IP addresses found in this subnet." : "No IP addresses found. Select a subnet or add a new IP."}
              </p>
              {canCreate && <IPAddressFormSheet subnets={subnets} vlans={vlans} currentSubnetId={selectedSubnetId} onIpAddressChange={fetchData} buttonProps={{className: "mt-4"}} />}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

export default function IPAddressesPage() {
  return (
    <Suspense fallback={<LoadingIPAddressesPageContent />}>
      <IPAddressesView />
    </Suspense>
  );
}
