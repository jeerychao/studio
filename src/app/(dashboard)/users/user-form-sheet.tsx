
"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
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
import { createUserAction, updateUserAction } from "@/lib/actions";
import { ADMIN_ROLE_ID } from "@/lib/data";

const userFormSchema = z.object({
  username: z.string().min(3, "用户名必须至少3个字符").max(50, "用户名过长"),
  email: z.string().email("无效的邮箱地址"),
  roleId: z.string().min(1, "角色是必需的"),
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
      roleId: roles.find(r => r.name === 'Viewer')?.id || roles[0]?.id || "", 
      password: "",
      confirmPassword: "",
    },
  });

  React.useEffect(() => {
    if (isOpen) {
        form.reset({
        username: user?.username || "",
        email: user?.email || "",
        roleId: user?.roleId || (roles.find(r => r.name === 'Viewer')?.id || roles[0]?.id || ""),
        password: "", 
        confirmPassword: "",
        });
    }
  }, [isOpen, user, roles, form]);

  async function onSubmit(data: UserFormValues) {
    if (!isEditing && !data.password) {
        form.setError("password", { type: "manual", message: "新用户需要密码。" });
        toast({ title: "需要密码", description: "新用户需要密码。", variant: "destructive" });
        return;
    }

    const payload: Partial<User> & { password?: string } = {
      username: data.username,
      email: data.email,
      roleId: data.roleId,
    };

    if (data.password) { 
      payload.password = data.password;
    }

    try {
      if (isEditing && user) {
        await updateUserAction(user.id, payload);
        let toastDescription = `用户 ${data.username} 已成功更新。`;
        if (payload.password) {
          toastDescription += " 密码已更改。";
        }
        toast({ title: "用户已更新", description: toastDescription });
      } else {
        if (!payload.password) {
            toast({ title: "密码错误", description: "新用户密码意外丢失。", variant: "destructive" });
            return;
        }
        await createUserAction(payload as Omit<User, "id" | "avatar" | "lastLogin"> & { password: string });
        toast({ title: "用户已创建", description: `用户 ${data.username} 已成功创建。` });
      }
      setIsOpen(false);
      if (onUserChange) onUserChange();
    } catch (error) {
      toast({
        title: "错误",
        description: error instanceof Error ? error.message : "发生意外错误。",
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
