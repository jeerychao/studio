
"use client";

import * as React from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HardDrive, Loader2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

function DeprecatedDevicePage() {
  return (
    <>
      <PageHeader
        title="设备管理 (已移动)"
        description="此功能已移至“字典管理”下的“设备字典”。"
        icon={<HardDrive className="h-6 w-6 text-primary" />}
      />
      <Card>
        <CardHeader>
          <CardTitle>功能已迁移</CardTitle>
          <CardDescription>
            设备管理现已作为“设备字典”的一部分。
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center py-10">
          <p className="text-muted-foreground mb-4">
            请访问新的设备字典页面管理此数据。
          </p>
          <Button asChild>
            <Link href="/dictionaries/device">前往设备字典</Link>
          </Button>
        </CardContent>
      </Card>
    </>
  );
}

export default function DeviceManagementPage() {
  const [isLoading, setIsLoading] = React.useState(true);
  React.useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 200);
    return () => clearTimeout(timer);
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-3 text-lg">加载页面...</p>
      </div>
    );
  }
  
  return <DeprecatedDevicePage />;
}
