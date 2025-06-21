
"use client";

import * as React from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UserCircle2, Lock, Loader2 } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PasswordChangeForm } from "@/components/settings/password-change-form";
// Label import is not strictly needed here as we are using span for labels in profile card.

export default function ChangePasswordPage() {
  const { currentUser, isAuthLoading } = useCurrentUser();
  
  const texts = {
    pageTitle: "账户管理",
    pageDescription: "查看您的账户信息并修改密码。",
    profileTitle: "用户资料",
    profileDescription: "您当前的账户详情。",
    usernameLabel: "用户名:",
    emailLabel: "邮箱:",
    roleLabel: "角色:",
    passwordTitle: "更改密码",
    passwordDescription: "更新您的账户密码。",
    loadingMessage: "加载账户信息中...",
  };

  if (isAuthLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-3 text-lg">{texts.loadingMessage}</p>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <UserCircle2 className="h-16 w-16 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2">请先登录</h2>
        <p className="text-muted-foreground">您需要登录才能管理您的账户。</p>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title={texts.pageTitle}
        description={texts.pageDescription}
        icon={<UserCircle2 className="h-6 w-6 text-primary" />}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><UserCircle2 className="h-5 w-5" /> {texts.profileTitle}</CardTitle>
            <CardDescription>{texts.profileDescription}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 items-center gap-x-2">
              <span className="col-span-1 text-sm text-muted-foreground">{texts.usernameLabel}</span>
              <span className="col-span-2 text-sm font-medium truncate">{currentUser?.username}</span>
            </div>
            <div className="grid grid-cols-3 items-center gap-x-2">
              <span className="col-span-1 text-sm text-muted-foreground">{texts.emailLabel}</span>
              <span className="col-span-2 text-sm font-medium truncate">{currentUser?.email}</span>
            </div>
            <div className="grid grid-cols-3 items-center gap-x-2">
              <span className="col-span-1 text-sm text-muted-foreground">{texts.roleLabel}</span>
              <span className="col-span-2 text-sm font-medium truncate">{currentUser?.roleName}</span>
            </div>
          </CardContent>
        </Card>
        
        <Card className="lg:col-span-2">
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
