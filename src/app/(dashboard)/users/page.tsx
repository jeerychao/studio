"use client";

import * as React from "react";
import { Suspense } from 'react';
import { usePathname, useSearchParams } from "next/navigation";
import { Edit, Trash2, Users as UsersIcon, Loader2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { getUsersAction, getRolesAction, deleteUserAction } from "@/lib/actions";
import type { User, Role } from "@/types";
import { PERMISSIONS } from "@/types";
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog";
import { UserFormSheet } from "./user-form-sheet";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useToast } from "@/hooks/use-toast";
import { PaginationControls } from "@/components/pagination-controls";
import { useEntityManagement } from "@/hooks/use-entity-management";

function LoadingUsersPage() {
  return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
      <p className="ml-3 text-lg">加载用户中...</p>
    </div>
  );
}

function UsersView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [roles, setRoles] = React.useState<Role[]>([]);
  const { currentUser } = useCurrentUser();

  const { data: usersData, isLoading, fetchData, canView, canCreate, canEdit, canDelete } = useEntityManagement<User, any>({
    fetchAction: getUsersAction,
    permission: {
      view: PERMISSIONS.VIEW_USER,
      create: PERMISSIONS.CREATE_USER,
      edit: PERMISSIONS.EDIT_USER,
      delete: PERMISSIONS.DELETE_USER,
    },
  });

  React.useEffect(() => {
    let isMounted = true;
    if (canView) {
      getRolesAction()
        .then(fetchedRolesResult => {
          if (isMounted) setRoles(fetchedRolesResult.data);
        })
        .catch(error => {
          if (isMounted) toast({ title: "获取角色错误", description: (error as Error).message, variant: "destructive" });
        });
    }
    return () => { isMounted = false; };
  }, [canView, toast]);

  const getRoleName = (roleId: string) => {
    return roles.find(r => r.id === roleId)?.name || "无";
  };

  const getInitials = (name: string = "") => {
    return name?.split(' ').map(n => n[0]).join('').toUpperCase() || 'U';
  };

  if (isLoading) {
     return <LoadingUsersPage />;
  }

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <UsersIcon className="h-16 w-16 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2">访问被拒绝</h2>
        <p className="text-muted-foreground">您没有权限查看用户。</p>
      </div>
    );
  }

  const usersToDisplay = usersData?.data || [];

  return (
    <>
      <PageHeader
        title="用户管理"
        description="管理用户账户及其角色。"
        icon={<UsersIcon className="h-6 w-6 text-primary" />}
        actionElement={canCreate ? <UserFormSheet roles={roles} onUserChange={fetchData}/> : null}
      />

      <Card>
        <CardHeader>
          <CardTitle>用户列表</CardTitle>
          <CardDescription>系统中所有已注册用户。显示 {usersToDisplay.length} 条，共 {usersData?.totalCount || 0} 条用户数据。</CardDescription>
        </CardHeader>
        <CardContent>
          {usersToDisplay.length > 0 ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>用户</TableHead>
                    <TableHead>邮箱</TableHead>
                    <TableHead>角色</TableHead>
                    <TableHead>上次登录</TableHead>
                    {(canEdit || canDelete) && <TableHead className="text-right">操作</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usersToDisplay.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={user.avatar || '/images/avatars/default_avatar.png'} alt={user.username} />
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
                        {user.lastLogin ? new Date(user.lastLogin).toLocaleString() : '从未'}
                      </TableCell>
                      {(canEdit || canDelete) && (
                        <TableCell className="text-right">
                          {canEdit && (
                              <UserFormSheet user={user} roles={roles} onUserChange={fetchData}>
                              <Button variant="ghost" size="icon" aria-label="编辑用户">
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
                                  <Button variant="ghost" size="icon" aria-label="删除用户" disabled={currentUser?.id === user.id}>
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
              {usersData && usersData.totalPages > 1 && (
                <PaginationControls
                    currentPage={usersData.currentPage}
                    totalPages={usersData.totalPages}
                    basePath={pathname}
                    currentQuery={searchParams}
                />
              )}
            </>
          ) : (
            <div className="text-center py-10">
              <p className="text-muted-foreground">未找到用户。</p>
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
