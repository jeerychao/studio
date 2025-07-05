
"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type FieldPath } from "react-hook-form";
import * as z from "zod";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PlusCircle, Edit } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { User, Role } from "@/types";
import { createUserAction, updateUserAction, type ActionResponse, type FetchedUserDetails } from "@/lib/actions";

const userFormSchema = z.object({
  username: z.string().min(3, "用户名必须至少3个字符").max(50, "用户名过长"),
  email: z.string().email("无效的邮箱地址"),
  phone: z.string().max(30, "电话号码过长").optional().or(z.literal('')), 
  roleId: z.string().min(1, "角色是必需的"),
  avatar: z.string().optional(),
  password: z.preprocess(
    (val) => (val === "" ? undefined : val),
    z.string()
      .min(8, "密码必须为8-16个字符。")
      .max(16, "密码必须为8-16个字符。")
      .refine(val => /[A-Z]/.test(val), "必须包含大写字母。")
      .refine(val => /[a-z]/.test(val), "必须包含小写字母。")
      .refine(val => /[0-9]/.test(val), "必须包含数字。")
      .refine(val => /[^A-Za-z0-9]/.test(val), "必须包含符号。")
      .optional()
  ),
  confirmPassword: z.string().optional().transform(e => e === "" ? undefined : e),
})
.superRefine((data, ctx) => {
  if (data.password && data.password !== "") {
    if (!data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "请确认您的新密码。",
        path: ["confirmPassword"],
      });
    } else if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "密码不匹配。",
        path: ["confirmPassword"],
      });
    }
  }
});


type UserFormValues = z.infer<typeof userFormSchema>;

interface UserFormSheetProps {
  user?: User;
  roles: Role[];
  children?: React.ReactNode;
  buttonProps?: ButtonProps;
  onUserChange?: () => void;
}

export function UserFormSheet({ user, roles, children, buttonProps, onUserChange }: UserFormSheetProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const { toast } = useToast();
  const isEditing = !!user;

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: {
      username: "",
      email: "",
      phone: "",
      roleId: roles.find(r => r.name === 'Viewer')?.id || roles[0]?.id || "",
      avatar: "/images/avatars/default_avatar.png",
      password: "",
      confirmPassword: "",
    },
  });

  React.useEffect(() => {
    if (isOpen) {
        form.reset({
        username: user?.username || "",
        email: user?.email || "",
        phone: user?.phone || "",
        roleId: user?.roleId || (roles.find(r => r.name === 'Viewer')?.id || roles[0]?.id || ""),
        avatar: user?.avatar || "/images/avatars/default_avatar.png",
        password: "",
        confirmPassword: "",
        });
        form.clearErrors();
    }
  }, [isOpen, user, roles, form]);

  async function onSubmit(data: UserFormValues) {
    form.clearErrors();
    if (!isEditing && !data.password) {
        form.setError("password", { type: "manual", message: "新用户需要密码。" });
        toast({ title: "需要密码", description: "新用户需要密码。", variant: "destructive" });
        return;
    }

    const payload: Partial<User> & { password?: string, phone?: string | null } = { 
      username: data.username,
      email: data.email,
      phone: data.phone === "" ? null : data.phone, // Convert empty string to null
      roleId: data.roleId,
      avatar: data.avatar || "/images/avatars/default_avatar.png",
    };

    if (data.password) {
      payload.password = data.password;
    }
    
    let response: ActionResponse<FetchedUserDetails>;
    try {
      if (isEditing && user) {
        response = await updateUserAction(user.id, payload);
      } else {
        if (!payload.password) {
            toast({ title: "密码错误", description: "新用户密码意外丢失。", variant: "destructive" });
            return;
        }
        response = await createUserAction(payload as Omit<User, "id" | "lastLogin" | "roleName"> & { password: string });
      }

      if (response.success && response.data) {
        let toastDescription = `用户 ${response.data.username} 已成功${isEditing ? '更新' : '创建'}。`;
        if (isEditing && payload.password) {
          toastDescription += " 密码已更改。";
        }
        toast({ title: isEditing ? "用户已更新" : "用户已创建", description: toastDescription });
        setIsOpen(false);
        if (onUserChange) onUserChange();
      } else if (response.error) {
        const toastTitle = 
          response.error.code === 'VALIDATION_ERROR' || 
          (response.error.code && response.error.code.includes('_EXISTS')) ||
          response.error.code === 'AUTH_ERROR' ||
          response.error.code === 'NOT_FOUND' 
          ? "输入或操作无效" 
          : "操作失败";
        toast({
          title: toastTitle,
          description: response.error.userMessage,
          variant: "destructive",
        });
        if (response.error.field) {
          form.setError(response.error.field as FieldPath<UserFormValues>, {
            type: "server",
            message: response.error.userMessage,
          });
        }
      }
    } catch (error) { 
      toast({
        title: "客户端错误",
        description: error instanceof Error ? error.message : "提交表单时发生意外错误。",
        variant: "destructive",
      });
    }
  }

  const trigger = children ? (
    React.cloneElement(children as React.ReactElement, { onClick: () => setIsOpen(true) })
  ) : (
    <Button variant={isEditing ? "ghost" : "default"} size={isEditing ? "icon" : "default"} onClick={() => setIsOpen(true)} {...buttonProps}>
      {isEditing ? <Edit className="h-4 w-4" /> : <><PlusCircle className="mr-2 h-4 w-4" /> 添加用户</>}
      {isEditing && <span className="sr-only">编辑用户</span>}
    </Button>
  );

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{isEditing ? "编辑用户" : "添加新用户"}</SheetTitle>
          <SheetDescription>
            {isEditing ? "更新用户的详细信息。将密码字段留空以保留当前密码。" : "填写新用户的详细信息。"}
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-6">
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>用户名</FormLabel>
                  <FormControl>
                    <Input placeholder="例如 zhangsan" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>邮箱</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="例如 user@example.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>电话号码 (可选)</FormLabel>
                  <FormControl>
                    <Input type="tel" placeholder="例如 13800138000" {...field} value={field.value || ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="roleId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>角色</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={roles.length === 0}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={roles.length > 0 ? "选择一个角色" : "无可用角色"} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {roles.map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
             <FormField
              control={form.control}
              name="avatar"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>头像 URL (可选)</FormLabel>
                  <FormControl>
                    <Input placeholder="/images/avatars/default_avatar.png" {...field} />
                  </FormControl>
                  <FormDescription>
                    输入本地图片路径 (例如 /images/avatars/user.png) 或留空使用默认头像。
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{isEditing ? "新密码 (可选)" : "密码"}</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder={isEditing ? "留空以保留当前密码" : "输入密码"} {...field} />
                  </FormControl>
                  <FormDescription>
                    8-16个字符。必须包含大写字母、小写字母、数字和符号。
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            {(form.watch("password") || !isEditing) && ( 
                <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                    <FormItem>
                    <FormLabel>确认密码</FormLabel>
                    <FormControl>
                        <Input type="password" placeholder={isEditing && !form.getValues().password ? "留空以保留当前密码" : "确认新密码"} {...field} />
                    </FormControl>
                    <FormMessage />
                    </FormItem>
                )}
                />
            )}
            <SheetFooter className="mt-8">
              <SheetClose asChild>
                <Button type="button" variant="outline">
                  取消
                </Button>
              </SheetClose>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "保存中..." : (isEditing ? "保存更改" : "创建用户")}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}

    
