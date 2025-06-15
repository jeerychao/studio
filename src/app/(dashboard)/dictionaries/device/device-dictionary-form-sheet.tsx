
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlusCircle, Edit, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { DeviceDictionary, InterfaceTypeDictionary } from "@/types";
import { createDeviceDictionaryAction, updateDeviceDictionaryAction, type ActionResponse } from "@/lib/actions";

const NO_PREFIX_SENTINEL = "__NO_PREFIX_INTERNAL__";

const formSchema = z.object({
  deviceName: z.string().min(1, "设备名称不能为空。").max(100, "设备名称过长。"),
  portPrefix: z.string().optional(), 
  portNumberSuffix: z.string().max(40, "端口号后缀过长（最多40字符）。").optional(),
}).superRefine((data, ctx) => {
  const prefixValue = data.portPrefix === NO_PREFIX_SENTINEL ? "" : (data.portPrefix || "");
  const fullPort = prefixValue + (data.portNumberSuffix || "");

  if (data.portPrefix && data.portPrefix !== NO_PREFIX_SENTINEL && (!data.portNumberSuffix || data.portNumberSuffix.trim() === "")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "选择端口前缀后，必须填写端口号后缀。",
      path: ["portNumberSuffix"],
    });
  }

  if (fullPort.length > 50) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "完整端口号（前缀+后缀）总长度不能超过50个字符。",
      path: ["portNumberSuffix"], 
    });
  }
});

type FormValues = z.infer<typeof formSchema>;

interface DeviceDictionaryFormSheetProps {
  dictionaryEntry?: DeviceDictionary;
  interfaceTypes: InterfaceTypeDictionary[];
  children?: React.ReactNode;
  buttonProps?: ButtonProps;
  onDataChange?: () => void;
}

export function DeviceDictionaryFormSheet({ dictionaryEntry, interfaceTypes, children, buttonProps, onDataChange }: DeviceDictionaryFormSheetProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const { toast } = useToast();
  const isEditing = !!dictionaryEntry;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      deviceName: "",
      portPrefix: NO_PREFIX_SENTINEL,
      portNumberSuffix: ""
    },
  });
  
  const sortedInterfaceTypes = React.useMemo(() => 
    [...interfaceTypes].sort((a, b) => b.name.length - a.name.length), 
  [interfaceTypes]);


  React.useEffect(() => {
    if (isOpen) {
      let initialPrefix = NO_PREFIX_SENTINEL;
      let initialSuffix = "";

      if (isEditing && dictionaryEntry?.port) {
        const existingPort = dictionaryEntry.port;
        const foundPrefixEntry = sortedInterfaceTypes.find(p => existingPort.startsWith(p.name));

        if (foundPrefixEntry) {
          initialPrefix = foundPrefixEntry.name; 
          initialSuffix = existingPort.substring(foundPrefixEntry.name.length);
        } else {
          initialSuffix = existingPort; 
        }
      }

      form.reset({
        deviceName: dictionaryEntry?.deviceName || "",
        portPrefix: initialPrefix,
        portNumberSuffix: initialSuffix,
      });
      form.clearErrors();
    }
  }, [isOpen, dictionaryEntry, form, isEditing, sortedInterfaceTypes]);

  async function onSubmit(data: FormValues) {
    form.clearErrors();
    let response: ActionResponse<DeviceDictionary>;
    try {
      const prefixToUse = data.portPrefix === NO_PREFIX_SENTINEL ? "" : (data.portPrefix || "");
      const fullPort = prefixToUse + (data.portNumberSuffix || "");
      
      const payload = {
        deviceName: data.deviceName,
        port: fullPort.trim().length > 0 ? fullPort.trim() : undefined 
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

            <FormItem>
              <FormLabel>端口号 (可选)</FormLabel>
              <div className="flex flex-col sm:flex-row gap-2 items-start">
                <FormField
                  control={form.control}
                  name="portPrefix"
                  render={({ field }) => (
                    <FormItem className="w-full sm:w-2/5">
                      <Select onValueChange={field.onChange} value={field.value || NO_PREFIX_SENTINEL}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="选择前缀" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={NO_PREFIX_SENTINEL}>无前缀 / 自定义</SelectItem>
                          {sortedInterfaceTypes.map(option => (
                            <SelectItem key={option.id} value={option.name}>
                              {option.name}
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
                  name="portNumberSuffix"
                  render={({ field }) => (
                    <FormItem className="flex-grow">
                      <div className="relative">
                        <FormControl>
                          <Input placeholder="例如 1/0/1 或 23" {...field} className="pr-8"/>
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
                            aria-label="清除端口号后缀"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
               {form.formState.errors.portNumberSuffix && form.formState.errors.portNumberSuffix.message?.includes("总长度") && (
                <p className="text-sm font-medium text-destructive">{form.formState.errors.portNumberSuffix.message}</p>
              )}
            </FormItem>

            <SheetFooter className="mt-8"><SheetClose asChild><Button type="button" variant="outline">取消</Button></SheetClose><Button type="submit" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? "保存中..." : (isEditing ? "保存更改" : "创建条目")}</Button></SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
