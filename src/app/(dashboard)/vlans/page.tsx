
"use client";

import * as React from "react";
import { Suspense } from 'react';
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Edit, Trash2, Cable } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { getVLANsAction, deleteVLANAction, type PaginatedResponse } from "@/lib/actions";
import type { VLAN } from "@/types";
import { PERMISSIONS } from "@/types";
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog";
import { VlanFormSheet } from "./vlan-form-sheet";
import { useCurrentUser, hasPermission } from "@/hooks/use-current-user";
import { useToast } from "@/hooks/use-toast";
import { PaginationControls } from "@/components/pagination-controls";

const ITEMS_PER_PAGE = 10;

function LoadingVlansPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full">
      <Cable className="h-16 w-16 animate-spin text-primary mb-4" />
      <h2 className="text-2xl font-semibold mb-2">Loading VLANs...</h2>
    </div>
  );
}

function VlansView() {
  const [vlansData, setVlansData] = React.useState<PaginatedResponse<VLAN> | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const { currentUser, isAuthLoading } = useCurrentUser();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const currentPage = Number(searchParams.get('page')) || 1;

  const fetchData = React.useCallback(async () => {
    if (isAuthLoading || !currentUser) return;
    setIsLoading(true);
    try {
      if (hasPermission(currentUser, PERMISSIONS.VIEW_VLAN)) {
        const fetchedVlansResult = await getVLANsAction({ page: currentPage, pageSize: ITEMS_PER_PAGE });
        setVlansData(fetchedVlansResult);
      } else {
        setVlansData({ data: [], totalCount: 0, currentPage: 1, totalPages: 0, pageSize: ITEMS_PER_PAGE });
      }
    } catch (error) {
       toast({ title: "Error fetching VLANs", description: (error as Error).message, variant: "destructive" });
       setVlansData({ data: [], totalCount: 0, currentPage: 1, totalPages: 0, pageSize: ITEMS_PER_PAGE });
    } finally {
      setIsLoading(false);
    }
  }, [currentUser, isAuthLoading, toast, currentPage]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (isAuthLoading || isLoading) {
     return <LoadingVlansPage />;
  }

  if (!currentUser || !hasPermission(currentUser, PERMISSIONS.VIEW_VLAN)) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Cable className="h-16 w-16 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2">Access Denied</h2>
        <p className="text-muted-foreground">You do not have permission to view VLANs.</p>
      </div>
    );
  }
  
  const canCreate = hasPermission(currentUser, PERMISSIONS.CREATE_VLAN);
  const canEdit = hasPermission(currentUser, PERMISSIONS.EDIT_VLAN);
  const canDelete = hasPermission(currentUser, PERMISSIONS.DELETE_VLAN);

  return (
    <>
      <PageHeader
        title="VLAN Management"
        description="Organize and manage your Virtual LANs."
        icon={Cable}
        actionElement={canCreate ? <VlanFormSheet onVlanChange={fetchData}/> : null}
      />

      <Card>
        <CardHeader>
          <CardTitle>VLAN List</CardTitle>
          <CardDescription>All configured VLANs in your network. Displaying {vlansData?.data.length} of {vlansData?.totalCount} VLANs.</CardDescription>
        </CardHeader>
        <CardContent>
          {vlansData && vlansData.data.length > 0 ? (
            <>
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
                  {vlansData.data.map((vlan) => (
                    <TableRow key={vlan.id}>
                      <TableCell className="font-medium">{vlan.vlanNumber}</TableCell>
                      <TableCell className="max-w-md truncate">{vlan.description || "N/A"}</TableCell>
                      <TableCell>{vlan.subnetCount ?? 0}</TableCell> 
                      {(canEdit || canDelete) && (
                        <TableCell className="text-right">
                          {canEdit && (
                              <VlanFormSheet vlan={vlan} onVlanChange={fetchData}>
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
                              onDeleted={fetchData}
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
              <PaginationControls
                currentPage={vlansData.currentPage}
                totalPages={vlansData.totalPages}
                basePath={pathname}
                currentQuery={searchParams}
              />
            </>
          ) : (
             <div className="text-center py-10">
              <p className="text-muted-foreground">No VLANs found.</p>
              {canCreate && <VlanFormSheet onVlanChange={fetchData} buttonProps={{className: "mt-4"}} />}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

export default function VlansPage() {
  return (
    <Suspense fallback={<LoadingVlansPage