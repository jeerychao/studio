
import { NetworkIcon } from "lucide-react"; // PlusCircle removed as it's handled by SubnetFormSheet
// Button import might not be needed if all buttons are from sheets or other components
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { getSubnetsAction, getVLANsAction } from "@/lib/actions";
import type { Subnet, VLAN } from "@/types";
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog";
import { SubnetFormSheet } from "./subnet-form-sheet"; // Client component for form
import Link from "next/link";
import { Button } from "@/components/ui/button"; // Keep for edit/delete triggers if they are raw buttons
import { Edit, Trash2 } from "lucide-react"; // Keep for edit/delete icons

export default async function SubnetsPage() {
  const subnets = await getSubnetsAction();
  const vlans = await getVLANsAction(); // For displaying VLAN info

  const getVlanNumber = (vlanId?: string) => {
    if (!vlanId) return "N/A";
    const vlan = vlans.find(v => v.id === vlanId);
    return vlan ? vlan.vlanNumber.toString() : "Unknown";
  };

  return (
    <>
      <PageHeader
        title="Subnet Management"
        description="View, create, and manage your network subnets."
        icon={NetworkIcon}
        actionElement={<SubnetFormSheet vlans={vlans} />} // Use actionElement
      />
      {/* The SubnetFormSheet that was here for "Add Subnet" is now passed to PageHeader's actionElement */}
      
      <Card>
        <CardHeader>
          <CardTitle>Subnet List</CardTitle>
          <CardDescription>A comprehensive list of all configured subnets.</CardDescription>
        </CardHeader>
        <CardContent>
          {subnets.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Network Address</TableHead>
                  <TableHead>Subnet Mask</TableHead>
                  <TableHead>Gateway</TableHead>
                  <TableHead>VLAN</TableHead>
                  <TableHead>Utilization</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subnets.map((subnet) => (
                  <TableRow key={subnet.id}>
                    <TableCell className="font-medium">
                      <Link href={`/ip-addresses?subnetId=${subnet.id}`} className="hover:underline text-primary">
                        {subnet.networkAddress}
                      </Link>
                    </TableCell>
                    <TableCell>{subnet.subnetMask}</TableCell>
                    <TableCell>{subnet.gateway || "N/A"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{getVlanNumber(subnet.vlanId)}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={ (subnet.utilization ?? 0) > 85 ? "destructive" : "secondary"}>
                        {subnet.utilization ?? 0}%
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate">{subnet.description || "N/A"}</TableCell>
                    <TableCell className="text-right">
                      <SubnetFormSheet subnet={subnet} vlans={vlans}>
                        <Button variant="ghost" size="icon" aria-label="Edit subnet">
                          <Edit className="h-4 w-4" />
                        </Button>
                      </SubnetFormSheet>
                      <DeleteConfirmationDialog
                        itemId={subnet.id}
                        itemName={subnet.networkAddress}
                        deleteAction={() => import("@/lib/actions").then(actions => actions.deleteSubnetAction(subnet.id))}
                        triggerButton={
                          <Button variant="ghost" size="icon" aria-label="Delete subnet">
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
              <p className="text-muted-foreground">No subnets found.</p>
              {/* This instance of SubnetFormSheet is for the "No subnets found" case, rendering its own button */}
              <SubnetFormSheet vlans={vlans} buttonProps={{ className: "mt-4" }} />
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
