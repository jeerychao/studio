
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
  Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PlusCircle, Edit, X, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { IPAddress, Subnet, IPAddressStatus, VLAN, DeviceDictionary, PaymentSourceDictionary, AccessTypeDictionary, InterfaceTypeDictionary } from "@/types";
import { createIPAddressAction, updateIPAddressAction, type ActionResponse } from "@/lib/actions";
import { NO_DIRECT_VLAN_SENTINEL, NO_SELECTION_SENTINEL, NO_SUBNET_SELECTED_SENTINEL } from "@/lib/constants";

const ipAddressStatusOptions: IPAddressStatus[] = ["allocated", "free", "reserved"];
const ipAddressStatusLabels: Record<IPAddressStatus, string> = { allocated: "已分配", free: "空闲", reserved: "预留" };

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

  peerUnitName: z.string().max(100, "对端单位名称过长").optional(),
  peerDeviceName: z.string().optional(),
  peerPortPrefix: z.string().optional(),
  peerPortSuffix: z.string().max(100, "对端端口后缀过长").optional(),

  selectedAccessType: z.string().optional(),
  selectedLocalDeviceName: z.string().optional(),
  selectedDevicePortPrefix: z.string().optional(), // New
  selectedDevicePortSuffix: z.string().max(100, "本端端口后缀过长").optional(), // New
  selectedPaymentSource: z.string().optional(),
});

type IPAddressFormValues = z.infer<typeof ipAddressFormSchema>;

export interface UpdateIPAddressData {
  ipAddress?: string;
  subnetId?: string | undefined;
  directVlanId?: string | null | undefined;
  status?: IPAddressStatus;
  isGateway?: boolean | null | undefined;
  allocatedTo?: string | null | undefined;
  usageUnit?: string | null | undefined;
  contactPerson?: string | null | undefined;
  phone?: string | null | undefined;
  description?: string | null | undefined;
  updatedAt?: string; // Added from previous change
  createdAt?: string; // Added from previous change
  peerUnitName?: string | null | undefined;
  peerDeviceName?: string | null | undefined;
  peerPortName?: string | null | undefined;
  selectedAccessType?: string | null | undefined;
  selectedLocalDeviceName?: string | null | undefined;
  selectedDevicePort?: string | null | undefined;
  selectedPaymentSource?: string | null | undefined;
}


interface IPAddressFormSheetProps {
  ipAddress?: IPAddress;
  subnets: Subnet[];
  vlans: VLAN[];
  deviceDictionaries: DeviceDictionary[];
  paymentSourceDictionaries: PaymentSourceDictionary[];
  accessTypeDictionaries: AccessTypeDictionary[];
  interfaceTypes: InterfaceTypeDictionary[];
  currentSubnetId?: string;
  children?: React.ReactNode;
  buttonProps?: ButtonProps;
  onIpAddressChange?: () => void;
}

