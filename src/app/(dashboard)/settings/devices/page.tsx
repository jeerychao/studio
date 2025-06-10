
"use client";

import * as React from "react";
import { Suspense } from 'react';
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { HardDrive, Loader2, PlusCircle, ShieldAlert } from "lucide-react";
import { useCurrentUser, hasPermission } from "@/hooks/use-current-user";
import { PERMISSIONS } from "@/types";
// import { DeviceFormSheet } from "./device-form-sheet"; // Placeholder

function LoadingDevicesPage() {
  return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
      <p className="ml-3 text-lg">加载设备管理页面...</p>
    </div>
  );
}

function DevicesView() {
  const { currentUser, isAuthLoading } = useCurrentUser();

  if (isAuthLoading) {
    return <LoadingDevicesPage />;
  }

  if (!currentUser || !hasPermission(currentUser, PERMISSIONS.VIEW_DEVICE)) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <ShieldAlert className="h-16 w-16 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2">访问被拒绝</h2>
        <p className="text-muted-foreground">您没有权限查看设备管理页面。</p>
      </div>
    );
  }

  const canCreateDevice = hasPermission(currentUser, PERMISSIONS.CREATE_DEVICE);

  return (
    <>
      <PageHeader
        title="设备管理"
        description="管理网络设备信息，如路由器、交换机、服务器等。"
        icon={<HardDrive className="h-6 w-6 text-primary" />}
        actionElement={
          canCreateDevice ? (
            // <DeviceFormSheet onDeviceChange={() => { /* TODO: refresh data */ }}>
            <Button disabled> {/* Replace with DeviceFormSheet when ready */}
              <PlusCircle className="mr-2 h-4 w-4" /> 添加设备
            </Button>
            // </DeviceFormSheet>
          ) : null
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>设备列表</CardTitle>
          <CardDescription>查看和管理系统中的网络设备条目。</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>位置</TableHead>
                <TableHead>管理 IP</TableHead>
                <TableHead>品牌</TableHead>
                <TableHead>型号</TableHead>
                <TableHead>序列号</TableHead>
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

export default function DeviceManagementPage() {
  return (
    <Suspense fallback={<LoadingDevicesPage />}>
      <DevicesView />
    </Suspense>
  );
}
