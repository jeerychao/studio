
"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, PlusCircle } from "lucide-react"; 
import { useToast } from "@/hooks/use-toast";
import type { Subnet, VLAN, IPAddressStatus } from "@/types";
import { batchCreateIPAddressesAction, type BatchIpCreationResult } from "@/lib/actions";
import { ipToNumber } from "@/lib/ip-utils"; 

const INHERIT_VLAN_SENTINEL = "__INHERIT_VLAN_INTERNAL__";
const ipAddressStatusOptions: IPAddressStatus[] = ["allocated", "free", "reserved"];
const ipAddressStatusLabels: Record<IPAddressStatus, string> = {
  allocated: "已分配",
  free: "空闲",
  reserved: "预留",
};


const ipBatchFormSchema = z.object({
  startIp: z.string().ip({ version: "v4", message: "无效的起始 IPv4 地址" }),
  endIp: z.string().ip({ version: "v4", message: "无效的结束 IPv4 地址" }),
  subnetId: z.string().min(1, "子网是必需的"),
  vlanId: z.string().optional(), 
  commonDescription: z.string().max(200, "描述过长").optional(),
  status: z.enum(ipAddressStatusOptions, { required_error: "状态是必需的"}),
}).refine(data => {
    try {
        return ipToNumber(data.startIp) <= ipToNumber(data.endIp);
    } catch (e) {
        return false; 
    }
}, {
  message: "起始IP必须小于或等于结束IP。",
  path: ["endIp"],
});

type IpBatchFormValues = z.infer<typeof ipBatchFormSchema>;

interface IPBatchFormSheetProps {
  subnets: Subnet[];
  vlans: VLAN[];
  children?: React.ReactNode; 
  onIpAddressChange?: () => void;
}

