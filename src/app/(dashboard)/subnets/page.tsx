
"use client";

import * as React from "react";
import { Suspense } from 'react';
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { NetworkIcon, Edit, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { getSubnetsAction, getVLANsAction, deleteSubnetAction, type PaginatedResponse } from "@/lib/actions";
import type { Subnet, VLAN } from "@/types";
import { PERMISSIONS } from "@/types";
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog";
import { SubnetFormSheet } from "./subnet-form-sheet";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useCurrentUser, hasPermission } from "@/hooks/use-current-user";
import { useToast } from "@/hooks/use-toast";
import { PaginationControls } from "@/components/pagination-controls";

const ITEMS_PER_PAGE = 10;

function LoadingSubnetsPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full">
      <NetworkIcon className="h-16 w-16 animate-spin text-primary mb-4" />
      <h2 className="text-2xl font-semibold mb-2">Loading Subnets...</h2>
    </div>
  );
}

function SubnetsView() {
  const [subnetsData, setSubnetsData] = React.useState<PaginatedResponse<Subnet> | null>(null);
  const [vlans, setVlans] = React.useState<VLAN[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  
  const { currentUser, isAuthLoading } = useCurrentUser();
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const page = Number(searchParams.get('page')) || 1;

  const fetchData = React.useCallback(async () => {
    if (isAuthLoading || !currentUser) {
      if (!isAuthLoading && !currentUser) { 
           setSubnetsData({ data: [], totalCount: 0, currentPage: page, totalPages: 0, pageSize: ITEMS_PER_PAGE });
           setVlans([]);
           setIsLoading(false);
      } else {
        setIsLoading(true); 
      }
      return;
    }
    setIsLoading(true);
    try {
      if (!hasPermission(currentUser, PERMISSIONS.VIEW_SUBNET)) {
          setSubnetsData({ data: [], totalCount: 0, currentPage: page, totalPages: 0, pageSize: ITEMS_PER_PAGE });
          setVlans([]);
          setIsLoading(false);
          return;
      }

      const [subnetsResponse, vlansResponse] = await Promise.all([
        getSubnetsAction({ page, pageSize: ITEMS_PER_PAGE }),
        getVLANsAction(), 
      ]);
      setSubnetsData(subnetsResponse);
      setVlans(vlansResponse.data || []); 
    } catch (error: any) {
      console.error("Error loading subnet data:", error);
      toast({
        title: "Error Loading Subnets",
        description: error.message || "Failed to load subnets and VLANs.",
        variant: "destructive",
      });
      setSubnetsData({ data: [], totalCount: 0, currentPage: page, totalPages: 0, pageSize: ITEMS_PER_PAGE });
      setVlans([]);
    } finally {
      setIsLoading(false);
    }
  }, [page, toast, currentUser, isAuthLoading]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);


  if (isAuthLoading || isLoading) { 
    return <LoadingSubnetsPage />;
  }

  if (!currentUser || !hasPermission(currentUser, PERMISSIONS.VIEW_SUBNET)) {
    return (
        <div className="flex flex-col items-center justify-center h-full">
            <NetworkIcon className="h-16 w-16 text-destructive mb-4" />
            <h2 className="text-2xl font-semibold mb-2">Access Denied</h2>
            <p className="text-muted-foreground">You do not have permission to view subnets.</p>
        </div>
    );
  }
  
  if (!subnetsData) {
    return <p>Error preparing subnet data. Please try refreshing.</p>; 
  }

  const { data: subnets, totalCount, currentPage, totalPages } = subnetsData;
  
  const canCreate = hasPermission(currentUser, PERMISSIONS.CREATE_SUBNET);
  const canEdit = hasPermission(currentUser, PERMISSIONS.EDIT_SUBNET);
  const canDelete = hasPermission(currentUser, PERMISSIONS.DELETE_SUBNET);

  return (
    <>
      <div className="md:hidden"> 
        <Card>
          <CardHeader>
            <CardTitle>Mobile View Not Supported</CardTitle>
            <CardDescription>Please use a desktop or larger screen to view this page.</CardDescription>
          </CardHeader>
        </Card>
      </div>
      <div className="hidden md:block">
        <PageHeader
          title="Subnets"
          description="View, create, and manage your network subnets."
          actionElement={canCreate ? <SubnetFormSheet vlans={vlans} onSubnetChange={fetchData} /> : null}
        />
        <Card>
          <CardHeader>
            <CardTitle>Subnet List</CardTitle>
            <CardDescription>
              Displaying {subnets.length} of {totalCount} subnets.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>CIDR</TableHead>
                  <TableHead>VLAN</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Utilization</TableHead>
                  {(canEdit || canDelete) && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {subnets.map((subnet) => {
                  const vlanInfo = subnet.vlanId ? vlans.find(v => v.id === subnet.vlanId) : null;
                  return (
                    <TableRow key={subnet.id}>
                      <TableCell>
                        <Link href={`/ip-addresses?subnetId=${subnet.id}`} className="hover:underline font-medium">
                          {subnet.cidr}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {vlanInfo ? (
                          <Badge variant="outline">VLAN {vlanInfo.vlanNumber}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">N/A</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-sm text-muted-foreground">{subnet.description || "N/A"}</TableCell>
                      <TableCell>
                        <Badge variant={ (subnet.utilization ?? 0) > 85 ? "destructive" : "secondary"}>
                          {subnet.utilization ?? 0}%
                        </Badge>
                      </TableCell>
                      {(canEdit || canDelete) && (
                        <TableCell className="text-right">
                          {canEdit && (
                            <SubnetFormSheet
                              subnet={subnet}
                              vlans={vlans}
                              onSubnetChange={fetchData}
                            >
                              <Button variant="ghost" size="icon" aria-label="Edit Subnet">
                                <Edit className="h-4 w-4" />
                              </Button>
                            </SubnetFormSheet>
                          )}
                          {canDelete && (
                            <DeleteConfirmationDialog
                              itemId={subnet.id}
                              itemName={subnet.cidr}
                              deleteAction={deleteSubnetAction}
                              onDeleted={fetchData}
                              dialogTitle="Delete Subnet?"
                              dialogDescription={`Are you sure you want to delete subnet ${subnet.cidr}? This action cannot be undone.`}
                              triggerButton={
                                <Button variant="ghost" size="icon" aria-label="Delete Subnet">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              }
                            />
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
                {subnets.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={(canEdit || canDelete) ? 5 : 4} className="text-center h-24 text-muted-foreground">
                      No subnets found. {canCreate && "Try creating one!"}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            {totalPages > 1 && (
              <PaginationControls
                currentPage={currentPage}
                totalPages={totalPages}
                basePath={pathname}
                currentQuery={searchParams}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export default function SubnetsPage() {
  return (
    <Suspense fallback={<LoadingSubnetsPage />}>
      <SubnetsView />
    </Suspense>
  );
}

