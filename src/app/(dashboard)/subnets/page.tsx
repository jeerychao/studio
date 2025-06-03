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

  React.useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        const [subnetsResponse, vlansResponse] = await Promise.all([
          getSubnetsAction({ page, pageSize: ITEMS_PER_PAGE }),
          getVLANsAction(),
        ]);
        setSubnetsData(subnetsResponse);
        setVlans(vlansResponse.data);
      } catch (error: any) {
        console.error("Error loading data:", error);
        toast({
          title: "Error loading subnets",
          description: error.message || "Failed to load subnets.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [page, toast]);

  const handleSubnetDelete = async (subnetId: string) => {
    if (!currentUser || !hasPermission(currentUser, PERMISSIONS.SUBNET_DELETE)) {
      toast({
        title: "Unauthorized",
        description: "You do not have permission to delete subnets.",
        variant: "destructive",
      });
      return;
    }

    try {
      const result = await deleteSubnetAction(subnetId);
      if (result.success) {
        toast({
          title: "Subnet deleted",
          description: "Subnet deleted successfully.",
        });
        
        // Refresh data.  Ideally, should update local state instead of full reload.
        const subnetsResponse = await getSubnetsAction({ page, pageSize: ITEMS_PER_PAGE });
        setSubnetsData(subnetsResponse);

      } else {
        toast({
          title: "Error deleting subnet",
          description: "Failed to delete the subnet.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("Error deleting subnet:", error);
      toast({
        title: "Error deleting subnet",
        description: error.message || "Failed to delete the subnet.",
        variant: "destructive",
      });
    }
  };

  if (isLoading || isAuthLoading) {
    return <LoadingSubnetsPage />;
  }

  if (!subnetsData) {
    return <p>Error loading subnets.</p>;
  }
  const { data: subnets, totalCount, currentPage, totalPages } = subnetsData;
  const canEdit = currentUser && hasPermission(currentUser, PERMISSIONS.SUBNET_EDIT);
  const canDelete = currentUser && hasPermission(currentUser, PERMISSIONS.SUBNET_DELETE);
  const canCreate = currentUser && hasPermission(currentUser, PERMISSIONS.SUBNET_CREATE);

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
        description="View, create, and manage your subnets."
        itemsCount={totalCount}
      >
        {canCreate && <SubnetFormSheet vlans={vlans} />}
      </PageHeader>
      <Card>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>CIDR</TableHead>
                <TableHead>VLAN</TableHead>
                <TableHead>Utilization</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subnets.map((subnet) => (
                <TableRow key={subnet.id}>
                  <TableCell>
                    <Link href={`/ip-addresses?subnetId=${subnet.id}`} className="hover:underline">
                      {subnet.cidr}
                    </Link>
                  </TableCell>
                  <TableCell>{subnet.vlanId ? vlans.find(v => v.id === subnet.vlanId)?.vlanNumber : <Badge variant="outline">Global Pool</Badge>}</TableCell>
                  <TableCell>{subnet.utilization}%</TableCell>
                  <TableCell className="text-right font-medium">
                    {canEdit && (
                      <SubnetFormSheet
                        subnet={subnet}
                        vlans={vlans}
                        trigger={
                          <Button variant="ghost" size="sm">
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </Button>
                        }
                      />
                    )}
                    {canDelete && (
                      <DeleteConfirmationDialog
                        itemName={subnet.cidr}
                        onConfirm={() => handleSubnetDelete(subnet.id)}
                        dialogTitle="Delete Subnet?"
                        dialogDescription={`Are you sure you want to delete subnet ${subnet.cidr}?`}
                        trigger={
                          <Button variant="ghost" size="sm" className="text-red-500">
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </Button>
                        }
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {subnets.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center">
                    No subnets found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <CardContent>
          <PaginationControls
            currentPage={currentPage}
            totalPages={totalPages}
            basePath={pathname}
            currentQuery={searchParams}
          />
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
