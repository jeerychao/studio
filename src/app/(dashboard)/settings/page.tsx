
"use client";

import * as React from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings, Loader2, ShieldAlert } from "lucide-react";
import { useCurrentUser, hasPermission } from "@/hooks/use-current-user";
import { PERMISSIONS } from "@/types";
// Removed imports: Button, Label, Select, useToast, actions, History, Trash2

export default function SettingsPage() {
  const { currentUser, isAuthLoading: isCurrentUserLoading } = useCurrentUser();
  // Removed toast import and related state variables (selectedRetention, isFetchingSetting, isSaving, isCleaning)

  const texts = {
    pageTitle: "应用设置",
    pageDescription: "管理应用范围的偏好设置。",
    accessDeniedTitle: "访问被拒绝",
    accessDeniedMessage: "您没有权限查看此页面。",
    loadingMessage: "加载设置中...",
    loginRequiredMessage: "您需要登录才能访问设置。",
    // Removed audit log specific texts
    otherSettingsCardTitle: "其他系统设置",
    otherSettingsCardDescription: "此区域可用于未来的其他全局应用配置。",
    noSettingsAvailable: "暂无其他配置项。",
  };

  // Removed useEffect for fetching retention settings
  // Removed handler functions (handleSaveRetentionSettings, handleManualCleanup)

  if (isCurrentUserLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-3 text-lg">{texts.loadingMessage}</p>
      </div>
    );
  }

  if (!currentUser || (currentUser.id === 'guest-fallback-id' && currentUser.username === 'Guest')) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Settings className="h-16 w-16 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2">请先登录</h2>
        <p className="text-muted-foreground">{texts.loginRequiredMessage}</p>
      </div>
    );
  }

  if (!hasPermission(currentUser, PERMISSIONS.VIEW_SETTINGS)) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <ShieldAlert className="h-16 w-16 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2">{texts.accessDeniedTitle}</h2>
        <p className="text-muted-foreground">{texts.accessDeniedMessage}</p>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title={texts.pageTitle}
        description={texts.pageDescription}
        icon={<Settings className="h-6 w-6 text-primary" />}
      />
      <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
        {/* Removed Audit Log Settings Card */}
        
        <Card className="border-dashed md:col-span-2 lg:col-span-2"> {/* Span full width if it's the only card */}
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-muted-foreground" /> {texts.otherSettingsCardTitle}
            </CardTitle>
            <CardDescription>{texts.otherSettingsCardDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{texts.noSettingsAvailable}</p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
