
"use client";

import * as React from "react";
import { Edit, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { getRolesAction } from "@/lib/actions"; 
import type { Role, PermissionId } from "@/types";
import { PERMISSIONS } from "@/types";
import { RoleFormSheet } from "./role-form-sheet";
import { useCurrentUser, hasPermission } from "@/hooks/use-current-user";
import { useToast } from "@/hooks/use-toast";

export default function RolesPage() {
  const [roles, setRoles] = React.useState<Role[]>([]);
  const currentUser = useCurrentUser();
  const { toast } = useToast();

  React.useEffect(() => {
    async function fetchRoles() {
      try {
        const fetchedRoles = await getRolesAction();
        setRoles(fetchedRoles);
      } catch (error) {
        toast({ title: "Error fetching roles", description: (error as Error).message, variant: "destructive" });
      }
    }
    fetchRoles();
  }, [toast, currentUser]); // Re-fetch if currentUser changes, e.g. for re-evaluating permissions

  const canViewRoles = hasPermission(currentUser, PERMISSIONS.VIEW_ROLE);
  const canEditRolePermissions = hasPermission(currentUser, PERMISSIONS.EDIT_ROLE_PERMISSIONS);
  const canEditRoleDescription = hasPermission(currentUser, PERMISSIONS.EDIT_ROLE_DESCRIPTION);

  if (!canViewRoles) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <ShieldCheck className="h-16 w-16 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2">Access Denied</h2>
        <p className="text-muted-foreground">You do not have permission to view this page.</p>
      </div>
    );
  }
  
  const canEditAnyPartOfRole = canEditRolePermissions || canEditRoleDescription;


  return (
    <>
      <PageHeader
        title="Role Management"
        description="View system roles and manage their descriptions and permissions."
        icon={ShieldCheck}
        // "Add Role" button is not present as roles are fixed
      />

      <Card>
        <CardHeader>
          <CardTitle>System Roles</CardTitle>
          <CardDescription>
            These roles have predefined names. Administrators can edit their descriptions and granular permissions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {roles.length > 0 ? (
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
                {roles.map((role) => (
                  <TableRow key={role.id}>
                    <TableCell className="font-medium">{role.name}</TableCell>
                    <TableCell className="max-w-md truncate">{role.description || "N/A"}</TableCell>
                    <TableCell>{role.permissions.length}</TableCell>
                    <TableCell>{role.userCount ?? 0}</TableCell>
                    {canEditAnyPartOfRole && (
                      <TableCell className="text-right">
                        <RoleFormSheet role={role}>
                          <Button variant="ghost" size="icon" aria-label="Edit Role">
                            <Edit className="h-4 w-4" />
                          </Button>
                        </RoleFormSheet>
                        {/* Delete button for fixed roles is removed */}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
