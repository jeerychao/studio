
"use client";

import * as React from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings, Palette, Lock, Languages, UserCircle2 } from "lucide-react";
import { useCurrentUser, hasPermission } from "@/hooks/use-current-user";
import { PERMISSIONS } from "@/types";
import { ThemeToggle } from "@/components/settings/theme-toggle";
import { PasswordChangeForm } from "@/components/settings/password-change-form";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

// 简单的翻译对象，仅用于本页面演示
const translations = {
  en: {
    pageTitle: "System Settings",
    pageDescription: "Manage system-wide configurations and personal preferences.",
    themeTitle: "Theme Customization",
    themeDescription: "Choose your preferred application theme.",
    selectThemeLabel: "Select Theme",
    profileTitle: "User Profile",
    profileDescription: "Your current account details.",
    usernameLabel: "Username:",
    emailLabel: "Email:",
    roleLabel: "Role:",
    passwordTitle: "Change Password",
    passwordDescription: "Update your account password.",
    languageTitle: "Language",
    languageDescription: "Select your preferred language.",
    languageLabel: "Application Language",
    englishLabel: "English (US)",
    chineseLabel: "简体中文",
    languageNote: "Full internationalization is planned for a future update. This is a demo.",
    accessDeniedTitle: "Access Denied",
    accessDeniedMessage: "You do not have permission to view this page.",
  },
  zh: {
    pageTitle: "系统设置",
    pageDescription: "管理系统级配置和个人偏好。",
    themeTitle: "主题定制",
    themeDescription: "选择您偏好的应用程序主题。",
    selectThemeLabel: "选择主题",
    profileTitle: "用户配置",
    profileDescription: "您当前的账户详情。",
    usernameLabel: "用户名:",
    emailLabel: "邮箱:",
    roleLabel: "角色:",
    passwordTitle: "更改密码",
    passwordDescription: "更新您的账户密码。",
    languageTitle: "语言",
    languageDescription: "选择您偏好的语言。",
    languageLabel: "应用语言",
    englishLabel: "English (US)",
    chineseLabel: "简体中文",
    languageNote: "完整的国际化功能计划在未来更新中提供。此为演示。",
    accessDeniedTitle: "访问被拒绝",
    accessDeniedMessage: "您没有权限查看此页面。",
  },
};

export default function SettingsPage() {
  const currentUser = useCurrentUser();
  const canView = hasPermission(currentUser, PERMISSIONS.VIEW_SETTINGS);
  const [selectedLanguage, setSelectedLanguage] = React.useState<'en' | 'zh'>('en');

  const t = translations[selectedLanguage];

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Settings className="h-16 w-16 text-destructive mb-4" />
        <h2 className="text-2xl font-semibold mb-2">{t.accessDeniedTitle}</h2>
        <p className="text-muted-foreground">{t.accessDeniedMessage}</p>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title={t.pageTitle}
        description={t.pageDescription}
        icon={Settings}
      />
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Palette className="h-5 w-5" /> {t.themeTitle}</CardTitle>
            <CardDescription>{t.themeDescription}</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <Label htmlFor="theme-toggle-button">{t.selectThemeLabel}</Label>
            <ThemeToggle />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><UserCircle2 className="h-5 w-5" /> {t.profileTitle}</CardTitle>
            <CardDescription>{t.profileDescription}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t.usernameLabel}</span>
              <span className="font-medium">{currentUser?.username}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t.emailLabel}</span>
              <span className="font-medium">{currentUser?.email}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t.roleLabel}</span>
              <span className="font-medium">{currentUser?.roleName}</span>
            </div>
          </CardContent>
        </Card>
        
        <Card className="md:col-span-2 lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Lock className="h-5 w-5" /> {t.passwordTitle}</CardTitle>
            <CardDescription>{t.passwordDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <PasswordChangeForm />
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Languages className="h-5 w-5" /> {t.languageTitle}</CardTitle>
            <CardDescription>{t.languageDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <Label htmlFor="language-select">{t.languageLabel}</Label>
            <Select 
              value={selectedLanguage} 
              onValueChange={(value: 'en' | 'zh') => setSelectedLanguage(value)}
            >
              <SelectTrigger id="language-select">
                <SelectValue placeholder={selectedLanguage === 'en' ? t.englishLabel : t.chineseLabel} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">{t.englishLabel}</SelectItem>
                <SelectItem value="zh">{t.chineseLabel}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-2">{t.languageNote}</p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