export function IPAddressFormSheet({
    ipAddress, subnets, vlans, deviceDictionaries, paymentSourceDictionaries, accessTypeDictionaries, interfaceTypes,
    currentSubnetId, children, buttonProps, onIpAddressChange
}: IPAddressFormSheetProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const { toast } = useToast();
  const isEditing = !!ipAddress;

  const sortedInterfaceTypes = React.useMemo(() =>
    [...interfaceTypes].sort((a, b) => b.name.length - a.name.length),
  [interfaceTypes]);

  const form = useForm<IPAddressFormValues>({
    resolver: zodResolver(ipAddressFormSchema),
    defaultValues: {
      ipAddress: "", subnetId: "", directVlanId: "", status: "free", isGateway: false,
      allocatedTo: "", usageUnit: "", contactPerson: "", phone: "", description: "",
      peerUnitName: "", peerDeviceName: NO_SELECTION_SENTINEL,
      peerPortPrefix: NO_SELECTION_SENTINEL, peerPortSuffix: "",
      selectedAccessType: NO_SELECTION_SENTINEL,
      selectedLocalDeviceName: NO_SELECTION_SENTINEL,
      selectedDevicePortPrefix: NO_SELECTION_SENTINEL, selectedDevicePortSuffix: "", // New
      selectedPaymentSource: NO_SELECTION_SENTINEL,
    },
  });

  React.useEffect(() => {
    if (isOpen) {
        let initialPeerPortPrefix = NO_SELECTION_SENTINEL;
        let initialPeerPortSuffix = "";
        if (isEditing && ipAddress?.peerPortName) {
            const existingPeerPort = ipAddress.peerPortName;
            const foundPrefixEntry = sortedInterfaceTypes.find(it => existingPeerPort.startsWith(it.name + " "));
            if (foundPrefixEntry) {
                initialPeerPortPrefix = foundPrefixEntry.name;
                initialPeerPortSuffix = existingPeerPort.substring(foundPrefixEntry.name.length + 1).trim();
            } else {
                const foundExactPrefixEntry = sortedInterfaceTypes.find(it => existingPeerPort === it.name);
                if (foundExactPrefixEntry) {
                     initialPeerPortPrefix = foundExactPrefixEntry.name;
                     initialPeerPortSuffix = "";
                } else {
                    initialPeerPortSuffix = existingPeerPort;
                }
            }
        }

        let initialSelectedDevicePortPrefix = NO_SELECTION_SENTINEL;
        let initialSelectedDevicePortSuffix = "";
        if (isEditing && ipAddress?.selectedDevicePort) {
            const existingSelectedDevicePort = ipAddress.selectedDevicePort;
            const foundPrefixEntry = sortedInterfaceTypes.find(it => existingSelectedDevicePort.startsWith(it.name + " "));
            if (foundPrefixEntry) {
                initialSelectedDevicePortPrefix = foundPrefixEntry.name;
                initialSelectedDevicePortSuffix = existingSelectedDevicePort.substring(foundPrefixEntry.name.length + 1).trim();
            } else {
                 const foundExactPrefixEntry = sortedInterfaceTypes.find(it => existingSelectedDevicePort === it.name);
                if (foundExactPrefixEntry) {
                     initialSelectedDevicePortPrefix = foundExactPrefixEntry.name;
                     initialSelectedDevicePortSuffix = "";
                } else {
                    initialSelectedDevicePortSuffix = existingSelectedDevicePort;
                }
            }
        }

        form.reset({
            ipAddress: ipAddress?.ipAddress || "",
            subnetId: ipAddress?.subnetId || currentSubnetId || (subnets.length > 0 && !currentSubnetId ? subnets[0].id : NO_SUBNET_SELECTED_SENTINEL),
            directVlanId: ipAddress?.directVlanId || NO_DIRECT_VLAN_SENTINEL,
            status: ipAddress?.status || "free",
            isGateway: ipAddress?.isGateway || false,
            allocatedTo: ipAddress?.allocatedTo || "",
            usageUnit: ipAddress?.usageUnit || "",
            contactPerson: ipAddress?.contactPerson || "",
            phone: ipAddress?.phone || "",
            description: ipAddress?.description || "",

            peerUnitName: ipAddress?.peerUnitName || "",
            peerDeviceName: ipAddress?.peerDeviceName || NO_SELECTION_SENTINEL,
            peerPortPrefix: initialPeerPortPrefix,
            peerPortSuffix: initialPeerPortSuffix,

            selectedAccessType: ipAddress?.selectedAccessType || NO_SELECTION_SENTINEL,
            selectedLocalDeviceName: ipAddress?.selectedLocalDeviceName || NO_SELECTION_SENTINEL,
            selectedDevicePortPrefix: initialSelectedDevicePortPrefix, // New
            selectedDevicePortSuffix: initialSelectedDevicePortSuffix, // New
            selectedPaymentSource: ipAddress?.selectedPaymentSource || NO_SELECTION_SENTINEL,
        });
        form.clearErrors();
    }
  }, [isOpen, ipAddress, subnets, vlans, currentSubnetId, form, deviceDictionaries, sortedInterfaceTypes, isEditing]);


  const handleLocalDeviceChange = (value: string) => {
    const deviceNameToSet = value === NO_SELECTION_SENTINEL ? "" : value;
    form.setValue("selectedLocalDeviceName", deviceNameToSet);
  };

  const handlePeerDeviceChange = (value: string) => {
    const deviceNameToSet = value === NO_SELECTION_SENTINEL ? "" : value;
    form.setValue("peerDeviceName", deviceNameToSet);
  };


  async function onSubmit(data: IPAddressFormValues) {
    form.clearErrors();
    let response: ActionResponse<IPAddress>;
    try {
      const effectiveSubnetId = data.subnetId === NO_SUBNET_SELECTED_SENTINEL ? undefined : (data.subnetId || undefined);
      const directVlanIdToSave = data.directVlanId === NO_DIRECT_VLAN_SENTINEL || data.directVlanId === "" || data.directVlanId === undefined ? null : data.directVlanId;

      const peerPrefix = data.peerPortPrefix === NO_SELECTION_SENTINEL || !data.peerPortPrefix ? "" : data.peerPortPrefix;
      const peerSuffix = data.peerPortSuffix || "";
      const finalPeerPortName = (peerPrefix && peerSuffix) ? `${peerPrefix} ${peerSuffix}` : (peerPrefix || peerSuffix || null);

      const selectedDevicePortPrefix = data.selectedDevicePortPrefix === NO_SELECTION_SENTINEL || !data.selectedDevicePortPrefix ? "" : data.selectedDevicePortPrefix;
      const selectedDevicePortSuffix = data.selectedDevicePortSuffix || "";
      const finalSelectedDevicePort = (selectedDevicePortPrefix && selectedDevicePortSuffix) ? `${selectedDevicePortPrefix} ${selectedDevicePortSuffix}` : (selectedDevicePortPrefix || selectedDevicePortSuffix || null);


      const commonPayload = {
        ipAddress: data.ipAddress, subnetId: effectiveSubnetId, directVlanId: directVlanIdToSave,
        status: data.status, isGateway: data.isGateway,
        allocatedTo: data.allocatedTo || null, usageUnit: data.usageUnit || null,
        contactPerson: data.contactPerson || null, phone: data.phone || null, description: data.description || null,

        peerUnitName: data.peerUnitName || null,
        peerDeviceName: data.peerDeviceName === NO_SELECTION_SENTINEL || !data.peerDeviceName ? null : data.peerDeviceName,
        peerPortName: finalPeerPortName,

        selectedAccessType: data.selectedAccessType === NO_SELECTION_SENTINEL || !data.selectedAccessType ? null : data.selectedAccessType,
        selectedLocalDeviceName: data.selectedLocalDeviceName === NO_SELECTION_SENTINEL || !data.selectedLocalDeviceName ? null : data.selectedLocalDeviceName,
        selectedDevicePort: finalSelectedDevicePort, // Updated
        selectedPaymentSource: data.selectedPaymentSource === NO_SELECTION_SENTINEL || !data.selectedPaymentSource ? null : data.selectedPaymentSource,
      };

      if (isEditing && ipAddress) {
        const payloadForUpdate: UpdateIPAddressData = commonPayload;
        response = await updateIPAddressAction(ipAddress.id, payloadForUpdate);
      } else {
        const payloadForCreate: Omit<IPAddress, "id" | "createdAt" | "updatedAt"> = {
            ...commonPayload,
            subnetId: commonPayload.subnetId,
            directVlanId: commonPayload.directVlanId === null ? undefined : commonPayload.directVlanId,
            isGateway: commonPayload.isGateway ?? false,
            allocatedTo: commonPayload.allocatedTo === null ? undefined : commonPayload.allocatedTo,
            usageUnit: commonPayload.usageUnit === null ? undefined : commonPayload.usageUnit,
            contactPerson: commonPayload.contactPerson === null ? undefined : commonPayload.contactPerson,
            phone: commonPayload.phone === null ? undefined : commonPayload.phone,
            description: commonPayload.description === null ? undefined : commonPayload.description,
            peerUnitName: commonPayload.peerUnitName === null ? undefined : commonPayload.peerUnitName,
            peerDeviceName: commonPayload.peerDeviceName === null ? undefined : commonPayload.peerDeviceName,
            peerPortName: commonPayload.peerPortName === null ? undefined : commonPayload.peerPortName,
            selectedAccessType: commonPayload.selectedAccessType === null ? undefined : commonPayload.selectedAccessType,
            selectedLocalDeviceName: commonPayload.selectedLocalDeviceName === null ? undefined : commonPayload.selectedLocalDeviceName,
            selectedDevicePort: commonPayload.selectedDevicePort === null ? undefined : commonPayload.selectedDevicePort, // Updated
            selectedPaymentSource: commonPayload.selectedPaymentSource === null ? undefined : commonPayload.selectedPaymentSource,
        };
        response = await createIPAddressAction(payloadForCreate);
      }

      if (response.success && response.data) {
        toast({ title: isEditing ? "IP 地址已更新" : "IP 地址已创建", description: `IP ${response.data.ipAddress} 已成功${isEditing ? '更新' : '创建'}。` });
        setIsOpen(false);
        if (onIpAddressChange) onIpAddressChange();
      } else if (response.error) {
        const toastTitle =
          response.error.code === 'VALIDATION_ERROR' ||
          (response.error.code && response.error.code.includes('_EXISTS')) ||
          response.error.code === 'NOT_FOUND' ||
          response.error.code === 'AUTH_ERROR'
          ? "输入或操作无效"
          : "操作失败";
        toast({ title: toastTitle, description: response.error.userMessage, variant: "destructive" });
        if (response.error.field) form.setError(response.error.field as FieldPath<IPAddressFormValues>, { type: "server", message: response.error.userMessage });
      }
    } catch (error) {
      toast({ title: "客户端错误", description: error instanceof Error ? error.message : "提交表单时发生意外错误。", variant: "destructive" });
    }
  }

  const trigger = children ? React.cloneElement(children as React.ReactElement, { onClick: () => setIsOpen(true) })
    : <Button variant={isEditing ? "ghost" : "default"} size={isEditing ? "icon" : undefined} onClick={() => setIsOpen(true)} {...buttonProps}>
        {isEditing ? <Edit className="h-4 w-4" /> : <><PlusCircle className="mr-2 h-4 w-4" /> 添加IP地址</>}
        {isEditing && <span className="sr-only">编辑IP地址</span>}
      </Button>;

  const clearButton = (fieldName: FieldPath<IPAddressFormValues>, label: string) => (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 text-muted-foreground hover:bg-transparent hover:text-current"
      onClick={() => {
        form.setValue(fieldName, "" as any);
        form.trigger(fieldName);
      }}
      aria-label={`清除${label}`}
    >
      <X className="h-4 w-4" />
    </Button>
  );

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="sm:max-w-lg w-full flex flex-col p-0">
        <SheetHeader className="p-6 pb-4 border-b"><SheetTitle>{isEditing ? "编辑IP地址" : "添加新IP地址"}</SheetTitle><SheetDescription>{isEditing ? "更新现有IP地址的详细信息。" : "填写新IP地址的详细信息。"}</SheetDescription></SheetHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-grow overflow-hidden">
            <ScrollArea className="flex-1 px-6 pt-6 pb-2"><div className="space-y-6">
                <FormField control={form.control} name="ipAddress" render={({ field }) => (
                  <FormItem>
                    <FormLabel>IP 地址</FormLabel>
                    <div className="relative">
                      <FormControl><Input placeholder="例如 192.168.1.100" {...field} className="pr-8"/></FormControl>
                      {field.value && (<Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 text-muted-foreground hover:bg-transparent hover:text-current" onClick={() => {form.setValue(field.name, ""); form.trigger(field.name);}} aria-label="清除IP地址"><X className="h-4 w-4" /></Button>)}
                    </div>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="subnetId" render={({ field }) => (<FormItem><FormLabel>子网</FormLabel><Select onValueChange={(value) => field.onChange(value === NO_SUBNET_SELECTED_SENTINEL ? "" : value)} value={field.value || NO_SUBNET_SELECTED_SENTINEL} disabled={subnets.length === 0 && !field.value}><FormControl><SelectTrigger><SelectValue placeholder={subnets.length > 0 ? "选择一个子网" : "无可用子网"} /></SelectTrigger></FormControl><SelectContent><SelectItem value={NO_SUBNET_SELECTED_SENTINEL}>无子网 / 全局池</SelectItem>{subnets.map((subnet) => (<SelectItem key={subnet.id} value={subnet.id}>{subnet.cidr} ({subnet.name || subnet.description || "无描述"})</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="directVlanId" render={({ field }) => (<FormItem><FormLabel>直接关联 VLAN (可选)</FormLabel><Select onValueChange={(value) => field.onChange(value === NO_DIRECT_VLAN_SENTINEL ? "" : value)} value={field.value === "" || field.value === null || field.value === undefined ? NO_DIRECT_VLAN_SENTINEL : field.value } disabled={vlans.length === 0 && field.value !== NO_DIRECT_VLAN_SENTINEL && field.value !== ""}><FormControl><SelectTrigger><SelectValue placeholder={vlans.length > 0 ? "选择一个VLAN或无" : "无可用VLAN"} /></SelectTrigger></FormControl><SelectContent><SelectItem value={NO_DIRECT_VLAN_SENTINEL}>无直接VLAN</SelectItem>{vlans.map((vlan) => (<SelectItem key={vlan.id} value={vlan.id}>VLAN {vlan.vlanNumber} ({vlan.name || vlan.description || "无描述"})</SelectItem>))}</SelectContent></Select><FormDescription>IP直接属于此VLAN，独立于其子网的VLAN设置。</FormDescription><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="status" render={({ field }) => (<FormItem><FormLabel>状态</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="选择状态" /></SelectTrigger></FormControl><SelectContent>{ipAddressStatusOptions.map((status) => (<SelectItem key={status} value={status} className="capitalize">{ipAddressStatusLabels[status]}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="isGateway" render={({ field }) => (<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm"><div className="space-y-0.5"><FormLabel>是否网关</FormLabel><FormDescription>此IP地址是否作为其子网的网关地址？</FormDescription></div><FormControl><Switch checked={field.value} onCheckedChange={field.onChange}/></FormControl><FormMessage /></FormItem>)} />

                <FormField control={form.control} name="allocatedTo" render={({ field }) => (
                  <FormItem>
                    <FormLabel>分配给 (可选)</FormLabel>
                    <div className="relative">
                      <FormControl><Input placeholder="例如 服务器-01, 用户设备" {...field} className="pr-8"/></FormControl>
                      {field.value && (<Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 text-muted-foreground hover:bg-transparent hover:text-current" onClick={() => {form.setValue(field.name, ""); form.trigger(field.name);}} aria-label="清除分配给"><X className="h-4 w-4" /></Button>)}
                    </div>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="usageUnit" render={({ field }) => (
                  <FormItem>
                    <FormLabel>使用单位 (可选)</FormLabel>
                    <div className="relative">
                      <FormControl><Input placeholder="例如 研发部, 财务科" {...field} className="pr-8"/></FormControl>
                      {field.value && (<Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 text-muted-foreground hover:bg-transparent hover:text-current" onClick={() => {form.setValue(field.name, ""); form.trigger(field.name);}} aria-label="清除使用单位"><X className="h-4 w-4" /></Button>)}
                    </div>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="contactPerson" render={({ field }) => (
                  <FormItem>
                    <FormLabel>联系人 (可选)</FormLabel>
                    <div className="relative">
                      <FormControl><Input placeholder="例如 张三" {...field} className="pr-8"/></FormControl>
                      {field.value && (<Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 text-muted-foreground hover:bg-transparent hover:text-current" onClick={() => {form.setValue(field.name, ""); form.trigger(field.name);}} aria-label="清除联系人"><X className="h-4 w-4" /></Button>)}
                    </div>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="phone" render={({ field }) => (
                  <FormItem>
                    <FormLabel>电话 (可选)</FormLabel>
                    <div className="relative">
                      <FormControl><Input placeholder="例如 13800138000" {...field} className="pr-8"/></FormControl>
                      {field.value && (<Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 text-muted-foreground hover:bg-transparent hover:text-current" onClick={() => {form.setValue(field.name, ""); form.trigger(field.name);}} aria-label="清除电话"><X className="h-4 w-4" /></Button>)}
                    </div>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="peerUnitName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>对端单位名称 (可选)</FormLabel>
                     <div className="relative">
                        <FormControl><Input placeholder="例如 客户A, 合作ISP B" {...field} className="pr-8"/></FormControl>
                        {field.value && (<Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 text-muted-foreground hover:bg-transparent hover:text-current" onClick={() => {form.setValue(field.name, ""); form.trigger(field.name);}} aria-label="清除对端单位名称"><X className="h-4 w-4" /></Button>)}
                    </div>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="peerDeviceName" render={({ field }) => (<FormItem><FormLabel>对端设备 (可选)</FormLabel><Select onValueChange={handlePeerDeviceChange} value={field.value || NO_SELECTION_SENTINEL}><FormControl><SelectTrigger><SelectValue placeholder="选择对端设备" /></SelectTrigger></FormControl><SelectContent><SelectItem value={NO_SELECTION_SENTINEL}>-- 无 --</SelectItem>{deviceDictionaries.map(dev => (<SelectItem key={dev.id} value={dev.deviceName}>{dev.deviceName}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>)} />

                <FormItem>
                  <FormLabel>对端端口 (可选)</FormLabel>
                  <div className="flex flex-col sm:flex-row gap-2 items-start">
                    <FormField
                      control={form.control}
                      name="peerPortPrefix"
                      render={({ field }) => (
                        <FormItem className="w-full sm:w-2/5">
                          <Select onValueChange={field.onChange} value={field.value || NO_SELECTION_SENTINEL}>
                            <FormControl><SelectTrigger><SelectValue placeholder="选择前缀" /></SelectTrigger></FormControl>
                            <SelectContent>
                              <SelectItem value={NO_SELECTION_SENTINEL}>-- 无前缀 --</SelectItem>
                              {interfaceTypes.map(it => (<SelectItem key={it.id} value={it.name}>{it.name}</SelectItem>))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="peerPortSuffix"
                      render={({ field }) => (
                        <FormItem className="flex-grow">
                          <div className="relative">
                            <FormControl><Input placeholder="例如 1/0/1 或 23" {...field} className="pr-8"/></FormControl>
                            {field.value && clearButton("peerPortSuffix" as FieldPath<IPAddressFormValues>, "对端端口后缀")}
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </FormItem>

                <FormField
                    control={form.control}
                    name="selectedAccessType"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>接入方式</FormLabel>
                            <Select onValueChange={(value) => field.onChange(value === NO_SELECTION_SENTINEL ? "" : value)} value={field.value || NO_SELECTION_SENTINEL}>
                                <FormControl><SelectTrigger><SelectValue placeholder="选择接入方式" /></SelectTrigger></FormControl>
                                <SelectContent>
                                    <SelectItem value={NO_SELECTION_SENTINEL}>-- 无 --</SelectItem>
                                    {accessTypeDictionaries.map(at => (
                                      <SelectItem key={at.id} value={at.name}>{at.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField control={form.control} name="selectedLocalDeviceName" render={({ field }) => (<FormItem><FormLabel>本端设备名称 (可选)</FormLabel><Select onValueChange={handleLocalDeviceChange} value={field.value || NO_SELECTION_SENTINEL}><FormControl><SelectTrigger><SelectValue placeholder="选择本端设备" /></SelectTrigger></FormControl><SelectContent><SelectItem value={NO_SELECTION_SENTINEL}>-- 无 --</SelectItem>{deviceDictionaries.map(dev => (<SelectItem key={dev.id} value={dev.deviceName}>{dev.deviceName}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>)} />
                
                <FormItem>
                  <FormLabel>本端设备端口 (可选)</FormLabel>
                  <div className="flex flex-col sm:flex-row gap-2 items-start">
                    <FormField
                      control={form.control}
                      name="selectedDevicePortPrefix"
                      render={({ field }) => (
                        <FormItem className="w-full sm:w-2/5">
                          <Select onValueChange={field.onChange} value={field.value || NO_SELECTION_SENTINEL}>
                            <FormControl><SelectTrigger><SelectValue placeholder="选择前缀" /></SelectTrigger></FormControl>
                            <SelectContent>
                              <SelectItem value={NO_SELECTION_SENTINEL}>-- 无前缀 --</SelectItem>
                              {interfaceTypes.map(it => (<SelectItem key={it.id} value={it.name}>{it.name}</SelectItem>))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="selectedDevicePortSuffix"
                      render={({ field }) => (
                        <FormItem className="flex-grow">
                          <div className="relative">
                            <FormControl><Input placeholder="例如 1/0/2, Eth0/0/1" {...field} className="pr-8"/></FormControl>
                            {field.value && clearButton("selectedDevicePortSuffix" as FieldPath<IPAddressFormValues>, "本端端口后缀")}
                          </div>
                          <FormMessage/>
                        </FormItem>
                      )}
                    />
                  </div>
                </FormItem>

                <FormField control={form.control} name="selectedPaymentSource" render={({ field }) => (<FormItem><FormLabel>费用来源 (可选)</FormLabel><Select onValueChange={(value) => field.onChange(value === NO_SELECTION_SENTINEL ? "" : value)} value={field.value || NO_SELECTION_SENTINEL}><FormControl><SelectTrigger><SelectValue placeholder="选择费用来源" /></SelectTrigger></FormControl><SelectContent><SelectItem value={NO_SELECTION_SENTINEL}>-- 无 --</SelectItem>{paymentSourceDictionaries.map(ps => (<SelectItem key={ps.id} value={ps.sourceName}>{ps.sourceName}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="description" render={({ field }) => (<FormItem><FormLabel>描述 (可选)</FormLabel><div className="relative"><FormControl><Input placeholder="例如 批量创建的设备" {...field} className="pr-8"/></FormControl>{field.value && clearButton("description" as FieldPath<IPAddressFormValues>, "描述")}</div><FormMessage /></FormItem>)} />
            </div></ScrollArea>
            <SheetFooter className="p-6 pt-4 border-t">
              <SheetClose asChild><Button type="button" variant="outline">取消</Button></SheetClose>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />处理中...</> : (isEditing ? "保存更改" : "创建IP地址")}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
