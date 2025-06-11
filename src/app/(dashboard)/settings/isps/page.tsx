
"use client";
// This file is effectively replaced by /dictionaries/operator/page.tsx
// Keeping it as a placeholder for now, but its content should be removed or point to the new location if desired.
// For this refactor, we assume its navigation entry is removed and functionality moved.

import * as React from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Signal, Loader2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

function DeprecatedIspPage() {
  return (
    <>
      <PageHeader
        title="ISP 管理 (已移动)"
        description="此功能已移至“字典管理”下的“运营商字典”。"
        icon={<Signal className="h-6 w-6 text-primary" />}
      />
      <Card>
        <CardHeader>
          <CardTitle>功能已迁移</CardTitle>
          <CardDescription>
            ISP（互联网服务提供商）管理现已作为“运营商字典”的一部分。
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center py-10">
          <p className="text-muted-foreground mb-4">
            请访问新的运营商字典页面管理此数据。
          </p>
          <Button asChild>
            <Link href="/dictionaries/operator">前往运营商字典</Link>
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

    