
import { PlusCircle, Edit, Trash2, Cable } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { getVLANsAction } from "@/lib/actions";
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog";
import { VlanFormSheet } from "./vlan-form-sheet";

export default async function VlansPage() {
  const vlans = await getVLANsAction();

  return (
    <>
      <PageHeader
        title="VLAN Management"
        description="Organize and manage your Virtual LANs."
        icon={Cable}
        actionButton={{
          label: "Add VLAN",
          onClick: () => { /* Handled by VlanFormSheet trigger */ },
          icon: PlusCircle,
        }}
      />
      <VlanFormSheet /> {/* Trigger is inside this component */}

      <Card>
        <CardHeader>
          <CardTitle>VLAN List</CardTitle>
          <CardDescription>All configured VLANs in your network.</CardDescription>
        </CardHeader>
        <CardContent>
          {vlans.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>VLAN Number</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Subnets</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vlans.map((vlan) => (
                  <TableRow key={vlan.id}>
                    <TableCell className="font-medium">{vlan.vlanNumber}</TableCell>
                    <TableCell className="max-w-md truncate">{vlan.description || "N/A"}</TableCell>
                    <TableCell>{vlan.subnetCount ?? 0}</TableCell> {/* Assuming subnetCount is populated */}
                    <TableCell className="text-right">
                      <VlanFormSheet vlan={vlan}>
                        <Button variant="ghost" size="icon" aria-label="Edit VLAN">
                          <Edit className="h-4 w-4" />
                        </Button>
                      </VlanFormSheet>
                      <DeleteConfirmationDialog
                        itemId={vlan.id}
                        itemName={`VLAN ${vlan.vlanNumber}`}
                        deleteAction={() => import("@/lib/actions").then(actions => actions.deleteVLANAction(vlan.id))}
                        triggerButton={
                          <Button variant="ghost" size="icon" aria-label="Delete VLAN">
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
              <p className="text-muted-foreground">No VLANs found.</p>
              <VlanFormSheet buttonProps={{className: "mt-4"}} />
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
