
"use client";

import * as React from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings, Loader2, ShieldAlert } from "lucide-react";
import { useCurrentUser, hasPermission } from "@/hooks/use-current-user";
import { PERMISSIONS } from "@/types";

export default function SettingsPage() {
  const { currentUser, isAuthLoading: isCurrentUserLoading } = useCurrentUser();

  const texts = {
    pageTitle: "系统信息", 
    pageDescription: "系统管理功能已移至侧边栏的“系统管理”和“字典管理”菜单。", 
    accessDeniedTitle: "访问被拒绝",
    accessDeniedMessage: "您没有权限查看此页面。",
    loadingMessage: "加载设置中...",
    loginRequiredMessage: "您需要登录才能访问。",
    infoCardTitle: "导航提示",
    infoCardDescription: "各项管理功能已通过侧边栏菜单进行组织。",
    infoMessage: "请使用侧边栏的“系统管理”或“字典管理”菜单访问用户管理、角色管理、审计日志、数据导出以及各种字典配置。",
  };

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
  
  if (!hasPermission(currentUser, PERMISSIONS.VIEW_SETTINGS) && 
      !hasPermission(currentUser, PERMISSIONS.VIEW_USER) && 
      !hasPermission(currentUser, PERMISSIONS.VIEW_ROLE) &&
      !hasPermission(currentUser, PERMISSIONS.VIEW_AUDIT_LOG) &&
      !hasPermission(currentUser, PERMISSIONS.VIEW_TOOLS_IMPORT_EXPORT) &&
      !hasPermission(currentUser, PERMISSIONS.VIEW_DEVICE_DICTIONARY) && // Renamed permission
      !hasPermission(currentUser, PERMISSIONS.VIEW_DICTIONARY_PAYMENT_SOURCE) &&
      !hasPermission(currentUser, PERMISSIONS.VIEW_DICTIONARY_ACCESS_TYPE) &&
      !hasPermission(currentUser, PERMISSIONS.VIEW_INTERFACE_TYPE_DICTIONARY) // Renamed permission
    ) {
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
      <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-1"> 
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-muted-foreground" /> {texts.infoCardTitle}
            </CardTitle>
            <CardDescription>{texts.infoCardDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{texts.infoMessage}</p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
