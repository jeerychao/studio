
"use client";

import * as React from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings, Loader2, ShieldAlert, History } from "lucide-react";
import { useCurrentUser, hasPermission } from "@/hooks/use-current-user";
import { PERMISSIONS } from "@/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

type AuditLogRetentionValue = "30d" | "90d" | "180d" | "365d" | "forever";

interface AuditLogRetentionOption {
  value: AuditLogRetentionValue;
  label: string;
}

const retentionOptions: AuditLogRetentionOption[] = [
  { value: "30d", label: "30 天" },
  { value: "90d", label: "90 天" },
  { value: "180d", label: "180 天" },
  { value: "365d", label: "1 年" },
  { value: "forever", label: "永久保留" },
];

export default function SettingsPage() {
  const { currentUser, isAuthLoading } = useCurrentUser();
  const { toast } = useToast();
  const [selectedRetention, setSelectedRetention] = React.useState<AuditLogRetentionValue>("90d"); // Default or fetch from backend
  const [isSaving, setIsSaving] = React.useState(false);

  const texts = {
    pageTitle: "应用设置",
    pageDescription: "管理应用范围的偏好设置。",
    accessDeniedTitle: "访问被拒绝",
    accessDeniedMessage: "您没有权限查看此页面。",
    loadingMessage: "加载设置中...",
    loginRequiredMessage: "您需要登录才能访问设置。",
    auditLogCardTitle: "审计日志设置",
    auditLogCardDescription: "配置审计日志的保留策略和其他相关设置。",
    retentionLabel: "审计日志保留期限:",
    retentionDescription: "选择审计日志在系统中保留的最长时间。过期的日志将被自动删除（此功能待实现）。",
    saveButtonText: "保存设置",
    savingButtonText: "保存中...",
    saveSuccessTitle: "设置已保存",
    saveSuccessDescription: (period: string) => `审计日志保留期限已更新为 ${period}。实际日志清除将在未来实现。`,
  };

  // In a real app, you would fetch the current setting
  // React.useEffect(() => {
  //   // async function fetchCurrentRetention() {
  //   //   const currentSetting = await getAuditLogRetentionSettingAction();
  //   //   if (currentSetting.success && currentSetting.data) {
  //   //     setSelectedRetention(currentSetting.data.period);
  //   //   }
  //   // }
  //   // fetchCurrentRetention();
  // }, []);

  const handleSaveRetentionSettings = async () => {
    setIsSaving(true);
    // Placeholder for actual save action
    // await updateAuditLogRetentionSettingAction({ period: selectedRetention });
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API call

    const selectedOption = retentionOptions.find(opt => opt.value === selectedRetention);
    toast({
      title: texts.saveSuccessTitle,
      description: texts.saveSuccessDescription(selectedOption?.label || selectedRetention),
    });
    setIsSaving(false);
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
      <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" /> {texts.auditLogCardTitle}
            </CardTitle>
            <CardDescription>{texts.auditLogCardDescription}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="audit-log-retention">{texts.retentionLabel}</Label>
              <Select
                value={selectedRetention}
                onValueChange={(value: AuditLogRetentionValue) => setSelectedRetention(value)}
                disabled={isSaving}
              >
                <SelectTrigger id="audit-log-retention" className="w-full md:w-[200px]">
                  <SelectValue placeholder="选择保留期限" />
                </SelectTrigger>
                <SelectContent>
                  {retentionOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{texts.retentionDescription}</p>
            </div>
            <Button onClick={handleSaveRetentionSettings} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {texts.savingButtonText}
                </>
              ) : (
                texts.saveButtonText
              )}
            </Button>
          </CardContent>
        </Card>
        
        {/* Placeholder for more system-wide settings */}
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Settings className="h-5 w-5 text-muted-foreground" /> 其他系统设置</CardTitle>
            <CardDescription>此区域可用于未来的其他全局应用配置。</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">暂无其他配置项。</p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
