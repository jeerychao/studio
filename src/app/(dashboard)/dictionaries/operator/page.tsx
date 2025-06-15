
"use client";
// This file is effectively removed as OperatorDictionary is no longer used.
// The route will result in a 404 if accessed.

import * as React from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Network, Loader2, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

function RemovedOperatorDictionaryPage() {
  return (
    <>
      <PageHeader
        title="运营商字典 (已移除)"
        description="此功能已被移除，相关信息已整合到IP地址的对端信息中。"
        icon={<Network className="h-6 w-6 text-destructive" />}
      />
      <Card>
        <CardHeader>
          <CardTitle>功能已移除</CardTitle>
          <CardDescription>
            独立的运营商字典管理功能已被移除。
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center py-10">
          <p className="text-muted-foreground mb-4">
            与对端（原运营商）相关的信息，例如对端单位名称、对端设备等，现在直接在 IP 地址表单中管理。
            设备定义请使用“设备字典”。
          </p>
          <Button asChild className="mr-2">
            <Link href="/ip-addresses">前往 IP 地址管理</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dictionaries/device">前往设备字典</Link>
          </Button>
        </CardContent>
      </Card>
    </>
  );
}

export default function OperatorDictionaryPage() {
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
  
  return <RemovedOperatorDictionaryPage />;
}
