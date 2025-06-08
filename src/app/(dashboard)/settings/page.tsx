
"use client";

import * as React from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings, Palette, Loader2, ShieldAlert } from "lucide-react";
import { useCurrentUser, hasPermission } from "@/hooks/use-current-user";
import { ThemeToggle } from "@/components/settings/theme-toggle";
import { Label } from "@/components/ui/label";
import { PERMISSIONS } from "@/types";

export default function SettingsPage() {
  const { currentUser, isAuthLoading } = useCurrentUser();
  
  const texts = {
    pageTitle: "应用设置",
    pageDescription: "管理应用范围的偏好设置。",
    themeTitle: "主题定制",
    themeDescription: "选择您偏好的应用主题。",
    selectThemeLabel: "选择主题",
    accessDeniedTitle: "访问被拒绝",
    accessDeniedMessage: "您没有权限查看此页面。",
    loadingMessage: "加载设置中...",
    loginRequiredMessage: "您需要登录才能访问设置。",
  };

  if (isAuthLoading) {
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
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Palette className="h-5 w-5" /> {texts.themeTitle}</CardTitle>
            <CardDescription>{texts.themeDescription}</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <Label htmlFor="theme-toggle-button">{texts.selectThemeLabel}</Label>
            <ThemeToggle />
          </CardContent>
        </Card>
        
        {/* Placeholder for future system-wide settings if user has VIEW_SETTINGS */}
        {/* 
        <Card className="md:col-span-2 lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Settings className="h-5 w-5" /> 系统级配置 (示例)</CardTitle>
            <CardDescription>此处未来可能包含影响整个应用的全局设置。</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">暂无系统级配置项。</p>
          </CardContent>
        </Card>
        */}
      </div>
    </>
  );
}
