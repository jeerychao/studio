
"use client";
// This file is effectively replaced by /dictionaries/operator/page.tsx
// Keeping it as a placeholder for now, but its content should be removed or point to the new location if desired.
// For this refactor, we assume its navigation entry is removed and functionality moved.
// THIS FILE IS NO LONGER USED AND ITS NAVIGATION ENTRY SHOULD BE REMOVED.

import * as React from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SignalOff, Loader2 } from "lucide-react"; // Changed icon to SignalOff
import Link from "next/link";
import { Button } from "@/components/ui/button";

function DeprecatedIspPage() {
  return (
    <>
      <PageHeader
        title="ISP 管理 (已废弃)" // Updated title
        description="此功能已被移除。运营商相关信息已整合到IP地址管理中，作为更通用的“对端”信息的一部分。" // Updated description
        icon={<SignalOff className="h-6 w-6 text-destructive" />} // Changed icon
      />
      <Card>
        <CardHeader>
          <CardTitle>功能已废弃</CardTitle>
          <CardDescription>
            独立的 ISP/运营商字典管理功能已被移除。
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center py-10">
          <p className="text-muted-foreground mb-4">
            与对端（原运营商）相关的信息，例如对端单位名称、对端设备等，现在直接在 IP 地址表单中管理。
          </p>
          <Button asChild>
            <Link href="/ip-addresses">前往 IP 地址管理</Link>
          </Button>
        </CardContent>
      </Card>
    </>
  );
}

export default function IspManagementPage() {
  // Simulate loading to avoid flash of old content if any was there
  const [isLoading, setIsLoading] = React.useState(true);
  React.useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 200); // Short delay
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
  
  return <DeprecatedIspPage />;
}
