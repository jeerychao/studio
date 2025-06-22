
"use client";

import * as React from "react";
import { Suspense } from 'react';
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Edit, ShieldCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { getRolesAction } from "@/lib/actions"; 
import type { Role, PaginatedResponse } from "@/types";
import { PERMISSIONS } from "@/types";
import { RoleFormSheet } from "./role-form-sheet";
import { useCurrentUser, hasPermission } from "@/hooks/use-current-user";
import { useToast } from "@/hooks/use-toast";
import { PaginationControls } from "@/components/pagination-controls";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";

function LoadingRolesPage() {
  return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
      <p className="ml-3 text-lg">加载角色中...</p>
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
          const fetchedRolesResult = await getRolesAction({ page: currentPage, pageSize: DEFAULT_PAGE_SIZE });
          setRolesData(fetchedRolesResult);
      } else {
        setRolesData({ data: [], totalCount: 0, currentPage: 1, totalPages: 0, pageSize: DEFAULT_PAGE_SIZE });
      }
    } catch (error) {
      toast({ title: "获取角色错误", description: (error as Error).message, variant: "destructive" });
      setRolesData({ data: [], totalCount: 0, currentPage: 1, totalPages: 0, pageSize: DEFAULT_PAGE_SIZE });
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
        <h2 className="text-2xl font-semibold mb-2">访问被拒绝</h2>
        <p className="text-muted-foreground">您没有权限查看此页面。</p>
      </div>
    );
  }
  
  const canEditRolePermissions = hasPermission(currentUser, PERMISSIONS.EDIT_ROLE_PERMISSIONS);
  const canEditRoleDescription = hasPermission(currentUser, PERMISSIONS.EDIT_ROLE_DESCRIPTION);
  const canEditAnyPartOfRole = canEditRolePermissions || canEditRoleDescription;


  return (
    <TooltipProvider>
      <PageHeader
        title="角色管理"
        description="查看系统角色并管理其描述和权限。"
        icon={<ShieldCheck className="h-6 w-6 text-primary" />}
      />

      <Card>
        <CardHeader>
          <CardTitle>系统角色</CardTitle>
          <CardDescription>
            这些角色具有预定义的名称。管理员可以编辑它们的描述和细粒度权限。
            显示 {rolesData?.data.length} 条，共 {rolesData?.totalCount} 条角色数据。
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rolesData && rolesData.data.length > 0 ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>角色名称</TableHead>
                    <TableHead>已分配权限数</TableHead>
                    <TableHead>用户数</TableHead>
                    <TableHead>描述</TableHead>
                    {canEditAnyPartOfRole && <TableHead className="text-right">操作</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rolesData.data.map((role) => (
                    <TableRow key={role.id}>
                      <TableCell className="font-medium">{role.name}</TableCell>
                      <TableCell>{role.permissions.length}</TableCell>
                      <TableCell>{role.userCount ?? 0}</TableCell>
                      <TableCell className="max-w-md truncate">
                        {role.description ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-default">{role.description}</span>
                            </TooltipTrigger>
                            <TooltipContent side="top" align="start">
                              <p className="max-w-xs whitespace-pre-wrap break-words">{role.description}</p>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          "无"
                        )}
                      </TableCell>
                      {canEditAnyPartOfRole && (
                        <TableCell className="text-right">
                          <RoleFormSheet role={role} onRoleChange={fetchData}>
                            <Button variant="ghost" size="icon" aria-label="编辑角色">
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
              <p className="text-muted-foreground">未找到角色或无法加载角色。</p>
            </div>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}

export default function RolesPage() {
  return (
    <Suspense fallback={<LoadingRolesPage />}>
      <RolesView />
    </Suspense>
  );
}
