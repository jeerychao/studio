
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
  FormDescription,
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
import { Switch } from "@/components/ui/switch"; // Ensure Switch is imported
import { PlusCircle, Edit, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Subnet, VLAN } from "@/types";
import { createSubnetAction, updateSubnetAction, type ActionResponse, type UpdateSubnetData, type CreateSubnetData } from "@/lib/actions";
import { NO_VLAN_SENTINEL_VALUE } from "@/lib/constants";

const subnetFormSchema = z.object({
  cidr: z.string().min(7, "CIDR 表示法太短 (例如 x.x.x.x/y)"),
  name: z.string().max(100, "子网名称过长").optional(),
  dhcpEnabled: z.boolean().optional(),
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

export function SubnetFormSheet({ subnet, vlans, children, buttonProps, onSubnetChange }: SubnetFormSheetProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const { toast } = useToast();
  const isEditing = !!subnet;

  const form = useForm<SubnetFormValues>({
    resolver: zodResolver(subnetFormSchema),
    defaultValues: {
      cidr: "",
      name: "",
      dhcpEnabled: false,
      vlanId: "",
      description: "",
    },
  });

  React.useEffect(() => {
    if (isOpen) {
      form.reset({
        cidr: subnet?.cidr || "",
        name: subnet?.name || "",
        dhcpEnabled: subnet?.dhcpEnabled || false,
        vlanId: subnet?.vlanId || "",
        description: subnet?.description || "",
      });
      form.clearErrors();
    }
  }, [isOpen, subnet, form]);

  async function onSubmit(values: SubnetFormValues) {
    form.clearErrors();

    const vlanIdForAction =
      values.vlanId === NO_VLAN_SENTINEL_VALUE || values.vlanId === "" || values.vlanId === undefined
      ? null
      : values.vlanId;

    const nameForAction = values.name === "" || values.name === undefined ? null : values.name;
    const descriptionForAction = values.description === "" || values.description === undefined ? null : values.description;

    let response: ActionResponse<Subnet>;
    try {
      if (isEditing && subnet) {
        const updatePayload: UpdateSubnetData = {
            cidr: values.cidr,
            name: nameForAction,
            dhcpEnabled: values.dhcpEnabled,
            vlanId: vlanIdForAction,
            description: descriptionForAction,
        };
        response = await updateSubnetAction(subnet.id, updatePayload);
      } else {
        const createPayload: CreateSubnetData = {
            cidr: values.cidr,
            name: nameForAction,
            dhcpEnabled: values.dhcpEnabled,
            vlanId: vlanIdForAction,
            description: descriptionForAction,
        };
        response = await createSubnetAction(createPayload);
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
        const toastTitle = 
          response.error.code === 'VALIDATION_ERROR' || 
          (response.error.code && response.error.code.includes('_EXISTS')) || 
          response.error.code === 'SUBNET_OVERLAP_ERROR' ||
          response.error.code === 'NOT_FOUND' || // e.g. VLAN not found
          response.error.code === 'AUTH_ERROR'
          ? "输入或操作无效" 
          : "操作失败";
        toast({
          title: toastTitle,
          description: response.error.userMessage,
          variant: "destructive",
        });
        if (response.error.field) {
          form.setError(response.error.field as FieldPath<SubnetFormValues>, {
            type: "server",
            message: response.error.userMessage,
          });
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
                  <div className="relative">
                    <FormControl>
                      <Input placeholder="例如 192.168.1.0/24" {...field} className="pr-8" />
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
                        aria-label="清除网络地址"
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
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>子网名称 (可选)</FormLabel>
                  <div className="relative">
                    <FormControl>
                      <Input placeholder="例如 办公网络A区" {...field} className="pr-8" />
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
                        aria-label="清除子网名称"
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
                          VLAN {vlan.vlanNumber} ({vlan.name || vlan.description || "无描述"})
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
              name="dhcpEnabled"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                  <div className="space-y-0.5">
                    <FormLabel>DHCP 启用</FormLabel>
                    <FormDescription>
                      此子网是否启用 DHCP 自动分配 IP 地址？
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
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
                    <Textarea placeholder="子网的详细描述或备注" {...field} />
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
