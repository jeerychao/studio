"use client";

import * as React from "react";
import { Suspense } from 'react';
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Edit, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { getRolesAction, type PaginatedResponse } from "@/lib/actions"; 
import type { Role } from "@/types";
import { PERMISSIONS } from "@/types";
import { RoleFormSheet } from "./role-form-sheet";
import { useCurrentUser, hasPermission } from "@/hooks/use-current-user";
import { useToast } from "@/hooks/use-toast";
import { PaginationControls } from "@/components/pagination-controls";

const ITEMS_PER_PAGE = 10; // Or a suitable number for roles

function LoadingRolesPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full">
      <ShieldCheck className="h-16 w-16 animate-spin text-primary mb-4" />
      <h2 className="text-2xl font-semibold mb-2">Loading Roles...</h2>
    </div>
  );
}

function RolesView() {
  const [rolesData, setRolesData] = React.useState<PaginatedResponse<Role> | null>(null);
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
      if (hasPermission(currentUser, PERMISSIONS.VIEW_ROLE)) {
          const fetchedRolesResult = await getRolesAction({ page: currentPage, pageSize: ITEMS_PER_PAGE });
          setRolesData(fetchedRolesResult);
      } else {
        setRolesData({ data: [], totalCount: 0, currentPage: 1, totalPages: 0, pageSize: ITEMS_PER_PAGE });
      }
    } catch (error) {
      toast({ title: "Error fetching roles", description: (error as Error).message, variant: "destructive" });
      setRolesData({ data: [], totalCount: 0, currentPage: 1, totalPages: 0, pageSize: ITEMS_PER_PAGE });
    } finally {
      setIsLoading(false);
    }
  }, [currentUser, isAuthLoading, toast, currentPage]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (isAuthLoading || isLoading) {
     return <LoadingRolesPage />;
  }
  
  if (!currentUser || !hasPermission(currentUser, PERMISSIONS.VIEW_ROLE)) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <ShieldCheck className="h-16 w-16 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2">Access Denied</h2>
        <p className="text-muted-foreground">You do not have permission to view this page.</p>
      </div>
    );
  }
  
  const canEditRolePermissions = hasPermission(currentUser, PERMISSIONS.EDIT_ROLE_PERMISSIONS);
  const canEditRoleDescription = hasPermission(currentUser, PERMISSIONS.EDIT_ROLE_DESCRIPTION);
  const canEditAnyPartOfRole = canEditRolePermissions || canEditRoleDescription;


  return (
    <>
      <PageHeader
        title="Role Management"
        description="View system roles and manage their descriptions and permissions."
        icon={ShieldCheck}
      />

      <Card>
        <CardHeader>
          <CardTitle>System Roles</CardTitle>
          <CardDescription>
            These roles have predefined names. Administrators can edit their descriptions and granular permissions.
            Displaying {rolesData?.data.length} of {rolesData?.totalCount} roles.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rolesData && rolesData.data.length > 0 ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Role Name</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Permissions Assigned</TableHead>
                    <TableHead>Users</TableHead>
                    {canEditAnyPartOfRole && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rolesData.data.map((role) => (
                    <TableRow key={role.id}>
                      <TableCell className="font-medium">{role.name}</TableCell>
                      <TableCell className="max-w-md truncate">{role.description || "N/A"}</TableCell>
                      <TableCell>{role.permissions.length}</TableCell>
                      <TableCell>{role.userCount ?? 0}</TableCell>
                      {canEditAnyPartOfRole && (
                        <TableCell className="text-right">
                          <RoleFormSheet role={role} onRoleChange={fetchData}>
                            <Button variant="ghost" size="icon" aria-label="Edit Role">
                              <Edit className="h-4 w-4" />
                            </Button>
                          </RoleFormSheet>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <PaginationControls
                currentPage={rolesData.currentPage}
                totalPages={rolesData.totalPages}
                basePath={pathname}
                currentQuery={searchParams}
              />
            </>
          ) : (
            <div className="text-center py-10">
              <p className="text-muted-foreground">No roles found or unable to load roles.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

export default function RolesPage() {
  return (
    <Suspense fallback={<LoadingRolesPage />}>
      <RolesView />
    </Suspense>
  );
}