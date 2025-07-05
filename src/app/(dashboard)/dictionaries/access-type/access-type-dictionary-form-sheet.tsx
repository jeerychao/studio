
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
import type { AccessTypeDictionary } from "@/types";
import { createAccessTypeDictionaryAction, updateAccessTypeDictionaryAction, type ActionResponse } from "@/lib/actions";

const formSchema = z.object({
  name: z.string().min(1, "接入方式名称不能为空。").max(50, "接入方式名称过长。"),
});

type FormValues = z.infer<typeof formSchema>;

interface AccessTypeDictionaryFormSheetProps {
  dictionaryEntry?: AccessTypeDictionary;
  children?: React.ReactNode;
  buttonProps?: ButtonProps;
  onDataChange?: () => void;
}

export function AccessTypeDictionaryFormSheet({ dictionaryEntry, children, buttonProps, onDataChange }: AccessTypeDictionaryFormSheetProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const { toast } = useToast();
  const isEditing = !!dictionaryEntry;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "" },
  });

  React.useEffect(() => {
    if (isOpen) {
      form.reset({ name: dictionaryEntry?.name || "" });
      form.clearErrors();
    }
  }, [isOpen, dictionaryEntry, form]);

  async function onSubmit(data: FormValues) {
    form.clearErrors();
    let response: ActionResponse<AccessTypeDictionary>;
    try {
      const payload = { name: data.name };
      if (isEditing && dictionaryEntry) {
        response = await updateAccessTypeDictionaryAction(dictionaryEntry.id, payload);
      } else {
        response = await createAccessTypeDictionaryAction(payload);
      }

      if (response.success && response.data) {
        toast({
          title: isEditing ? "条目已更新" : "条目已创建",
          description: `接入方式 "${response.data.name}" 已成功${isEditing ? '更新' : '创建'}。`,
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
        {isEditing && <span className="sr-only">编辑接入方式</span>}
      </Button>;

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{isEditing ? "编辑接入方式" : "添加新接入方式"}</SheetTitle>
          <SheetDescription>{isEditing ? "更新现有接入方式的名称。" : "填写新接入方式的名称。"}</SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-6">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>接入方式名称</FormLabel>
                <div className="relative">
                  <FormControl>
                    <Input placeholder="例如 专线, 汇聚" {...field} className="pr-8"/>
                  </FormControl>
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
                      aria-label="清除名称"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <FormMessage />
              </FormItem>
            )} />
            <SheetFooter className="mt-8">
              <SheetClose asChild><Button type="button" variant="outline">取消</Button></SheetClose>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "保存中..." : (isEditing ? "保存更改" : "创建条目")}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}

