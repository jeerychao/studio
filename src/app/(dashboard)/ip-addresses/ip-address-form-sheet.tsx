
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PlusCircle, Edit } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { IPAddress, Subnet, IPAddressStatus, VLAN } from "@/types";
import { createIPAddressAction, updateIPAddressAction, type ActionResponse } from "@/lib/actions";

const ipAddressStatusOptions: IPAddressStatus[] = ["allocated", "free", "reserved"];
const ipAddressStatusLabels: Record<IPAddressStatus, string> = {
  allocated: "已分配",
  free: "空闲",
  reserved: "预留",
};

const ipAddressFormSchema = z.object({
  ipAddress: z.string().ip({ version: "v4", message: "无效的 IPv4 地址" }),
  subnetId: z.string().optional(),
  vlanId: z.string().optional(),
  status: z.enum(["allocated", "free", "reserved"], { required_error: "状态是必需的"}),
  allocatedTo: z.string().max(100, "分配给对象过长").optional(),
  description: z.string().max(200, "描述过长").optional(),
});

type IPAddressFormValues = z.infer<typeof ipAddressFormSchema>;

interface IPAddressFormSheetProps {
  ipAddress?: IPAddress;
  subnets: Subnet[];
  vlans: VLAN[];
  currentSubnetId?: string;
  children?: React.ReactNode;
  buttonProps?: ButtonProps;
  onIpAddressChange?: () => void;
}

const NO_SUBNET_SELECTED_SENTINEL = "__NO_SUBNET_INTERNAL__";
const INHERIT_VLAN_SENTINEL = "__INHERIT_VLAN_INTERNAL__";


export function IPAddressFormSheet({
    ipAddress,
    subnets,
    vlans,
    currentSubnetId,
    children,
    buttonProps,
    onIpAddressChange
}: IPAddressFormSheetProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const { toast } = useToast();
  const isEditing = !!ipAddress;

  const form = useForm<IPAddressFormValues>({
    resolver: zodResolver(ipAddressFormSchema),
    defaultValues: {
      ipAddress: "",
      subnetId: "",
      vlanId: "",
      status: "free",
      allocatedTo: "",
      description: "",
    },
  });

  React.useEffect(() => {
    if (isOpen) {
        let initialVlanIdForForm = ipAddress?.vlanId || "";

        form.reset({
            ipAddress: ipAddress?.ipAddress || "",
            subnetId: ipAddress?.subnetId || currentSubnetId || (subnets.length > 0 && !currentSubnetId ? subnets[0].id : ""),
            vlanId: initialVlanIdForForm,
            status: ipAddress?.status || "free",
            allocatedTo: ipAddress?.allocatedTo || "",
            description: ipAddress?.description || "",
        });
        form.clearErrors();
    }
  }, [isOpen, ipAddress, subnets, vlans, currentSubnetId, form]);

  async function onSubmit(data: IPAddressFormValues) {
    form.clearErrors();
    let response: ActionResponse<IPAddress>;
    try {
      const effectiveSubnetId = data.subnetId === NO_SUBNET_SELECTED_SENTINEL ? undefined : (data.subnetId || undefined);
      // When "Inherit/None" (INHERIT_VLAN_SENTINEL) is selected, or if vlanId is an empty string from the form,
      // vlanIdToSave becomes null. This null value is passed to the server action.
      const vlanIdToSave = data.vlanId === INHERIT_VLAN_SENTINEL || data.vlanId === "" ? null : data.vlanId;

      const payload = {
        ...data,
        subnetId: effectiveSubnetId,
        vlanId: vlanIdToSave, // Now sends null if "Inherit/None" was selected
      };

      if (isEditing && ipAddress) {
        response = await updateIPAddressAction(ipAddress.id, payload);
      } else {
        response = await createIPAddressAction(payload as Omit<IPAddress, "id">);
      }

      if (response.success && response.data) {
        toast({
            title: isEditing ? "IP 地址已更新" : "IP 地址已创建",
            description: `IP ${response.data.ipAddress} 已成功${isEditing ? '更新' : '创建'}。`
        });
        setIsOpen(false);
        if (onIpAddressChange) onIpAddressChange();
      } else if (response.error) {
        toast({
          title: "操作失败",
          description: response.error.userMessage,
          variant: "destructive",
        });
        if (response.error.field) {
          form.setError(response.error.field as FieldPath<IPAddressFormValues>, {
            type: "server",
            message: response.error.userMessage,
          });
        }
      }
    } catch (error) { // Catch unexpected errors
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
      {isEditing ? <Edit className="h-4 w-4" /> : <><PlusCircle className="mr-2 h-4 w-4" /> 添加IP地址</>}
      {isEditing && <span className="sr-only">编辑IP地址</span>}
    </Button>
  );

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{isEditing ? "编辑IP地址" : "添加新IP地址"}</SheetTitle>
          <SheetDescription>
            {isEditing ? "更新现有IP地址的详细信息。" : "填写新IP地址的详细信息。"}
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-6">
            <FormField
              control={form.control}
              name="ipAddress"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>IP 地址</FormLabel>
                  <FormControl>
                    <Input placeholder="例如 192.168.1.100" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="subnetId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>子网</FormLabel>
                  <Select
                    onValueChange={(value) => field.onChange(value === NO_SUBNET_SELECTED_SENTINEL ? "" : value)}
                    value={field.value || NO_SUBNET_SELECTED_SENTINEL}
                    disabled={subnets.length === 0 && !field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={subnets.length > 0 ? "选择一个子网" : "无可用子网"} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                       <SelectItem value={NO_SUBNET_SELECTED_SENTINEL}>无子网 / 全局池</SelectItem>
                      {subnets.map((subnet) => (
                        <SelectItem key={subnet.id} value={subnet.id}>
                          {subnet.cidr} ({subnet.description || "无描述"})
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
              name="vlanId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>VLAN (可选)</FormLabel>
                  <Select
                    onValueChange={(value) => field.onChange(value === INHERIT_VLAN_SENTINEL ? "" : value)}
                    value={field.value === "" ? INHERIT_VLAN_SENTINEL : (field.value || INHERIT_VLAN_SENTINEL) }
                    disabled={vlans.length === 0 && field.value !== INHERIT_VLAN_SENTINEL}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={vlans.length > 0 ? "选择一个VLAN或继承" : "无可用VLAN"} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={INHERIT_VLAN_SENTINEL}>从子网继承或无</SelectItem>
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
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>状态</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="选择状态" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {ipAddressStatusOptions.map((status) => (
                        <SelectItem key={status} value={status} className="capitalize">
                          {ipAddressStatusLabels[status]}
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
              name="allocatedTo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>分配给 (可选)</FormLabel>
                  <FormControl>
                    <Input placeholder="例如 张三的笔记本, 服务器-01" {...field} />
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
                    <Textarea placeholder="简要描述或备注" {...field} />
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
                {form.formState.isSubmitting ? "保存中..." : (isEditing ? "保存更改" : "创建IP地址")}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
    