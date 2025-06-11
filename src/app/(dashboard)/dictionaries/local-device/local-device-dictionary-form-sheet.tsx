
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
import { PlusCircle, Edit } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { LocalDeviceDictionary } from "@/types";
import { createLocalDeviceDictionaryAction, updateLocalDeviceDictionaryAction, type ActionResponse } from "@/lib/actions";

const formSchema = z.object({
  deviceName: z.string().min(1, "设备名称不能为空。").max(100, "设备名称过长。"),
  port: z.string().max(50, "端口号过长。").optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface LocalDeviceDictionaryFormSheetProps {
  dictionaryEntry?: LocalDeviceDictionary;
  children?: React.ReactNode;
  buttonProps?: ButtonProps;
  onDataChange?: () => void;
}

export function LocalDeviceDictionaryFormSheet({ dictionaryEntry, children, buttonProps, onDataChange }: LocalDeviceDictionaryFormSheetProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const { toast } = useToast();
  const isEditing = !!dictionaryEntry;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { deviceName: "", port: "" },
  });

  React.useEffect(() => {
    if (isOpen) {
      form.reset({
        deviceName: dictionaryEntry?.deviceName || "",
        port: dictionaryEntry?.port || "",
      });
      form.clearErrors();
    }
  }, [isOpen, dictionaryEntry, form]);

  async function onSubmit(data: FormValues) {
    form.clearErrors();
    let response: ActionResponse<LocalDeviceDictionary>;
    try {
      const payload = { deviceName: data.deviceName, port: data.port || undefined };
      if (isEditing && dictionaryEntry) {
        response = await updateLocalDeviceDictionaryAction(dictionaryEntry.id, payload);
      } else {
        response = await createLocalDeviceDictionaryAction(payload);
      }

      if (response.success && response.data) {
        toast({
          title: isEditing ? "条目已更新" : "条目已创建",
          description: `本地设备 "${response.data.deviceName}" 已成功${isEditing ? '更新' : '创建'}。`,
        });
        setIsOpen(false);
        if (onDataChange) onDataChange();
      } else if (response.error) {
        toast({ title: "操作失败", description: response.error.userMessage, variant: "destructive" });
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
      <SheetContent className="sm:max-w-md">
        <SheetHeader><SheetTitle>{isEditing ? "编辑本地设备字典条目" : "添加新本地设备字典条目"}</SheetTitle><SheetDescription>{isEditing ? "更新现有条目的详细信息。" : "填写新条目的详细信息。"}</SheetDescription></SheetHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-6">
            <FormField control={form.control} name="deviceName" render={({ field }) => (<FormItem><FormLabel>设备名称</FormLabel><FormControl><Input placeholder="例如 核心交换机-A栋" {...field} /></FormControl><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="port" render={({ field }) => (<FormItem><FormLabel>端口号 (可选)</FormLabel><FormControl><Input placeholder="例如 Ten-GigabitEthernet1/0/1" {...field} /></FormControl><FormMessage /></FormItem>)} />
            <SheetFooter className="mt-8"><SheetClose asChild><Button type="button" variant="outline">取消</Button></SheetClose><Button type="submit" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? "保存中..." : (isEditing ? "保存更改" : "创建条目")}</Button></SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}

    