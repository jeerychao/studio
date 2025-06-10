
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PlusCircle, Edit } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { ISP } from "@/types";
import { createISPAction, updateISPAction, type ActionResponse } from "@/lib/actions";

const ispFormSchema = z.object({
  name: z.string().min(1, "ISP 名称不能为空。").max(100, "ISP 名称过长，最多100个字符。"),
  description: z.string().max(255, "描述过长，最多255个字符。").optional(),
  contactInfo: z.string().max(100, "联系信息过长，最多100个字符。").optional(),
});

type IspFormValues = z.infer<typeof ispFormSchema>;

interface IspFormSheetProps {
  isp?: ISP;
  children?: React.ReactNode;
  buttonProps?: ButtonProps;
  onIspChange?: () => void;
}

export function IspFormSheet({ isp, children, buttonProps, onIspChange }: IspFormSheetProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const { toast } = useToast();
  const isEditing = !!isp;

  const form = useForm<IspFormValues>({
    resolver: zodResolver(ispFormSchema),
    defaultValues: {
      name: "",
      description: "",
      contactInfo: "",
    },
  });

  React.useEffect(() => {
    if (isOpen) {
      form.reset({
        name: isp?.name || "",
        description: isp?.description || "",
        contactInfo: isp?.contactInfo || "",
      });
      form.clearErrors();
    }
  }, [isOpen, isp, form]);

  async function onSubmit(data: IspFormValues) {
    form.clearErrors();
    let response: ActionResponse<ISP>;
    try {
      const payload = {
        name: data.name,
        description: data.description || undefined,
        contactInfo: data.contactInfo || undefined,
      };

      if (isEditing && isp) {
        response = await updateISPAction(isp.id, payload);
      } else {
        response = await createISPAction(payload);
      }

      if (response.success && response.data) {
        toast({
          title: isEditing ? "ISP 已更新" : "ISP 已创建",
          description: `ISP ${response.data.name} 已成功${isEditing ? '更新' : '创建'}。`,
        });
        setIsOpen(false);
        if (onIspChange) onIspChange();
      } else if (response.error) {
        toast({
          title: "操作失败",
          description: response.error.userMessage,
          variant: "destructive",
        });
        if (response.error.field) {
          form.setError(response.error.field as FieldPath<IspFormValues>, {
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
      {isEditing ? <Edit className="h-4 w-4" /> : <><PlusCircle className="mr-2 h-4 w-4" /> 添加 ISP</>}
      {isEditing && <span className="sr-only">编辑 ISP</span>}
    </Button>
  );

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{isEditing ? "编辑 ISP" : "添加新 ISP"}</SheetTitle>
          <SheetDescription>
            {isEditing ? "更新现有 ISP 的详细信息。" : "填写新 ISP 的详细信息。"}
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>ISP 名称</FormLabel>
                  <FormControl>
                    <Input placeholder="例如 中国电信" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>描述 (可选)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="ISP 的简要描述或备注" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="contactInfo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>联系方式 (可选)</FormLabel>
                  <FormControl>
                    <Input placeholder="例如 客服热线: 10000" {...field} />
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
                {form.formState.isSubmitting ? "保存中..." : (isEditing ? "保存更改" : "创建 ISP")}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
    