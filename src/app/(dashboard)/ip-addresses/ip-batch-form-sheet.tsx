
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, PlusCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Subnet, VLAN, IPAddressStatus, LocalDeviceDictionary, PaymentSourceDictionary, AccessTypeDictionary } from "@/types";
import { batchCreateIPAddressesAction, type BatchIpCreationResult, type ActionResponse } from "@/lib/actions";
import { ipToNumber } from "@/lib/ip-utils";

const NO_DIRECT_VLAN_SENTINEL = "__NO_DIRECT_VLAN_INTERNAL__";
const NO_SELECTION_SENTINEL = "__NO_SELECTION_INTERNAL__";
const ipAddressStatusOptions = ["allocated", "free", "reserved"] as const;
const ipAddressStatusLabels: Record<IPAddressStatus, string> = { allocated: "已分配", free: "空闲", reserved: "预留" };

const ipBatchFormSchema = z.object({
  startIp: z.string().ip({ version: "v4", message: "无效的起始 IPv4 地址" }),
  endIp: z.string().ip({ version: "v4", message: "无效的结束 IPv4 地址" }),
  subnetId: z.string().min(1, "子网是必需的"),
  directVlanId: z.string().optional(),
  status: z.enum(ipAddressStatusOptions, { required_error: "状态是必需的"}),
  commonDescription: z.string().max(200, "描述过长").optional(),
  commonIsGateway: z.boolean().optional(),
  commonUsageUnit: z.string().max(100, "使用单位过长").optional(),
  commonContactPerson: z.string().max(50, "联系人姓名过长").optional(),
  commonPhone: z.string().max(30, "电话号码过长").optional(),
  
  commonPeerUnitName: z.string().max(100, "通用对端单位名称过长").optional(),
  commonPeerDeviceName: z.string().optional(),
  commonPeerPortName: z.string().optional(), // Derived, read-only in UI

  commonSelectedAccessType: z.string().optional(), 
  commonSelectedLocalDeviceName: z.string().optional(),
  commonSelectedDevicePort: z.string().max(100, "设备端口过长").optional(), 
  commonSelectedPaymentSource: z.string().optional(),
}).refine(data => {
    try { return ipToNumber(data.startIp) <= ipToNumber(data.endIp); } catch (e) { return false; }
}, { message: "起始IP必须小于或等于结束IP。", path: ["endIp"] });

type IpBatchFormValues = z.infer<typeof ipBatchFormSchema>;

interface IPBatchFormSheetProps {
  subnets: Subnet[];
  vlans: VLAN[];
  localDeviceDictionaries: LocalDeviceDictionary[];
  paymentSourceDictionaries: PaymentSourceDictionary[];
  accessTypeDictionaries: AccessTypeDictionary[];
  children?: React.ReactNode;
  onIpAddressChange?: () => void;
}

