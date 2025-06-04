
"use client";

import * as React from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings, Palette, Lock, UserCircle2 } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";
// PERMISSIONS import is no longer needed for the primary page access check here
// import { PERMISSIONS } from "@/types"; 
// import { hasPermission } from "@/hooks/use-current-user"; // hasPermission no longer needed here
import { ThemeToggle } from "@/components/settings/theme-toggle";
import { PasswordChangeForm } from "@/components/settings/password-change-form";
import { Label } from "@/components/ui/label";

export default function SettingsPage() {
  const { currentUser, isAuthLoading } = useCurrentUser();
  
  const texts = {
    pageTitle: "系统设置",
    pageDescription: "管理系统范围的配置和个人偏好。",
    themeTitle: "主题定制",
    themeDescription: "选择您偏好的应用主题。",
    selectThemeLabel: "选择主题",
    profileTitle: "用户资料",
    profileDescription: "您当前的账户详情。",
    usernameLabel: "用户名:",
    emailLabel: "邮箱:",
    roleLabel: "角色:",
    passwordTitle: "更改密码",
    passwordDescription: "更新您的账户密码。",
    accessDeniedTitle: "访问被拒绝", // This might become unused or used differently
    accessDeniedMessage: "您没有权限查看此页面。", // This might become unused
    loadingMessage: "加载设置中...",
  };

  if (isAuthLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Settings className="h-16 w-16 animate-spin text-primary mb-4" />
        <h2 className="text-2xl font-semibold mb-2">{texts.loadingMessage}</h2>
      </div>
    );
  }

  // All authenticated users (not guest) should be able to access their own settings (theme, password)
  // The PERMISSIONS.VIEW_SETTINGS check is removed for general page access.
  if (!currentUser || (currentUser.id === 'guest-fallback-id' && currentUser.username === 'Guest')) {
    // This message is for users who somehow bypass DashboardLayout's auth check or are guests.
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Settings className="h-16 w-16 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2">请先登录</h2>
        <p className="text-muted-foreground">您需要登录才能访问设置。</p>
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

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><UserCircle2 className="h-5 w-5" /> {texts.profileTitle}</CardTitle>
            <CardDescription>{texts.profileDescription}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{texts.usernameLabel}</span>
              <span className="font-medium">{currentUser?.username}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{texts.emailLabel}</span>
              <span className="font-medium">{currentUser?.email}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{texts.roleLabel}</span>
              <span className="font-medium">{currentUser?.roleName}</span>
            </div>
          </CardContent>
        </Card>
        
        <Card className="md:col-span-2 lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Lock className="h-5 w-5" /> {texts.passwordTitle}</CardTitle>
            <CardDescription>{texts.passwordDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <PasswordChangeForm />
          </CardContent>
        </Card>
        
      </div>
    </>
  );
}
