
"use client";

import * as React from "react";
import { Edit, Trash2, Users as UsersIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { getUsersAction, getRolesAction, deleteUserAction } from "@/lib/actions";
import type { User, Role, PermissionId } from "@/types";
import { PERMISSIONS } from "@/types";
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog";
import { UserFormSheet } from "./user-form-sheet";
import { useCurrentUser, hasPermission, type CurrentUserContextValue } from "@/hooks/use-current-user";
import { useToast } from "@/hooks/use-toast";

export default function UsersPage() {
  const [users, setUsers] = React.useState<User[]>([]);
  const [roles, setRoles] = React.useState<Role[]>([]);
  const currentUser = useCurrentUser();
  const { toast } = useToast();

  React.useEffect(() => {
    async function fetchData() {
      try {
        const [fetchedUsers, fetchedRoles] = await Promise.all([
          getUsersAction(),
          getRolesAction(),
        ]);
        setUsers(fetchedUsers);
        setRoles(fetchedRoles);
      } catch (error) {
        toast({ title: "Error fetching data", description: (error as Error).message, variant: "destructive" });
      }
    }
    if (hasPermission(currentUser, PERMISSIONS.VIEW_USER)) {
        fetchData();
    }
  }, [toast, currentUser]);

  const getRoleName = (roleId: string) => {
    const role = roles.find(r => r.id === roleId);
    return role ? role.name : "N/A";
  };
  
  const getInitials = (name: string = "") => {
    return name?.split(' ').map(n => n[0]).join('').toUpperCase() || 'U';
  }

  const canView = hasPermission(currentUser, PERMISSIONS.VIEW_USER);
  const canCreate = hasPermission(currentUser, PERMISSIONS.CREATE_USER);
  const canEdit = hasPermission(currentUser, PERMISSIONS.EDIT_USER);
  const canDelete = hasPermission(currentUser, PERMISSIONS.DELETE_USER);

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <UsersIcon className="h-16 w-16 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2">Access Denied</h2>
        <p className="text-muted-foreground">You do not have permission to view users.</p>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="User Management"
        description="Administer user accounts and their roles."
        icon={UsersIcon}
        actionElement={canCreate ? <UserFormSheet roles={roles} /> : null}
      />

      <Card>
        <CardHeader>
          <CardTitle>User List</CardTitle>
          <CardDescription>All registered users in the system.</CardDescription>
        </CardHeader>
        <CardContent>
          {users.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Last Login</TableHead>
                  {(canEdit || canDelete) && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={user.avatar} alt={user.username} data-ai-hint="person portrait" />
                          <AvatarFallback>{getInitials(user.username)}</AvatarFallback>
                        </Avatar>
                        {user.username}
                      </div>
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{getRoleName(user.roleId)}</Badge>
                    </TableCell>
                     <TableCell className="text-sm text-muted-foreground">
                      {user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never'}
                    </TableCell>
                    {(canEdit || canDelete) && (
                      <TableCell className="text-right">
                        {canEdit && (
                            <UserFormSheet user={user} roles={roles}>
                            <Button variant="ghost" size="icon" aria-label="Edit User">
                                <Edit className="h-4 w-4" />
                            </Button>
                            </UserFormSheet>
                        )}
                        {/* Prevent deleting oneself or the last admin - handled in action */}
                        {canDelete && (
                            <DeleteConfirmationDialog
                            itemId={user.id}
                            itemName={user.username}
                            deleteAction={deleteUserAction}
                            triggerButton={
                                <Button variant="ghost" size="icon" aria-label="Delete User" disabled={user.id === currentUser?.id}>
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
              <p className="text-muted-foreground">No users found.</p>
              {canCreate && <UserFormSheet roles={roles} buttonProps={{className: "mt-4"}} />}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
