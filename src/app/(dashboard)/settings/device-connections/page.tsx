
"use client";

import * as React from "react";
import { Suspense } from 'react';
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Link2, Loader2, PlusCircle, ShieldAlert } from "lucide-react";
import { useCurrentUser, hasPermission } from "@/hooks/use-current-user";
import { PERMISSIONS } from "@/types";
// import { DeviceConnectionFormSheet } from "./device-connection-form-sheet"; // Placeholder

function LoadingDeviceConnectionsPage() {
  return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
      <p className="ml-3 text-lg">加载设备连接管理页面...</p>
    </div>
  );
}

function DeviceConnectionsView() {
  const { currentUser, isAuthLoading } = useCurrentUser();

  if (isAuthLoading) {
    return <LoadingDeviceConnectionsPage />;
  }

  if (!currentUser || !hasPermission(currentUser, PERMISSIONS.VIEW_DEVICECONNECTION)) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <ShieldAlert className="h-16 w-16 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2">访问被拒绝</h2>
        <p className="text-muted-foreground">您没有权限查看设备连接管理页面。</p>
      </div>
    );
  }

  const canCreateConnection = hasPermission(currentUser, PERMISSIONS.CREATE_DEVICECONNECTION);

  return (
    <>
      <PageHeader
        title="设备连接管理"
        description="管理设备之间的物理或逻辑连接。"
        icon={<Link2 className="h-6 w-6 text-primary" />}
        actionElement={
          canCreateConnection ? (
            // <DeviceConnectionFormSheet onConnectionChange={() => { /* TODO: refresh data */ }}>
            <Button disabled> {/* Replace with DeviceConnectionFormSheet when ready */}
              <PlusCircle className="mr-2 h-4 w-4" /> 添加连接
            </Button>
            // </DeviceConnectionFormSheet>
          ) : null
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>设备连接列表</CardTitle>
          <CardDescription>查看和管理系统中的设备连接条目。</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>本地设备</TableHead>
                <TableHead>本地 IP</TableHead>
                <TableHead>远程设备/IP</TableHead>
                <TableHead>ISP</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>带宽</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell colSpan={8} className="text-center h-24 text-muted-foreground">
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

export default function DeviceConnectionManagementPage() {
  return (
    <Suspense fallback={<LoadingDeviceConnectionsPage />}>
      <DeviceConnectionsView />
    </Suspense>
  );
}
