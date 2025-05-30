
"use client";

import * as React from "react";
import { Edit, Trash2, Cable } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { getVLANsAction, deleteVLANAction } from "@/lib/actions";
import type { VLAN, PermissionId } from "@/types";
import { PERMISSIONS } from "@/types";
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog";
import { VlanFormSheet } from "./vlan-form-sheet";
import { useCurrentUser, hasPermission, type CurrentUserContextValue } from "@/hooks/use-current-user";
import { useToast } from "@/hooks/use-toast";

export default function VlansPage() {
  const [vlans, setVlans] = React.useState<VLAN[]>([]);
  const currentUser = useCurrentUser();
  const { toast } = useToast();

  React.useEffect(() => {
    async function fetchVlans() {
      try {
        const fetchedVlans = await getVLANsAction();
        setVlans(fetchedVlans);
      } catch (error) {
         toast({ title: "Error fetching VLANs", description: (error as Error).message, variant: "destructive" });
      }
    }
    if (hasPermission(currentUser, PERMISSIONS.VIEW_VLAN)) {
        fetchVlans();
    }
  }, [toast, currentUser]);

  const canView = hasPermission(currentUser, PERMISSIONS.VIEW_VLAN);
  const canCreate = hasPermission(currentUser, PERMISSIONS.CREATE_VLAN);
  const canEdit = hasPermission(currentUser, PERMISSIONS.EDIT_VLAN);
  const canDelete = hasPermission(currentUser, PERMISSIONS.DELETE_VLAN);

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Cable className="h-16 w-16 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2">Access Denied</h2>
        <p className="text-muted-foreground">You do not have permission to view VLANs.</p>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="VLAN Management"
        description="Organize and manage your Virtual LANs."
        icon={Cable}
        actionElement={canCreate ? <VlanFormSheet /> : null}
      />

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
                  <TableHead>Associated Resources</TableHead> 
                  {(canEdit || canDelete) && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {vlans.map((vlan) => (
                  <TableRow key={vlan.id}>
                    <TableCell className="font-medium">{vlan.vlanNumber}</TableCell>
                    <TableCell className="max-w-md truncate">{vlan.description || "N/A"}</TableCell>
                    <TableCell>{vlan.subnetCount ?? 0}</TableCell> 
                    {(canEdit || canDelete) && (
                      <TableCell className="text-right">
                        {canEdit && (
                            <VlanFormSheet vlan={vlan}>
                            <Button variant="ghost" size="icon" aria-label="Edit VLAN">
                                <Edit className="h-4 w-4" />
                            </Button>
                            </VlanFormSheet>
                        )}
                        {canDelete && (
                            <DeleteConfirmationDialog
                            itemId={vlan.id}
                            itemName={`VLAN ${vlan.vlanNumber}`}
                            deleteAction={deleteVLANAction}
                            triggerButton={
                                <Button variant="ghost" size="icon" aria-label="Delete VLAN">
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
              <p className="text-muted-foreground">No VLANs found.</p>
              {canCreate && <VlanFormSheet buttonProps={{className: "mt-4"}} />}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
