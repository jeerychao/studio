
"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type FieldPath } from "react-hook-form";
import *   as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { updateOwnPasswordAction, type ActionResponse } from "@/lib/actions";
import { useCurrentUser } from "@/hooks/use-current-user";

const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, "当前密码是必需的。"),
  newPassword: z.string()
    .min(8, "新密码必须为8-16个字符。")
    .max(16, "新密码必须为8-16个字符。")
    .refine(val => /[A-Z]/.test(val), "必须包含大写字母。")
    .refine(val => /[a-z]/.test(val), "必须包含小写字母。")
    .refine(val => /[0-9]/.test(val), "必须包含数字。")
    .refine(val => /[^A-Za-z0-9]/.test(val), "必须包含符号。"),
  confirmNewPassword: z.string().min(1, "请确认您的新密码。"),
}).refine(data => data.newPassword === data.confirmNewPassword, {
  message: "新密码不匹配。",
  path: ["confirmNewPassword"],
});

type PasswordChangeFormValues = z.infer<typeof passwordChangeSchema>;

export function PasswordChangeForm() {
  const { toast } = useToast();
  const { currentUser, isAuthLoading } = useCurrentUser();

  const form = useForm<PasswordChangeFormValues>({
    resolver: zodResolver(passwordChangeSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmNewPassword: "",
    },
  });

  async function onSubmit(data: PasswordChangeFormValues) {
    form.clearErrors();
    if (isAuthLoading || !currentUser || !currentUser.id || currentUser.id === 'guest-fallback-id') {
        toast({ title: "错误", description: "用户未正确认证。", variant: "destructive" });
        return;
    }
    try {
      const result = await updateOwnPasswordAction(currentUser.id, {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });

      if (result.success) {
        toast({ title: "密码已更新", description: "您的密码已成功更新。" });
        form.reset();
      } else if (result.error) {
        const toastTitle = 
          result.error.code === 'VALIDATION_ERROR' || 
          result.error.code === 'AUTH_ERROR'
          ? "输入或操作无效" 
          : "更新失败";
        toast({ 
            title: toastTitle, 
            description: result.error.userMessage || "无法更新密码。", 
            variant: "destructive" 
        });
        if (result.error.field) {
            form.setError(result.error.field as FieldPath<PasswordChangeFormValues>, {
                type: "server",
                message: result.error.userMessage,
            });
        }
      }
    } catch (error) { // Catch unexpected errors
      toast({
        title: "客户端错误",
        description: error instanceof Error ? error.message : "提交表单时发生意外错误。",
        variant: "destructive",
      });
    }
  }
  
  if (isAuthLoading) {
    return <p>加载表单中...</p>;
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="currentPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>当前密码</FormLabel>
              <FormControl>
                <Input type="password" placeholder="输入您当前的密码" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="newPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>新密码</FormLabel>
              <FormControl>
                <Input type="password" placeholder="输入新密码" {...field} />
              </FormControl>
              <FormDescription>
                8-16个字符。必须包含大写字母、小写字母、数字和符号。
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirmNewPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>确认新密码</FormLabel>
              <FormControl>
                <Input type="password" placeholder="确认新密码" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={form.formState.isSubmitting || isAuthLoading}>
          {form.formState.isSubmitting ? "更新中..." : "更改密码"}
        </Button>
      </form>
    </Form>
  );
}

