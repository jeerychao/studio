
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
import { PlusCircle, Edit, X } from "lucide-react"; // Added X icon
import { useToast } from "@/hooks/use-toast";
import type { VLAN } from "@/types";
import { createVLANAction, updateVLANAction, type ActionResponse } from "@/lib/actions";

const vlanFormSchema = z.object({
  vlanNumber: z.coerce.number().int().min(1, "VLAN 号码必须至少为 1").max(4094, "VLAN 号码不能超过 4094"),
  name: z.string().max(100, "VLAN 名称过长").optional(),
  description: z.string().max(200, "描述过长").optional(),
});

type VlanFormValues = z.infer<typeof vlanFormSchema>;

interface VlanFormSheetProps {
  vlan?: VLAN;
  children?: React.ReactNode;
  buttonProps?: ButtonProps;
  onVlanChange?: () => void;
}

export function VlanFormSheet({ vlan, children, buttonProps, onVlanChange }: VlanFormSheetProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const { toast } = useToast();
  const isEditing = !!vlan;

  const form = useForm<VlanFormValues>({
    resolver: zodResolver(vlanFormSchema),
    defaultValues: {
      vlanNumber: vlan?.vlanNumber || undefined,
      name: vlan?.name || "",
      description: vlan?.description || "",
    },
  });

  const vlanNameValue = form.watch("name"); // Watch the name field for the clear button

  React.useEffect(() => {
    if (isOpen) {
        form.reset({
        vlanNumber: vlan?.vlanNumber || undefined,
        name: vlan?.name || "",
        description: vlan?.description || "",
        });
        form.clearErrors();
    }
  }, [isOpen, vlan, form]);

  async function onSubmit(data: VlanFormValues) {
    form.clearErrors();
    let response: ActionResponse<VLAN>;
    try {
      const payload = {
        vlanNumber: data.vlanNumber,
        name: data.name || undefined, // Send undefined if empty string for optional field
        description: data.description || undefined, // Send undefined if empty string
      };

      if (isEditing && vlan) {
        response = await updateVLANAction(vlan.id, payload);
      } else {
        response = await createVLANAction(payload);
      }

      if (response.success && response.data) {
        toast({
            title: isEditing ? "VLAN 已更新" : "VLAN 已创建",
            description: `VLAN ${response.data.vlanNumber} (${response.data.name || '无名称'}) 已成功${isEditing ? '更新' : '创建'}。`
        });
        setIsOpen(false);
        if (onVlanChange) onVlanChange();
        form.reset({ vlanNumber: undefined, name: "", description: "" });
      } else if (response.error) {
        const toastTitle = 
          response.error.code === 'VALIDATION_ERROR' || 
          (response.error.code && response.error.code.includes('_EXISTS')) ||
          response.error.code === 'AUTH_ERROR'
          ? "输入或操作无效" 
          : "操作失败";
        toast({
          title: toastTitle,
          description: response.error.userMessage,
          variant: "destructive",
        });
        if (response.error.field) {
          form.setError(response.error.field as FieldPath<VlanFormValues>, {
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
      {isEditing ? <Edit className="h-4 w-4" /> : <><PlusCircle className="mr-2 h-4 w-4" /> 添加VLAN</>}
      {isEditing && <span className="sr-only">编辑VLAN</span>}
    </Button>
  );


  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{isEditing ? "编辑VLAN" : "添加新VLAN"}</SheetTitle>
          <SheetDescription>
            {isEditing ? "更新现有VLAN的详细信息。" : "填写新VLAN的详细信息。"}
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-6">
            <FormField
              control={form.control}
              name="vlanNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>VLAN 号码</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="例如 10" {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>VLAN 名称 (可选)</FormLabel>
                  <div className="relative">
                    <FormControl>
                      <Input placeholder="例如 办公网络" {...field} className="pr-8" />
                    </FormControl>
                    {vlanNameValue && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 text-muted-foreground hover:bg-transparent hover:text-current"
                        onClick={() => {
                          form.setValue("name", "");
                          form.trigger("name");
                        }}
                        aria-label="清除 VLAN 名称"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
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
                    <Textarea placeholder="VLAN的简要描述" {...field} />
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
                {form.formState.isSubmitting ? "保存中..." : (isEditing ? "保存更改" : "创建VLAN")}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}

