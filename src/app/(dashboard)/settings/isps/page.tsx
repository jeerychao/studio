
"use client";

import * as React from "react";
import { Suspense } from 'react';
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Signal, Loader2, PlusCircle, ShieldAlert } from "lucide-react";
import { useCurrentUser, hasPermission } from "@/hooks/use-current-user";
import { PERMISSIONS } from "@/types";
// import { IspFormSheet } from "./isp-form-sheet"; // Placeholder for future form

function LoadingIspsPage() {
  return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
      <p className="ml-3 text-lg">加载 ISP 管理页面...</p>
    </div>
  );
}

function IspsView() {
  const { currentUser, isAuthLoading } = useCurrentUser();

  if (isAuthLoading) {
    return <LoadingIspsPage />;
  }

  if (!currentUser || !hasPermission(currentUser, PERMISSIONS.VIEW_ISP)) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <ShieldAlert className="h-16 w-16 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2">访问被拒绝</h2>
        <p className="text-muted-foreground">您没有权限查看 ISP 管理页面。</p>
      </div>
    );
  }

  const canCreateIsp = hasPermission(currentUser, PERMISSIONS.CREATE_ISP);

  return (
    <>
      <PageHeader
        title="ISP 管理"
        description="管理互联网服务提供商 (ISP) 信息。"
        icon={<Signal className="h-6 w-6 text-primary" />}
        actionElement={
          canCreateIsp ? (
            // <IspFormSheet onIspChange={() => { /* TODO: refresh data */ }}>
            <Button disabled> {/* Replace with IspFormSheet when ready */}
              <PlusCircle className="mr-2 h-4 w-4" /> 添加 ISP
            </Button>
            // </IspFormSheet>
          ) : null
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>ISP 列表</CardTitle>
          <CardDescription>查看和管理系统中的 ISP 条目。</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>描述</TableHead>
                <TableHead>联系方式</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell colSpan={4} className="text-center h-24 text-muted-foreground">
                  功能正在开发中...
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

export default function IspManagementPage() {
  return (
    <Suspense fallback={<LoadingIspsPage />}>
      <IspsView />
    </Suspense>
  );
}