export function IPBatchFormSheet({
    subnets, vlans, localDeviceDictionaries, paymentSourceDictionaries, accessTypeDictionaries,
    children, onIpAddressChange
}: IPBatchFormSheetProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [submissionResult, setSubmissionResult] = React.useState<BatchIpCreationResult | null>(null);
  const { toast } = useToast();

  const form = useForm<IpBatchFormValues>({
    resolver: zodResolver(ipBatchFormSchema),
    defaultValues: {
      startIp: "", endIp: "", subnetId: subnets.length > 0 ? subnets[0].id : "",
      directVlanId: NO_DIRECT_VLAN_SENTINEL, status: "free", commonDescription: "",
      commonIsGateway: false, commonUsageUnit: "", commonContactPerson: "", commonPhone: "",
      commonPeerUnitName: "", commonPeerDeviceName: NO_SELECTION_SENTINEL, commonPeerPortName: "",
      commonSelectedAccessType: NO_SELECTION_SENTINEL,
      commonSelectedLocalDeviceName: NO_SELECTION_SENTINEL, commonSelectedDevicePort: "", commonSelectedPaymentSource: NO_SELECTION_SENTINEL,
    },
  });

  React.useEffect(() => {
    if (isOpen) {
        form.reset({
            startIp: "", endIp: "", subnetId: subnets.length > 0 ? subnets[0].id : "",
            directVlanId: NO_DIRECT_VLAN_SENTINEL, status: "free", commonDescription: "",
            commonIsGateway: false, commonUsageUnit: "", commonContactPerson: "", commonPhone: "",
            commonPeerUnitName: "", commonPeerDeviceName: NO_SELECTION_SENTINEL, commonPeerPortName: "",
            commonSelectedAccessType: NO_SELECTION_SENTINEL,
            commonSelectedLocalDeviceName: NO_SELECTION_SENTINEL, commonSelectedDevicePort: "", commonSelectedPaymentSource: NO_SELECTION_SENTINEL,
        });
        setSubmissionResult(null); form.clearErrors();
    }
  }, [isOpen, subnets, form]);


  const handleCommonLocalDeviceChange = (value: string) => {
    form.setValue("commonSelectedLocalDeviceName", value === NO_SELECTION_SENTINEL ? "" : value);
    const selectedDev = localDeviceDictionaries.find(dev => dev.deviceName === value);
    form.setValue("commonSelectedDevicePort", selectedDev?.port || ""); 
  };

  const handleCommonPeerDeviceChange = (value: string) => {
    form.setValue("commonPeerDeviceName", value === NO_SELECTION_SENTINEL ? "" : value);
    const selectedDev = localDeviceDictionaries.find(dev => dev.deviceName === value);
    form.setValue("commonPeerPortName", selectedDev?.port || ""); 
  };

  async function onSubmit(data: IpBatchFormValues) {
    form.clearErrors(); setSubmissionResult(null);
    const directVlanIdToSubmit = data.directVlanId === NO_DIRECT_VLAN_SENTINEL ? undefined : data.directVlanId;
    const payload = {
        startIp: data.startIp, endIp: data.endIp, subnetId: data.subnetId,
        directVlanId: directVlanIdToSubmit, description: data.commonDescription || undefined,
        status: data.status, isGateway: data.commonIsGateway,
        usageUnit: data.commonUsageUnit || undefined, contactPerson: data.commonContactPerson || undefined, phone: data.commonPhone || undefined,
        
        peerUnitName: data.commonPeerUnitName || undefined,
        peerDeviceName: data.commonPeerDeviceName === NO_SELECTION_SENTINEL ? undefined : data.commonPeerDeviceName,
        peerPortName: data.commonPeerPortName || undefined,

        selectedAccessType: data.commonSelectedAccessType === NO_SELECTION_SENTINEL ? undefined : data.commonSelectedAccessType, 
        selectedLocalDeviceName: data.commonSelectedLocalDeviceName === NO_SELECTION_SENTINEL ? undefined : data.commonSelectedLocalDeviceName,
        selectedDevicePort: data.commonSelectedDevicePort || undefined, 
        selectedPaymentSource: data.commonSelectedPaymentSource === NO_SELECTION_SENTINEL ? undefined : data.commonSelectedPaymentSource,
    };
    const numToCreate = ipToNumber(data.endIp) - ipToNumber(data.startIp) + 1;
    if (numToCreate > 256) { toast({ title: "范围过大", description: "请分批创建IP地址 (例如，每次最多256个)。", variant: "destructive" }); return; }

    try {
      const result = await batchCreateIPAddressesAction(payload);
      setSubmissionResult(result);
      if (result.successCount > 0 && result.failureDetails.length === 0) { toast({ title: "批量创建成功", description: `${result.successCount} 个IP地址已成功创建。` }); if (onIpAddressChange) onIpAddressChange(); form.reset(); }
      else if (result.successCount > 0 && result.failureDetails.length > 0) { toast({ title: "批量处理部分成功", description: `${result.successCount} 个IP创建成功，${result.failureDetails.length} 个失败。详情请见下方。` }); if (onIpAddressChange) onIpAddressChange(); }
      else if (result.failureDetails.length > 0) { toast({ title: "批量创建失败", description: `所有 ${numToCreate} 个IP地址均创建失败。详情请见下方。`, variant: "destructive" }); }
      else { toast({ title: "无操作", description: "没有IP地址被创建或失败。", variant: "default" }); }
    } catch (error) {
      const actionError = (error as ActionResponse<any>)?.error;
      if (actionError) { toast({ title: "批量创建预处理错误", description: actionError.userMessage, variant: "destructive" }); if (actionError.field) form.setError(actionError.field as FieldPath<IpBatchFormValues>, { type: "server", message: actionError.userMessage }); }
      else { toast({ title: "客户端错误", description: error instanceof Error ? error.message : "批量创建过程中发生意外错误。", variant: "destructive" }); }
      setSubmissionResult({ successCount: 0, failureDetails: [{ ipAttempted: data.startIp, error: (error as Error).message || "未知错误" }] });
    }
  }

  const handleOpenChange = (open: boolean) => { setIsOpen(open); if (!open) { form.reset(); setSubmissionResult(null); } };
  const triggerContent = children || <Button variant="outline"><PlusCircle className="mr-2 h-4 w-4" /> 批量添加IP</Button>;

  const commonSelectedDevicePortValue = form.watch("commonSelectedDevicePort"); 
  const commonPeerPortNameValue = form.watch("commonPeerPortName");

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>{triggerContent}</SheetTrigger>
      <SheetContent className="sm:max-w-lg w-full flex flex-col p-0">
        <SheetHeader className="p-6 pb-4 border-b"><SheetTitle>批量添加IP地址 (范围)</SheetTitle><SheetDescription>输入起始和结束IP地址以创建范围。选择一个子网。其他字段是可选的或有默认值，将应用于范围内所有创建的IP。</SheetDescription></SheetHeader>
        <Form {...form}><form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-grow overflow-hidden">
            <ScrollArea className="flex-1 px-6 pt-4"><div className="space-y-4 pb-4">
                <FormField control={form.control} name="startIp" render={({ field }) => (<FormItem><FormLabel>起始IP地址</FormLabel><FormControl><Input placeholder="例如 192.168.1.10" {...field} /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="endIp" render={({ field }) => (<FormItem><FormLabel>结束IP地址</FormLabel><FormControl><Input placeholder="例如 192.168.1.20" {...field} /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="subnetId" render={({ field }) => (<FormItem><FormLabel>子网</FormLabel><Select onValueChange={field.onChange} value={field.value} disabled={subnets.length === 0}><FormControl><SelectTrigger><SelectValue placeholder={subnets.length > 0 ? "选择一个子网" : "无可用子网"} /></SelectTrigger></FormControl><SelectContent>{subnets.map((subnet) => (<SelectItem key={subnet.id} value={subnet.id}>{subnet.cidr} ({subnet.name || subnet.description || "无描述"})</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="directVlanId" render={({ field }) => (<FormItem><FormLabel>直接关联 VLAN (可选)</FormLabel><Select onValueChange={(value) => field.onChange(value)} value={field.value || NO_DIRECT_VLAN_SENTINEL} disabled={vlans.length === 0 && field.value !== NO_DIRECT_VLAN_SENTINEL}><FormControl><SelectTrigger><SelectValue placeholder={vlans.length > 0 ? "选择一个VLAN或无" : "无可用VLAN"} /></SelectTrigger></FormControl><SelectContent><SelectItem value={NO_DIRECT_VLAN_SENTINEL}>无直接VLAN</SelectItem>{vlans.map((vlan) => (<SelectItem key={vlan.id} value={vlan.id}>VLAN {vlan.vlanNumber} ({vlan.name || vlan.description || "无描述"})</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="status" render={({ field }) => (<FormItem><FormLabel>所有IP的状态</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="选择状态" /></SelectTrigger></FormControl><SelectContent>{ipAddressStatusOptions.map((status) => (<SelectItem key={status} value={status} className="capitalize">{ipAddressStatusLabels[status]}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="commonIsGateway" render={({ field }) => (<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm"><div className="space-y-0.5"><FormLabel>是否网关 </FormLabel><FormDescription>范围内所有创建的 IP 是否都标记为网关?</FormDescription></div><FormControl><Switch checked={field.value} onCheckedChange={field.onChange}/></FormControl><FormMessage /></FormItem>)} />
                
                <FormField control={form.control} name="commonUsageUnit" render={({ field }) => (<FormItem><FormLabel>使用单位 (可选)</FormLabel><FormControl><Input placeholder="例如 市场部" {...field} /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="commonContactPerson" render={({ field }) => (<FormItem><FormLabel>联系人 (可选)</FormLabel><FormControl><Input placeholder="例如 王经理" {...field} /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="commonPhone" render={({ field }) => (<FormItem><FormLabel>电话 (可选)</FormLabel><FormControl><Input placeholder="例如 010-12345678" {...field} /></FormControl><FormMessage /></FormItem>)} />

                <FormField control={form.control} name="commonPeerUnitName" render={({ field }) => (<FormItem><FormLabel>通用对端单位名称 (可选)</FormLabel><FormControl><Input placeholder="例如 客户A" {...field} /></FormControl><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="commonPeerDeviceName" render={({ field }) => (<FormItem><FormLabel>通用对端设备 (可选)</FormLabel><Select onValueChange={handleCommonPeerDeviceChange} value={field.value || NO_SELECTION_SENTINEL}><FormControl><SelectTrigger><SelectValue placeholder="选择对端设备" /></SelectTrigger></FormControl><SelectContent><SelectItem value={NO_SELECTION_SENTINEL}>-- 无 --</SelectItem>{localDeviceDictionaries.map(dev => (<SelectItem key={dev.id} value={dev.deviceName}>{dev.deviceName}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="commonPeerPortName" render={({ field }) => (<FormItem><FormLabel>通用对端端口 (自动)</FormLabel><FormControl><Input placeholder="根据对端设备自动填充" {...field} value={commonPeerPortNameValue || ""} readOnly disabled /></FormControl></FormItem>)} />
                
                <FormField 
                    control={form.control} 
                    name="commonSelectedAccessType" 
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

                <FormField control={form.control} name="commonSelectedLocalDeviceName" render={({ field }) => (<FormItem><FormLabel>本端设备 (可选)</FormLabel><Select onValueChange={handleCommonLocalDeviceChange} value={field.value || NO_SELECTION_SENTINEL}><FormControl><SelectTrigger><SelectValue placeholder="选择本端设备" /></SelectTrigger></FormControl><SelectContent><SelectItem value={NO_SELECTION_SENTINEL}>-- 无 --</SelectItem>{localDeviceDictionaries.map(dev => (<SelectItem key={dev.id} value={dev.deviceName}>{dev.deviceName}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="commonSelectedDevicePort" render={({ field }) => (<FormItem><FormLabel>本端设备端口 (自动)</FormLabel><FormControl><Input placeholder="根据本端设备自动填充" {...field} value={commonSelectedDevicePortValue || ""} readOnly disabled /></FormControl><FormMessage/></FormItem>)} />

                <FormField control={form.control} name="commonSelectedPaymentSource" render={({ field }) => (<FormItem><FormLabel>费用来源 (可选)</FormLabel><Select onValueChange={(value) => field.onChange(value === NO_SELECTION_SENTINEL ? "" : value)} value={field.value || NO_SELECTION_SENTINEL}><FormControl><SelectTrigger><SelectValue placeholder="选择费用来源" /></SelectTrigger></FormControl><SelectContent><SelectItem value={NO_SELECTION_SENTINEL}>-- 无 --</SelectItem>{paymentSourceDictionaries.map(ps => (<SelectItem key={ps.id} value={ps.sourceName}>{ps.sourceName}</SelectItem>))}</SelectContent></Select><FormMessage /></FormItem>)} />
                <FormField control={form.control} name="commonDescription" render={({ field }) => (<FormItem><FormLabel>描述 (可选)</FormLabel><FormControl><Input placeholder="例如 批量创建的设备" {...field} /></FormControl><FormMessage /></FormItem>)} />

                {submissionResult && (<div className="mt-6 space-y-3">
                    <h3 className="text-lg font-semibold border-b pb-2 mb-3">处理结果:</h3>
                    <Alert variant={submissionResult.failureDetails.length > 0 && submissionResult.successCount === 0 ? "destructive" : "default"}><AlertCircle className="h-4 w-4"/><AlertTitle>概要</AlertTitle><AlertDescription>成功创建: {submissionResult.successCount} 个IP。<br />失败尝试: {submissionResult.failureDetails.length} 个。</AlertDescription></Alert>
                    {submissionResult.failureDetails.length > 0 && (<div className="border border-dashed border-destructive p-3 mt-3 rounded-md">
                        <h4 className="font-medium text-destructive mb-2">失败详情 (共 {submissionResult.failureDetails.length} 条):</h4>
                        <ScrollArea className="h-[120px] mt-1 rounded-md border bg-destructive/5 p-2"><ul className="space-y-1 text-sm">{submissionResult.failureDetails.map((failure, index) => (<li key={index} className="text-destructive font-medium">IP {failure.ipAttempted}: {failure.error || "错误信息未提供"}</li>))}{submissionResult.failureDetails.length === 0 && (<li>无失败详情记录。</li>)}</ul></ScrollArea>
                    </div>)}
                </div>)}
            </div></ScrollArea>
            <SheetFooter className="p-6 pt-4 border-t"><SheetClose asChild><Button type="button" variant="outline">取消</Button></SheetClose><Button type="submit" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? "处理中..." : "创建IP地址"}</Button></SheetFooter>
        </form></Form>
      </SheetContent>
    </Sheet>
  );
}