export function IPBatchFormSheet({ subnets, vlans, children, onIpAddressChange }: IPBatchFormSheetProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [submissionResult, setSubmissionResult] = React.useState<BatchIpCreationResult | null>(null);
  const { toast } = useToast();

  const form = useForm<IpBatchFormValues>({
    resolver: zodResolver(ipBatchFormSchema),
    defaultValues: {
      startIp: "",
      endIp: "",
      subnetId: subnets.length > 0 ? subnets[0].id : "",
      vlanId: INHERIT_VLAN_SENTINEL,
      commonDescription: "",
      status: "free",
    },
  });
  
  React.useEffect(() => {
    if (isOpen) {
        form.reset({
            startIp: "",
            endIp: "",
            subnetId: subnets.length > 0 ? subnets[0].id : "",
            vlanId: INHERIT_VLAN_SENTINEL,
            commonDescription: "",
            status: "free",
        });
        setSubmissionResult(null);
    }
  }, [isOpen, subnets, form]);


  async function onSubmit(data: IpBatchFormValues) {
    setSubmissionResult(null);

    const vlanIdToSubmit = data.vlanId === INHERIT_VLAN_SENTINEL ? undefined : data.vlanId;

    const payload = {
        startIp: data.startIp,
        endIp: data.endIp,
        subnetId: data.subnetId,
        vlanId: vlanIdToSubmit,
        description: data.commonDescription || undefined,
        status: data.status,
    };
    
    const startNum = ipToNumber(data.startIp);
    const endNum = ipToNumber(data.endIp);
    if (endNum - startNum + 1 > 256) { 
        toast({ title: "范围过大", description: "请分批创建IP地址 (例如，每次最多256个)。", variant: "destructive" });
        return;
    }


    try {
      const result = await batchCreateIPAddressesAction(payload);
      setSubmissionResult(result);

      if (result.successCount > 0) {
        toast({
          title: "批量处理完成",
          description: `${result.successCount} 个IP创建成功。${result.failureDetails.length > 0 ? `${result.failureDetails.length} 个失败。` : ''}`,
        });
        if (onIpAddressChange) onIpAddressChange();
      } else if (result.failureDetails.length > 0) {
         toast({
          title: "批量创建失败",
          description: "所有条目均失败。请检查下面的详细信息。",
          variant: "destructive",
        });
      }
      
      if (result.failureDetails.length === 0 && result.successCount > 0) {
         form.reset(); 
      }

    } catch (error) {
      toast({
        title: "错误",
        description: error instanceof Error ? error.message : "批量创建过程中发生意外错误。",
        variant: "destructive",
      });
      setSubmissionResult({ successCount: 0, failureDetails: [{ ipAttempted: data.startIp, error: (error as Error).message }] });
    }
  }
  
  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
        form.reset();
        setSubmissionResult(null);
    }
  };

  const triggerContent = children || (
    <Button variant="outline">
      <PlusCircle className="mr-2 h-4 w-4" /> 批量添加IP
    </Button>
  );

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>{triggerContent}</SheetTrigger>
      <SheetContent className="sm:max-w-lg w-full flex flex-col p-0"> {/* Removed default p-6 to manage padding internally */}
        <SheetHeader className="p-6 pb-4 border-b"> {/* Added padding to header */}
          <SheetTitle>批量添加IP地址 (范围)</SheetTitle>
          <SheetDescription>
            输入起始和结束IP地址以创建范围。选择一个子网。
            其他字段是可选的或有默认值。
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form 
            onSubmit={form.handleSubmit(onSubmit)} 
            className="flex flex-col flex-grow overflow-hidden" /* Form takes remaining space and allows internal scrolling */
          >
            <ScrollArea className="flex-1 px-6 pt-4"> {/* Scrollable area for form fields and results */}
              <div className="space-y-4 pb-4"> {/* Inner div for spacing, pb-4 for space before footer */}
                <FormField
                  control={form.control}
                  name="startIp"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>起始IP地址</FormLabel>
                      <FormControl>
                        <Input placeholder="例如 192.168.1.10" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="endIp"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>结束IP地址</FormLabel>
                      <FormControl>
                        <Input placeholder="例如 192.168.1.20" {...field} />
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
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={subnets.length === 0}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={subnets.length > 0 ? "选择一个子网" : "无可用子网"} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
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
                        onValueChange={(value) => field.onChange(value)}
                        value={field.value || INHERIT_VLAN_SENTINEL}
                        disabled={vlans.length === 0 && field.value !== INHERIT_VLAN_SENTINEL}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={vlans.length > 0 ? "选择一个VLAN或继承" : "无可用VLAN"} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={INHERIT_VLAN_SENTINEL}>从子网继承</SelectItem>
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
                      <FormLabel>所有IP的状态</FormLabel>
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
                  name="commonDescription"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>通用描述 (可选)</FormLabel>
                      <FormControl>
                        <Input placeholder="例如 批量创建的设备" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {submissionResult && (
                  <div className="mt-4 space-y-3">
                    <h3 className="font-semibold">处理结果:</h3>
                    <Alert variant={submissionResult.failureDetails.length > 0 ? "destructive" : "default"}>
                       <AlertCircle className="h-4 w-4"/>
                      <AlertTitle>概要</AlertTitle>
                      <AlertDescription>
                        成功创建: {submissionResult.successCount} 个IP。
                        <br />
                        失败尝试: {submissionResult.failureDetails.length} 个。
                      </AlertDescription>
                    </Alert>

                    {submissionResult.failureDetails.length > 0 && (
                      <div>
                        <h4 className="font-medium">失败详情:</h4>
                        <ScrollArea className="h-[120px] mt-1 rounded-md border p-2">
                          <ul className="space-y-1 text-sm">
                            {submissionResult.failureDetails.map((failure, index) => (
                              <li key={index} className="text-destructive">
                                IP {failure.ipAttempted}: {failure.error}
                              </li>
                            ))}
                          </ul>
                        </ScrollArea>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </ScrollArea>

            <SheetFooter className="p-6 pt-4 border-t"> {/* Added padding to footer, ensure it's sticky at bottom */}
              <SheetClose asChild>
                <Button type="button" variant="outline">
                  取消
                </Button>
              </SheetClose>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "处理中..." : "创建IP地址"}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
