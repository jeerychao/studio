
"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type FieldPath } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger, SheetFooter, SheetClose,
} from "@/components/ui/sheet";
import {
  Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PlusCircle, X, Loader2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Subnet, VLAN, IPAddressStatus, DeviceDictionary, PaymentSourceDictionary, AccessTypeDictionary, InterfaceTypeDictionary } from "@/types";
import { batchCreateIPAddressesAction, type BatchIpCreationResult, type ActionResponse } from "@/lib/actions";
import { ipToNumber } from "@/lib/ip-utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { NO_DIRECT_VLAN_SENTINEL, NO_SELECTION_SENTINEL } from "@/lib/constants";


const ipAddressStatusOptions = ["allocated", "free", "reserved"] as const;
const ipAddressStatusLabels: Record<IPAddressStatus, string> = { allocated: "已分配", free: "空闲", reserved: "预留" };

const ipBatchFormSchema = z.object({
  startIp: z.string().ip({ version: "v4", message: "无效的起始 IPv4 地址" }),
  endIp: z.string().ip({ version: "v4", message: "无效的结束 IPv4 地址" }),
  subnetId: z.string().min(1, "子网是必需的"),
  directVlanId: z.string().optional(),
  status: z.enum(ipAddressStatusOptions, { required_error: "状态是必需的"}),
  description: z.string().max(200, "描述过长").optional(),
  isGateway: z.boolean().optional(),
  usageUnit: z.string().max(100, "使用单位过长").optional(),
  contactPerson: z.string().max(50, "联系人姓名过长").optional(),
  phone: z.string().max(30, "电话号码过长").optional(),
  
  peerUnitName: z.string().max(100, "对端单位名称过长").optional(),
  peerDeviceName: z.string().optional(), 
  peerPortPrefix: z.string().optional(),
  peerPortSuffix: z.string().max(100, "对端端口后缀过长").optional(),

  selectedAccessType: z.string().optional(), 
  selectedLocalDeviceName: z.string().optional(), 
  selectedDevicePortPrefix: z.string().optional(), // New
  selectedDevicePortSuffix: z.string().max(100, "本端端口后缀过长").optional(), // New
  selectedPaymentSource: z.string().optional(),
}).refine(data => {
    try { return ipToNumber(data.startIp) <= ipToNumber(data.endIp); } catch (e) { return false; }
}, { message: "起始IP必须小于或等于结束IP。", path: ["endIp"] });

type IpBatchFormValues = z.infer<typeof ipBatchFormSchema>;

interface IPBatchFormSheetProps {
  subnets: Subnet[];
  vlans: VLAN[];
  deviceDictionaries: DeviceDictionary[]; 
  paymentSourceDictionaries: PaymentSourceDictionary[];
  accessTypeDictionaries: AccessTypeDictionary[];
  interfaceTypes: InterfaceTypeDictionary[]; 
  children?: React.ReactNode;
  onIpAddressChange?: () => void;
}

