
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
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area"; // Added ScrollArea import
import { PlusCircle, Edit } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { IPAddress, Subnet, IPAddressStatus, VLAN } from "@/types";
import { createIPAddressAction, updateIPAddressAction, type ActionResponse, type UpdateIPAddressData } from "@/lib/actions";

const ipAddressStatusOptions: IPAddressStatus[] = ["allocated", "free", "reserved"];
const ipAddressStatusLabels: Record<IPAddressStatus, string> = {
  allocated: "已分配",
  free: "空闲",
  reserved: "预留",
};

const ipAddressFormSchema = z.object({
  ipAddress: z.string().ip({ version: "v4", message: "无效的 IPv4 地址" }),
  subnetId: z.string().optional(),
  directVlanId: z.string().optional(),
  status: z.enum(["allocated", "free", "reserved"], { required_error: "状态是必需的"}),
  isGateway: z.boolean().optional(),
  allocatedTo: z.string().max(100, "分配给对象过长").optional(),
  usageUnit: z.string().max(100, "使用单位过长").optional(),
  contactPerson: z.string().max(50, "联系人姓名过长").optional(),
  phone: z.string().max(30, "电话号码过长").optional(),
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
const NO_DIRECT_VLAN_SENTINEL = "__NO_DIRECT_VLAN_INTERNAL__";

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
      directVlanId: "",
      status: "free",
      isGateway: false,
      allocatedTo: "",
      usageUnit: "",
      contactPerson: "",
      phone: "",
      description: "",
    },
  });

  React.useEffect(() => {
    if (isOpen) {
        form.reset({
            ipAddress: ipAddress?.ipAddress || "",
            subnetId: ipAddress?.subnetId || currentSubnetId || (subnets.length > 0 && !currentSubnetId ? subnets[0].id : ""),
            directVlanId: ipAddress?.directVlanId || "",
            status: ipAddress?.status || "free",
            isGateway: ipAddress?.isGateway || false,
            allocatedTo: ipAddress?.allocatedTo || "",
            usageUnit: ipAddress?.usageUnit || "",
            contactPerson: ipAddress?.contactPerson || "",
            phone: ipAddress?.phone || "",
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
      const directVlanIdToSave = data.directVlanId === NO_DIRECT_VLAN_SENTINEL || data.directVlanId === "" || data.directVlanId === undefined ? null : data.directVlanId;

      const commonPayload = {
        ipAddress: data.ipAddress,
        subnetId: effectiveSubnetId,
        directVlanId: directVlanIdToSave,
        status: data.status,
        isGateway: data.isGateway,
        allocatedTo: data.allocatedTo || null,
        usageUnit: data.usageUnit || null,
        contactPerson: data.contactPerson || null,
        phone: data.phone || null,
        description: data.description || null,
      };

      if (isEditing && ipAddress) {
        const payloadForUpdate: UpdateIPAddressData = commonPayload;
        response = await updateIPAddressAction(ipAddress.id, payloadForUpdate);
      } else {
        const payloadForCreate: Omit<IPAddress, "id"> = {
            ...commonPayload,
            directVlanId: commonPayload.directVlanId === null ? undefined : commonPayload.directVlanId,
            allocatedTo: commonPayload.allocatedTo === null ? undefined : commonPayload.allocatedTo,
            usageUnit: commonPayload.usageUnit === null ? undefined : commonPayload.usageUnit,
            contactPerson: commonPayload.contactPerson === null ? undefined : commonPayload.contactPerson,
            phone: commonPayload.phone === null ? undefined : commonPayload.phone,
            description: commonPayload.description === null ? undefined : commonPayload.description,
        };
        response = await createIPAddressAction(payloadForCreate);
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
      {isEditing ? <Edit className="h-4 w-4" /> : <><PlusCircle className="mr-2 h-4 w-4" /> 添加IP地址</>}
      {isEditing && <span className="sr-only">编辑IP地址</span>}
    </Button>
  );

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="sm:max-w-lg w-full flex flex-col p-0">
        <SheetHeader className="p-6 pb-4 border-b">
          <SheetTitle>{isEditing ? "编辑IP地址" : "添加新IP地址"}</SheetTitle>
          <SheetDescription>
            {isEditing ? "更新现有IP地址的详细信息。" : "填写新IP地址的详细信息。"}
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-grow overflow-hidden">
            <ScrollArea className="flex-1 px-6 pt-6 pb-2">
              <div className="space-y-6">
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
                              {subnet.cidr} ({subnet.name || subnet.description || "无描述"})
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
                  name="directVlanId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>直接关联 VLAN (可选)</FormLabel>
                      <Select
                        onValueChange={(value) => field.onChange(value === NO_DIRECT_VLAN_SENTINEL ? "" : value)}
                        value={field.value === "" || field.value === null || field.value === undefined ? NO_DIRECT_VLAN_SENTINEL : field.value }
                        disabled={vlans.length === 0 && field.value !== NO_DIRECT_VLAN_SENTINEL && field.value !== ""}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={vlans.length > 0 ? "选择一个VLAN或无" : "无可用VLAN"} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={NO_DIRECT_VLAN_SENTINEL}>无直接VLAN</SelectItem> 
                          {vlans.map((vlan) => (
                            <SelectItem key={vlan.id} value={vlan.id}>
                              VLAN {vlan.vlanNumber} ({vlan.name || vlan.description || "无描述"})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>IP直接属于此VLAN，独立于其子网的VLAN设置。</FormDescription>
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
                  name="isGateway"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                      <div className="space-y-0.5">
                        <FormLabel>是否网关</FormLabel>
                        <FormDescription>
                          此IP地址是否作为其子网的网关地址？
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
                  name="allocatedTo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>分配给 (可选)</FormLabel>
                      <FormControl>
                        <Input placeholder="例如 服务器-01, 用户设备" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="usageUnit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>使用单位 (可选)</FormLabel>
                      <FormControl>
                        <Input placeholder="例如 研发部, 财务科" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="contactPerson"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>联系人 (可选)</FormLabel>
                      <FormControl>
                        <Input placeholder="例如 张三" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>电话 (可选)</FormLabel>
                      <FormControl>
                        <Input placeholder="例如 13800138000" {...field} />
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
              </div>
            </ScrollArea>
            <SheetFooter className="p-6 pt-4 border-t">
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
    

    