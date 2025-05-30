
"use client";

import * as React from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings, Palette, Lock, UserCircle2 } from "lucide-react";
import { useCurrentUser, hasPermission } from "@/hooks/use-current-user";
import { PERMISSIONS } from "@/types";
import { ThemeToggle } from "@/components/settings/theme-toggle";
import { PasswordChangeForm } from "@/components/settings/password-change-form";
import { Label } from "@/components/ui/label";
// Removed language-related imports: Languages icon, Select components for language

// Removed translations object

export default function SettingsPage() {
  const currentUser = useCurrentUser();
  const canView = hasPermission(currentUser, PERMISSIONS.VIEW_SETTINGS);
  // Removed selectedLanguage state and related 't' variable

  // Hardcoding text to English as the language feature is removed
  const texts = {
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
    accessDeniedTitle: "Access Denied",
    accessDeniedMessage: "You do not have permission to view this page.",
  };


  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Settings className="h-16 w-16 text-destructive mb-4" />
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
        icon={Settings}
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
        
        {/* Language Card Removed */}
      </div>
    </>
  );
}
