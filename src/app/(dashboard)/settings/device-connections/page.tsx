
"use client";

import * as React from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WifiOff } from "lucide-react"; // Example icon for a placeholder/removed feature

export default function DeviceConnectionsPage() {
  return (
    <>
      <PageHeader
        title="设备连接管理 (已移除)"
        description="此功能页面已被移除或尚未实现。"
        icon={<WifiOff className="h-6 w-6 text-muted-foreground" />}
      />
      <Card>
        <CardHeader>
          <CardTitle>功能不可用</CardTitle>
          <CardDescription>
            “设备连接管理”功能当前不可用或已被移除。
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center py-10">
          <p className="text-muted-foreground">
            此功能的相关代码和入口点已清理。
          </p>
        </CardContent>
      </Card>
    </>
  );
}
