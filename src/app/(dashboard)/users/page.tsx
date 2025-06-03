"use client";

import * as React from "react";
import { Suspense } from 'react';
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Edit, Trash2, Users as UsersIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { getUsersAction, getRolesAction, deleteUserAction, type PaginatedResponse } from "@/lib/actions";
import type { User, Role } from "@/types";
import { PERMISSIONS } from "@/types";
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog";
import { UserFormSheet } from "./user-form-sheet";
import { useCurrentUser, hasPermission } from "@/hooks/use-current-user";
import { useToast } from "@/hooks/use-toast";
import { PaginationControls } from "@/components/pagination-controls";

const ITEMS_PER_PAGE = 10;

function LoadingUsersPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full">
      <UsersIcon className="h-16 w-16 animate-spin text-primary mb-4" />
      <h2 className="text-2xl font-semibold mb-2">Loading Users...</h2>
    </div>
  );
}

function UsersView() {
  const [usersData, setUsersData] = React.useState<PaginatedResponse<User> | null>(null);
  const [roles, setRoles] = React.useState<Role[]>([]); // For role name display and form
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
      if (hasPermission(currentUser, PERMISSIONS.VIEW_USER)) {
        const [fetchedUsersResult, fetchedRolesResult] = await Promise.all([
          getUsersAction({ page: currentPage, pageSize: ITEMS_PER_PAGE }),
          getRolesAction(), // Roles list is small, not paginating for dropdowns
        ]);
        setUsersData(fetchedUsersResult);
        setRoles(fetchedRolesResult.data);
      } else {
        setUsersData({ data: [], totalCount: 0, currentPage: 1, totalPages: 0, pageSize: ITEMS_PER_PAGE });
        setRoles([]);
      }
    } catch (error) {
      toast({ title: "Error fetching data", description: (error as Error).message, variant: "destructive" });
      setUsersData({ data: [], totalCount: 0, currentPage: 1, totalPages: 0, pageSize: ITEMS_PER_PAGE });
    } finally {
      setIsLoading(false);
    }
  }, [currentUser, isAuthLoading, toast, currentPage]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const getRoleName = (roleId: string) => {
    const role = roles.find(r => r.id === roleId);
    return role ? role.name : "N/A";
  };
  
  const getInitials = (name: string = "") => {
    return name?.split(' ').map(n => n[0]).join('').toUpperCase() || 'U';
  }

  if (isAuthLoading || isLoading) {
     return <LoadingUsersPage />;
  }

  if (!currentUser || !hasPermission(currentUser, PERMISSIONS.VIEW_USER)) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <UsersIcon className="h-16 w-16 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2">Access Denied</h2>
        <p className="text-muted-foreground">You do not have permission to view users.</p>
      </div>
    );
  }

  const canCreate = hasPermission(currentUser, PERMISSIONS.CREATE_USER);
  const canEdit = hasPermission(currentUser, PERMISSIONS.EDIT_USER);
  const canDelete = hasPermission(currentUser, PERMISSIONS.DELETE_USER);

  return (
    <>
      <PageHeader
        title="User Management"
        description="Administer user accounts and their roles."
        icon={UsersIcon}
        actionElement={canCreate ? <UserFormSheet roles={roles} onUserChange={fetchData}/> : null}
      />

      <Card>
        <CardHeader>
          <CardTitle>User List</CardTitle>
          <CardDescription>All registered users in the system. Displaying {usersData?.data.length} of {usersData?.totalCount} users.</CardDescription>
        </CardHeader>
        <CardContent>
          {usersData && usersData.data.length > 0 ? (
            <>
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
                  {usersData.data.map((user) => (
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
                              <UserFormSheet user={user} roles={roles} onUserChange={fetchData}>
                              <Button variant="ghost" size="icon" aria-label="Edit User">
                                  <Edit className="h-4 w-4" />
                              </Button>
                              </UserFormSheet>
                          )}
                          {canDelete && (
                              <DeleteConfirmationDialog
                              itemId={user.id}
                              itemName={user.username}
                              deleteAction={deleteUserAction}
                              onDeleted={fetchData}
                              triggerButton={
                                  <Button variant="ghost" size="icon" aria-label="Delete User" disabled={currentUser?.id === user.id}>
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
                currentPage={usersData.currentPage}
                totalPages={usersData.totalPages}
                basePath={pathname}
                currentQuery={searchParams}
              />
            </>
          ) : (
            <div className="text-center py-10">
              <p className="text-muted-foreground">No users found.</p>
              {canCreate && <UserFormSheet roles={roles} onUserChange={fetchData} buttonProps={{className: "mt-4"}} />}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

export default function UsersPage() {
  return (
    <Suspense fallback={<LoadingUsersPage />}>
      <UsersView />
    </Suspense>
  );
}