
"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type FieldPath } from "react-hook-form"; // Import FieldPath
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PlusCircle, Edit } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Subnet, VLAN } from "@/types";
import { createSubnetAction, updateSubnetAction, type ActionResponse } from "@/lib/actions"; // Import ActionResponse

const subnetFormSchema = z.object({
  cidr: z.string().min(7, "CIDR 表示法太短 (例如 x.x.x.x/y)"),
  vlanId: z.string().optional(),
  description: z.string().max(200, "描述过长").optional(),
});

type SubnetFormValues = z.infer<typeof subnetFormSchema>;

interface SubnetFormSheetProps {
  subnet?: Subnet;
  vlans: VLAN[];
  children?: React.ReactNode;
  buttonProps?: ButtonProps;
  onSubnetChange?: () => void;
}

const NO_VLAN_SENTINEL_VALUE = "__NO_VLAN_INTERNAL__";

export function SubnetFormSheet({ subnet, vlans, children, buttonProps, onSubnetChange }: SubnetFormSheetProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const { toast } = useToast();
  const isEditing = !!subnet;

  const form = useForm<SubnetFormValues>({
    resolver: zodResolver(subnetFormSchema),
    defaultValues: {
      cidr: subnet?.cidr || "",
      vlanId: subnet?.vlanId || "",
      description: subnet?.description || "",
    },
  });
  
  React.useEffect(() => {
    if (isOpen) {
      form.reset({
        cidr: subnet?.cidr || "",
        vlanId: subnet?.vlanId || "", 
        description: subnet?.description || "",
      });
      form.clearErrors();
    }
  }, [isOpen, subnet, form]);


  async function onSubmit(values: SubnetFormValues) {
    form.clearErrors(); 

    // Determine the vlanId to send: null if "No VLAN" or empty, otherwise the selected ID.
    const vlanIdForAction = 
      values.vlanId === NO_VLAN_SENTINEL_VALUE || values.vlanId === "" || values.vlanId === undefined
      ? null 
      : values.vlanId;

    // Determine the description to send: null if empty/undefined, otherwise the value.
    const descriptionForAction = 
      values.description === "" || values.description === undefined
      ? null
      : values.description;

    const actionData: { cidr: string; vlanId: string | null; description: string | null; } = {
      cidr: values.cidr,
      vlanId: vlanIdForAction,
      description: descriptionForAction,
    };

    let response: ActionResponse<Subnet>;
    try {
      if (isEditing && subnet) {
        response = await updateSubnetAction(subnet.id, actionData);
      } else {
        // For create, ensure undefined is not sent if fields are truly optional per DB schema
        // However, createSubnetAction expects specific types, so we ensure they are compatible.
        // If description is optional and can be undefined, that's fine.
        // If vlanId is optional and can be undefined, that's fine.
        // Here, we stick to the `actionData` which uses null for clarity.
        // The createSubnetAction needs to handle `vlanId: null` and `description: null` appropriately (e.g., by omitting them or setting DB to NULL).
        // Let's assume createSubnetAction can handle nulls by converting them to undefined if the Prisma schema expects optional undefined.
        // For now, let's ensure the create payload matches what createSubnetAction expects,
        // which might be { cidr: string; vlanId?: string; description?: string; }
        const createPayloadForAction = {
            cidr: actionData.cidr,
            vlanId: actionData.vlanId === null ? undefined : actionData.vlanId,
            description: actionData.description === null ? undefined : actionData.description,
        };
        response = await createSubnetAction(createPayloadForAction);
      }

      if (response.success && response.data) {
        toast({
          title: isEditing ? "子网已更新" : "子网已创建",
          description: isEditing ? `子网 ${response.data.cidr} 已成功更新。` : `子网 ${response.data.cidr} 已成功创建。`,
        });
        setIsOpen(false);
        if (onSubnetChange) onSubnetChange();
        form.reset(); 
      } else if (response.error) {
        toast({
          title: "操作失败",
          description: response.error.userMessage,
          variant: "destructive",
        });
        if (response.error.field && form.setError) {
          const fieldName = response.error.field as FieldPath<SubnetFormValues>;
          if (fieldName in form.getValues()) {
            form.setError(fieldName, {
              type: "server",
              message: response.error.userMessage,
            });
          } else { 
            console.warn(`Server returned error for field '${response.error.field}' which is not in the form.`);
          }
        }
      } else {
        toast({
          title: "未知响应",
          description: "从服务器收到意外响应。",
          variant: "destructive",
        });
      }
    } catch (error: unknown) { 
      console.error("SubnetFormSheet onSubmit unexpected client-side error:", error);
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
      {isEditing ? <Edit className="h-4 w-4" /> : <><PlusCircle className="mr-2 h-4 w-4" /> 添加子网</>}
      {isEditing && <span className="sr-only">编辑子网</span>}
    </Button>
  );

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{isEditing ? "编辑子网" : "添加新子网"}</SheetTitle>
          <SheetDescription>
            {isEditing ? "更新现有子网的详细信息。" : "提供新子网的 CIDR (例如 192.168.1.0/24)。其他详细信息是可选的。"}
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-6">
            <FormField
              control={form.control}
              name="cidr"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>网络地址 (CIDR)</FormLabel>
                  <FormControl>
                    <Input placeholder="例如 192.168.1.0/24" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="vlanId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>VLAN (可选)</FormLabel>
                  <Select
                    onValueChange={(value) => {
                      field.onChange(value === NO_VLAN_SENTINEL_VALUE ? "" : value);
                    }}
                    value={field.value === "" || field.value === null || field.value === undefined ? NO_VLAN_SENTINEL_VALUE : field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="选择一个 VLAN 或留空" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NO_VLAN_SENTINEL_VALUE}>无 VLAN</SelectItem>
                      {vlans.map((vlan) => (
                        <SelectItem key={vlan.id} value={vlan.id}>
                          VLAN {vlan.vlanNumber} ({vlan.description || "无描述"})
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
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>描述 (可选)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="子网的简要描述" {...field} />
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
                {form.formState.isSubmitting ? "保存中..." : (isEditing ? "保存更改" : "创建子网")}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