export function IPBatchFormSheet({
    subnets, vlans, deviceDictionaries, paymentSourceDictionaries, accessTypeDictionaries, interfaceTypes,
    children, onIpAddressChange
}: IPBatchFormSheetProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const form = useForm<IpBatchFormValues>({
    resolver: zodResolver(ipBatchFormSchema),
    defaultValues: {
      startIp: "", endIp: "", subnetId: subnets.length > 0 ? subnets[0].id : "",
      directVlanId: NO_DIRECT_VLAN_SENTINEL, status: "free", description: "",
      isGateway: false, usageUnit: "", contactPerson: "", phone: "",
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
        form.reset({
            startIp: "", endIp: "", subnetId: subnets.length > 0 ? subnets[0].id : "",
            directVlanId: NO_DIRECT_VLAN_SENTINEL, status: "free", description: "",
            isGateway: false, usageUnit: "", contactPerson: "", phone: "",
            peerUnitName: "", peerDeviceName: NO_SELECTION_SENTINEL, 
            peerPortPrefix: NO_SELECTION_SENTINEL, peerPortSuffix: "",
            selectedAccessType: NO_SELECTION_SENTINEL,
            selectedLocalDeviceName: NO_SELECTION_SENTINEL,
            selectedDevicePortPrefix: NO_SELECTION_SENTINEL, selectedDevicePortSuffix: "", // New
            selectedPaymentSource: NO_SELECTION_SENTINEL,
        });
        form.clearErrors();
    }
  }, [isOpen, subnets, form]);


  const handleLocalDeviceChange = (value: string) => {
    form.setValue("selectedLocalDeviceName", value === NO_SELECTION_SENTINEL ? "" : value);
  };

  const handlePeerDeviceChange = (value: string) => {
    form.setValue("peerDeviceName", value === NO_SELECTION_SENTINEL ? "" : value);
  };

  async function onSubmit(data: IpBatchFormValues) {
    form.clearErrors(); 
    setIsSubmitting(true);
    const directVlanIdToSubmit = data.directVlanId === NO_DIRECT_VLAN_SENTINEL ? undefined : data.directVlanId;

    const peerPrefix = data.peerPortPrefix === NO_SELECTION_SENTINEL || !data.peerPortPrefix ? "" : data.peerPortPrefix;
    const peerSuffix = data.peerPortSuffix || "";
    const finalPeerPortName = (peerPrefix && peerSuffix) ? `${"" + peerPrefix} ${"" + peerSuffix}` : (peerPrefix || peerSuffix || undefined);

    const selectedDevicePortPrefix = data.selectedDevicePortPrefix === NO_SELECTION_SENTINEL || !data.selectedDevicePortPrefix ? "" : data.selectedDevicePortPrefix;
    const selectedDevicePortSuffix = data.selectedDevicePortSuffix || "";
    const finalSelectedDevicePort = (selectedDevicePortPrefix && selectedDevicePortSuffix) ? `${selectedDevicePortPrefix} ${selectedDevicePortSuffix}` : (selectedDevicePortPrefix || selectedDevicePortSuffix || undefined);

    const payload = {
        startIp: data.startIp, endIp: data.endIp, subnetId: data.subnetId,
        directVlanId: directVlanIdToSubmit, 
        description: data.description || undefined,
        status: data.status, isGateway: data.isGateway,
        usageUnit: data.usageUnit || undefined, 
        contactPerson: data.contactPerson || undefined, 
        phone: data.phone || undefined,
        
        peerUnitName: data.peerUnitName || undefined, 
        peerDeviceName: data.peerDeviceName === NO_SELECTION_SENTINEL ? undefined : data.peerDeviceName, 
        peerPortName: finalPeerPortName, 

        selectedAccessType: data.selectedAccessType === NO_SELECTION_SENTINEL ? undefined : data.selectedAccessType, 
        selectedLocalDeviceName: data.selectedLocalDeviceName === NO_SELECTION_SENTINEL ? undefined : data.selectedLocalDeviceName,
        selectedDevicePort: finalSelectedDevicePort, // Updated
        selectedPaymentSource: data.selectedPaymentSource === NO_SELECTION_SENTINEL ? undefined : data.selectedPaymentSource,
    };
    let numToCreate = 0;
    try {
      numToCreate = ipToNumber(data.endIp) - ipToNumber(data.startIp) + 1;
    } catch (e) {
      toast({
        title: "输入错误",
        description: "起始或结束IP地址无效。",
        variant: "destructive",
        duration: 10000,
      });
      setIsSubmitting(false);
      return;
    }

    if (numToCreate <= 0) {
      toast({
        title: "输入错误",
        description: "指定的范围未产生任何IP地址，或起始IP大于结束IP。",
        variant: "destructive",
        duration: 10000,
      });
      setIsSubmitting(false);
      return;
    }
    if (numToCreate > 256) { 
        toast({
          title: "输入错误",
          description: `尝试创建 ${numToCreate} 个IP。请分批创建 (例如，每次最多256个)。`,
          variant: "destructive",
          duration: 10000,
        });
        setIsSubmitting(false);
        return;
    }

    try {
      const result = await batchCreateIPAddressesAction(payload);
      
      if (result.successCount > 0 && result.failureDetails.length === 0) {
        toast({ title: "批量创建成功", description: `${result.successCount} 个IP地址已成功创建。`, duration: 5000 });
        if (onIpAddressChange) onIpAddressChange();
        setIsOpen(false); 
      } else if (result.successCount > 0 && result.failureDetails.length > 0) {
        toast({
            title: "批量处理部分成功",
            description: (
              <div>
                <p>成功创建: {result.successCount} 个IP。失败: {result.failureDetails.length} 个。</p>
                <p className="mt-1 text-xs">首个错误: {result.failureDetails[0].ipAttempted}: {result.failureDetails[0].error}</p>
              </div>
            ),
            variant: "destructive", duration: 15000,
        });
        if (onIpAddressChange) onIpAddressChange();
      } else if (result.successCount === 0 && result.failureDetails.length > 0) { 
        toast({
            title: "批量创建失败",
            description: (
              <div>
                <p>所有 {numToCreate} 个IP地址均创建失败。</p>
                <p className="mt-1 text-xs">首个错误: {result.failureDetails[0].ipAttempted}: {result.failureDetails[0].error}</p>
              </div>
            ),
            variant: "destructive", duration: 15000,
        });
      } else { 
        toast({ title: "无操作", description: "没有IP地址被创建或失败。", variant: "default", duration: 5000 });
        setIsOpen(false); 
      }
    } catch (error) {
      const actionError = (error as ActionResponse<any>)?.error;
      if (actionError) {
        toast({ title: "批量创建预处理错误", description: actionError.userMessage, variant: "destructive", duration: 10000 });
        if (actionError.field) form.setError(actionError.field as FieldPath<IpBatchFormValues>, { type: "server", message: actionError.userMessage });
      } else {
        toast({ title: "客户端错误", description: error instanceof Error ? error.message : "批量创建过程中发生意外错误。", variant: "destructive", duration: 10000 });
      }
    } finally {
        setIsSubmitting(false);
    }
  }

  const handleOpenChange = (open: boolean) => { setIsOpen(open); }; 
  const triggerContent = children || <Button variant="outline"><PlusCircle className="mr-2 h-4 w-4" /> 批量添加IP</Button>;

  const clearButton = (fieldName: FieldPath<IpBatchFormValues>, label: string) => (
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
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>{triggerContent}</SheetTrigger>
      <SheetContent className="sm:max-w-lg w-full flex flex-col p-0">
        <SheetHeader className="p-6 pb-4 border-b"><SheetTitle>批量添加IP地址 (范围)</SheetTitle><SheetDescription>输入起始和结束IP地址以创建范围。选择一个子网。其他字段是可选的或有默认值，将应用于范围内所有创建的IP。</SheetDescription></SheetHeader>
        <Form {...form}><form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-grow overflow-hidden">
            <ScrollArea className="flex-1 px-6 pt-4"><div className="space-y-4 pb-4">
                <FormField control={form.control} name="startIp" render={({ field }) => (<FormItem><FormLabel>起始IP地址</FormLabel><div className="relative"><FormControl><Input placeholder="例如 192.168.1.10" {...field} className="pr-8"/></FormControl>{field.value && clearButton("startIp" as FieldPath<IpBatchFormValues>, "起始IP地址")}</div><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="endIp" render={({ field }) => (<FormItem><FormLabel>结束IP地址</FormLabel><div className="relative"><FormControl><Input placeholder="例如 192.168.1.20" {...field} className="pr-8"/></FormControl>{field.value && clearButton("endIp" as FieldPath<IpBatchFormValues>, "结束IP地址")}</div><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="subnetId" render={({ field }) => (<FormItem><FormLabel>子网</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={subnets.length === 0}><FormControl><SelectTrigger><SelectValue placeholder={subnets.length > 0 ? "选择一个子网" : "无可用子网"} /></SelectTrigger></FormControl><SelectContent>{subnets.map((subnet) => (<SelectItem key={subnet.id} value={subnet.id}>{subnet.cidr} ({subnet.name || subnet.description || "无描述"})</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="directVlanId" render={({ field }) => (<FormItem><FormLabel>直接关联 VLAN (可选)</FormLabel><Select onValueChange={(value) => field.onChange(value)} value={field.value || NO_DIRECT_VLAN_SENTINEL} disabled={vlans.length === 0 && field.value !== NO_DIRECT_VLAN_SENTINEL}><FormControl><SelectTrigger><SelectValue placeholder={vlans.length > 0 ? "选择一个VLAN或无" : "无可用VLAN"} /></SelectTrigger></FormControl><SelectContent><SelectItem value={NO_DIRECT_VLAN_SENTINEL}>无直接VLAN</SelectItem>{vlans.map((vlan) => (<SelectItem key={vlan.id} value={vlan.id}>VLAN {vlan.vlanNumber} ({vlan.name || vlan.description || "无描述"})</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="status" render={({ field }) => (<FormItem><FormLabel>所有IP的状态</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="选择状态" /></SelectTrigger></FormControl><SelectContent>{ipAddressStatusOptions.map((status) => (<SelectItem key={status} value={status} className="capitalize">{ipAddressStatusLabels[status]}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="isGateway" render={({ field }) => (<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm"><div className="space-y-0.5"><FormLabel>是否网关 </FormLabel><FormDescription>范围内所有创建的 IP 是否都标记为网关?</FormDescription></div><FormControl><Switch checked={field.value} onCheckedChange={field.onChange}/></FormControl><FormMessage /></FormItem>)} />
                
                <FormField control={form.control} name="usageUnit" render={({ field }) => (<FormItem><FormLabel>使用单位 (可选)</FormLabel><div className="relative"><FormControl><Input placeholder="例如 市场部" {...field} className="pr-8"/></FormControl>{field.value && clearButton("usageUnit" as FieldPath<IpBatchFormValues>, "使用单位")}</div><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="contactPerson" render={({ field }) => (<FormItem><FormLabel>联系人 (可选)</FormLabel><div className="relative"><FormControl><Input placeholder="例如 王经理" {...field} className="pr-8"/></FormControl>{field.value && clearButton("contactPerson" as FieldPath<IpBatchFormValues>, "联系人")}</div><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="phone" render={({ field }) => (<FormItem><FormLabel>电话 (可选)</FormLabel><div className="relative"><FormControl><Input placeholder="例如 010-12345678" {...field} className="pr-8"/></FormControl>{field.value && clearButton("phone" as FieldPath<IpBatchFormValues>, "电话")}</div><FormMessage /></FormItem>)} />

                <FormField control={form.control} name="peerUnitName" render={({ field }) => (<FormItem><FormLabel>对端单位名称 (可选)</FormLabel><div className="relative"><FormControl><Input placeholder="例如 客户A" {...field} className="pr-8"/></FormControl>{field.value && clearButton("peerUnitName" as FieldPath<IpBatchFormValues>, "对端单位名称")}</div><FormMessage /></FormItem>)} />
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
                            {field.value && clearButton("peerPortSuffix" as FieldPath<IpBatchFormValues>, "对端端口后缀")}
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
                            <FormLabel>接入方式 (可选)</FormLabel>
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

                <FormField control={form.control} name="selectedLocalDeviceName" render={({ field }) => (<FormItem><FormLabel>本端设备 (可选)</FormLabel><Select onValueChange={handleLocalDeviceChange} value={field.value || NO_SELECTION_SENTINEL}><FormControl><SelectTrigger><SelectValue placeholder="选择本端设备" /></SelectTrigger></FormControl><SelectContent><SelectItem value={NO_SELECTION_SENTINEL}>-- 无 --</SelectItem>{deviceDictionaries.map(dev => (<SelectItem key={dev.id} value={dev.deviceName}>{dev.deviceName}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>)} />
                
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
                            {field.value && clearButton("selectedDevicePortSuffix" as FieldPath<IpBatchFormValues>, "本端端口后缀")}
                          </div>
                          <FormMessage/>
                        </FormItem>
                      )}
                    />
                  </div>
                </FormItem>

                <FormField control={form.control} name="selectedPaymentSource" render={({ field }) => (<FormItem><FormLabel>费用来源 (可选)</FormLabel><Select onValueChange={(value) => field.onChange(value === NO_SELECTION_SENTINEL ? "" : value)} value={field.value || NO_SELECTION_SENTINEL}><FormControl><SelectTrigger><SelectValue placeholder="选择费用来源" /></SelectTrigger></FormControl><SelectContent><SelectItem value={NO_SELECTION_SENTINEL}>-- 无 --</SelectItem>{paymentSourceDictionaries.map(ps => (<SelectItem key={ps.id} value={ps.sourceName}>{ps.sourceName}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="description" render={({ field }) => (<FormItem><FormLabel>描述 (可选)</FormLabel><div className="relative"><FormControl><Input placeholder="例如 批量创建的设备" {...field} className="pr-8"/></FormControl>{field.value && clearButton("description" as FieldPath<IpBatchFormValues>, "描述")}</div><FormMessage /></FormItem>)} />
            </div></ScrollArea>
            <SheetFooter className="p-6 pt-4 border-t"><SheetClose asChild><Button type="button" variant="outline">取消</Button></SheetClose><Button type="submit" disabled={isSubmitting}>{isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />处理中...</> : "创建IP地址"}</Button></SheetFooter>
        </form></Form>
      </SheetContent>
    </Sheet>
  );
}
