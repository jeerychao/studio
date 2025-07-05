
"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type FieldPath } from "react-hook-form";
import * as z from "zod";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger, SheetFooter, SheetClose,
} from "@/components/ui/sheet";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PlusCircle, Edit, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { DeviceDictionary } from "@/types"; 
import { createDeviceDictionaryAction, updateDeviceDictionaryAction, type ActionResponse } from "@/lib/actions";

const formSchema = z.object({
  deviceName: z.string().min(1, "设备名称不能为空。").max(100, "设备名称过长。"),
});

type FormValues = z.infer<typeof formSchema>;

interface DeviceDictionaryFormSheetProps {
  dictionaryEntry?: DeviceDictionary;
  children?: React.ReactNode;
  buttonProps?: ButtonProps;
  onDataChange?: () => void;
}

export function DeviceDictionaryFormSheet({ dictionaryEntry, children, buttonProps, onDataChange }: DeviceDictionaryFormSheetProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const { toast } = useToast();
  const isEditing = !!dictionaryEntry;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      deviceName: "",
    },
  });
  
  React.useEffect(() => {
    if (isOpen) {
      form.reset({
        deviceName: dictionaryEntry?.deviceName || "",
      });
      form.clearErrors();
    }
  }, [isOpen, dictionaryEntry, form]);

  async function onSubmit(data: FormValues) {
    form.clearErrors();
    let response: ActionResponse<DeviceDictionary>;
    try {
      const payload = {
        deviceName: data.deviceName,
      };

      if (isEditing && dictionaryEntry) {
        response = await updateDeviceDictionaryAction(dictionaryEntry.id, payload);
      } else {
        response = await createDeviceDictionaryAction(payload);
      }

      if (response.success && response.data) {
        toast({
          title: isEditing ? "条目已更新" : "条目已创建",
          description: `设备 "${response.data.deviceName}" 已成功${isEditing ? '更新' : '创建'}。`,
        });
        setIsOpen(false);
        if (onDataChange) onDataChange();
      } else if (response.error) {
        const toastTitle = 
          response.error.code === 'VALIDATION_ERROR' || 
          (response.error.code && response.error.code.includes('_EXISTS')) ||
          response.error.code === 'AUTH_ERROR'
          ? "输入或操作无效" 
          : "操作失败";
        toast({ title: toastTitle, description: response.error.userMessage, variant: "destructive" });
        if (response.error.field) {
          form.setError(response.error.field as FieldPath<FormValues>, { type: "server", message: response.error.userMessage });
        }
      }
    } catch (error) {
      toast({ title: "客户端错误", description: error instanceof Error ? error.message : "提交表单时发生意外错误。", variant: "destructive" });
    }
  }

  const trigger = children ? React.cloneElement(children as React.ReactElement, { onClick: () => setIsOpen(true) })
    : <Button variant={isEditing ? "ghost" : "default"} size={isEditing ? "icon" : "default"} onClick={() => setIsOpen(true)} {...buttonProps}>
        {isEditing ? <Edit className="h-4 w-4" /> : <><PlusCircle className="mr-2 h-4 w-4" /> 添加条目</>}
        {isEditing && <span className="sr-only">编辑条目</span>}
      </Button>;

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader><SheetTitle>{isEditing ? "编辑设备字典条目" : "添加新设备字典条目"}</SheetTitle><SheetDescription>{isEditing ? "更新现有条目的详细信息。" : "填写新条目的详细信息。"}</SheetDescription></SheetHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-6">
            <FormField control={form.control} name="deviceName" render={({ field }) => (
              <FormItem>
                <FormLabel>设备名称</FormLabel>
                <div className="relative">
                  <FormControl><Input placeholder="例如 核心交换机-A栋" {...field} className="pr-8"/></FormControl>
                  {field.value && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 text-muted-foreground hover:bg-transparent hover:text-current"
                      onClick={() => {
                        form.setValue(field.name, "");
                        form.trigger(field.name);
                      }}
                      aria-label="清除设备名称"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <FormMessage />
              </FormItem>
            )} />
            <SheetFooter className="mt-8"><SheetClose asChild><Button type="button" variant="outline">取消</Button></SheetClose><Button type="submit" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? "保存中..." : (isEditing ? "保存更改" : "创建条目")}</Button></SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}

