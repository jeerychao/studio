
"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type FieldPath } from "react-hook-form";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { GitBranch, Loader2, AlertCircle, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { VLAN, Subnet as AppSubnetType } from "@/types";
import { batchDivideAndCreateSubnetsAction, type ActionResponse } from "@/lib/actions";
import { getSubnetPropertiesFromCidr, getPrefixFromRequiredHosts, generateSubnetsFromParent, calculateNetworkAddress } from "@/lib/ip-utils";
import type { SubnetProperties } from "@/lib/ip-utils";

const NO_VLAN_SENTINEL_VALUE = "__NO_VLAN_INTERNAL__";

const parentMaskBitOptions = [
  { value: 8, label: "/8 (255.0.0.0)" },
  { value: 12, label: "/12 (255.240.0.0)" },
  { value: 16, label: "/16 (255.255.0.0)" },
  { value: 20, label: "/20 (255.255.240.0)" },
  { value: 21, label: "/21 (255.255.248.0)" },
  { value: 22, label: "/22 (255.255.252.0)" },
  { value: 23, label: "/23 (255.255.254.0)" },
  { value: 24, label: "/24 (255.255.255.0)" },
  { value: 25, label: "/25 (255.255.255.128)" },
  { value: 26, label: "/26 (255.255.255.192)" },
  { value: 27, label: "/27 (255.255.255.224)" },
  { value: 28, label: "/28 (255.255.255.240)" },
  { value: 29, label: "/29 (255.255.255.248)" },
  { value: 30, label: "/30 (255.255.255.252)" },
];


const subnetDivisionFormSchema = z.object({
  parentIpAddress: z.string().ip({ version: "v4", message: "父网络 IP 地址无效" }),
  parentMaskBits: z.coerce.number().int().min(1).max(30, "父网络掩码位数必须在1-30之间"), // Max 30 for practical division
  requiredHostsPerSubnet: z.coerce.number().int().min(1, "每个新子网至少需要1个可用主机。").max(65534),
  numberOfSubnets: z.coerce.number().int().min(1, "至少需要创建1个子网").optional(),
  vlanId: z.string().optional(),
  commonDescription: z.string().max(150, "通用描述过长").optional(),
}).refine(data => {
    // Validate that the entered parentIpAddress is actually a network address for the chosen parentMaskBits
    try {
        const calculatedNetworkAddr = calculateNetworkAddress(data.parentIpAddress, data.parentMaskBits);
        return data.parentIpAddress === calculatedNetworkAddr;
    } catch (e) {
        return false; // Invalid IP or mask for calculation
    }
}, {
    message: "提供的父网络 IP 地址不是所选掩码位数的有效网络地址。",
    path: ["parentIpAddress"],
});


type SubnetDivisionFormValues = z.infer<typeof subnetDivisionFormSchema>;

interface SubnetDivisionFormSheetProps {
  vlans: VLAN[];
  children?: React.ReactNode;
  onSubnetChange?: () => void;
}

export function SubnetSmartBatchFormSheet({ vlans, children, onSubnetChange }: SubnetDivisionFormSheetProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const { toast } = useToast();
  const [previewSubnets, setPreviewSubnets] = React.useState<SubnetProperties[]>([]);
  const [maxCreatableSubnets, setMaxCreatableSubnets] = React.useState<number | null>(null);
  const [calculatedNewSubnetPrefix, setCalculatedNewSubnetPrefix] = React.useState<number | null>(null);
  const [previewError, setPreviewError] = React.useState<string | null>(null);
  const [isCalculatingPreview, setIsCalculatingPreview] = React.useState(false);
  const [submissionResult, setSubmissionResult] = React.useState<{success: boolean, message: string, errors?: string[]} | null>(null);


  const form = useForm<SubnetDivisionFormValues>({
    resolver: zodResolver(subnetDivisionFormSchema),
    defaultValues: {
      parentIpAddress: "",
      parentMaskBits: 24, // Default parent mask
      requiredHostsPerSubnet: undefined,
      numberOfSubnets: undefined,
      vlanId: NO_VLAN_SENTINEL_VALUE,
      commonDescription: "",
    },
  });

  const { watch, trigger, getValues } = form;
  const parentIpAddress = watch("parentIpAddress");
  const parentMaskBits = watch("parentMaskBits");
  const requiredHosts = watch("requiredHostsPerSubnet");
  const numberOfSubnetsToCreate = watch("numberOfSubnets");

  const handlePreview = React.useCallback(async () => {
    const isValidForm = await trigger(); // Validate all fields
    if (!isValidForm) {
      setPreviewSubnets([]);
      setMaxCreatableSubnets(null);
      setCalculatedNewSubnetPrefix(null);
      setPreviewError("请修正表单中的错误。");
      toast({ title: "表单验证失败", description: "请检查输入字段。", variant: "destructive" });
      return;
    }
    setIsCalculatingPreview(true);
    setPreviewError(null);
    setPreviewSubnets([]);
    setMaxCreatableSubnets(null);
    setCalculatedNewSubnetPrefix(null);

    try {
      const values = getValues();
      const constructedParentCidr = `${values.parentIpAddress}/${values.parentMaskBits}`;

      // Validate constructed parent CIDR (though schema refine should catch IP being network address)
      const parentPropsTest = getSubnetPropertiesFromCidr(constructedParentCidr);
      if (!parentPropsTest) {
          setPreviewError("父网络 IP 地址和掩码位数组合无效。");
          setIsCalculatingPreview(false);
          return;
      }
      if (parentPropsTest.networkAddress !== values.parentIpAddress) {
          setPreviewError(`提供的 IP ${values.parentIpAddress} 不是 /${values.parentMaskBits} 的网络地址。应为: ${parentPropsTest.networkAddress}`);
          setIsCalculatingPreview(false);
          return;
      }

      const newSubnetPrefix = getPrefixFromRequiredHosts(values.requiredHostsPerSubnet);
      setCalculatedNewSubnetPrefix(newSubnetPrefix);

      if (newSubnetPrefix <= values.parentMaskBits) {
        setPreviewError(`根据所需主机数计算出的新子网前缀 /${newSubnetPrefix} 必须大于父网络前缀 /${values.parentMaskBits}。请减少所需主机数或增大父网络。`);
        setIsCalculatingPreview(false);
        return;
      }
      
      const result = generateSubnetsFromParent(constructedParentCidr, newSubnetPrefix, values.numberOfSubnets);

      if ("error" in result) {
        setPreviewError(result.error);
        setPreviewSubnets([]);
        setMaxCreatableSubnets(0);
      } else {
        setPreviewSubnets(result.generatedSubnets);
        setMaxCreatableSubnets(result.maxPossible);
        if (result.generatedSubnets.length === 0 && values.numberOfSubnets && values.numberOfSubnets > 0) {
            setPreviewError("无法根据指定数量生成子网，可能超出父网络容量或计算出的前缀不适用。");
        } else if (result.generatedSubnets.length === 0) {
            setPreviewError("无法生成任何子网。请检查输入。");
        }
      }
    } catch (e) {
      setPreviewError((e as Error).message || "预览计算时发生未知错误。");
    } finally {
      setIsCalculatingPreview(false);
    }
  }, [trigger, getValues]);


  async function onSubmit(data: SubnetDivisionFormValues) {
    if (previewSubnets.length === 0 || !calculatedNewSubnetPrefix) {
      toast({ title: "无子网可创建", description: "请先正确生成并预览要创建的子网。", variant: "destructive" });
      return;
    }

    const parentCidrForSubmission = `${data.parentIpAddress}/${data.parentMaskBits}`;
    // Validate parentCidrForSubmission again briefly
    const parentProps = getSubnetPropertiesFromCidr(parentCidrForSubmission);
    if (!parentProps || parentProps.networkAddress !== data.parentIpAddress) {
        toast({ title: "父网络错误", description: "父网络IP或掩码无效，无法提交。", variant: "destructive"});
        return;
    }

    let finalCalculatedPrefix: number;
    try {
        finalCalculatedPrefix = getPrefixFromRequiredHosts(data.requiredHostsPerSubnet);
    } catch (e) {
        toast({ title: "主机数错误", description: (e as Error).message, variant: "destructive"});
        return;
    }

    if (finalCalculatedPrefix !== calculatedNewSubnetPrefix) {
        toast({ title: "配置已更改", description: "表单数据与预览时不同，请重新预览。", variant: "destructive" });
        return;
    }
    if (finalCalculatedPrefix <= data.parentMaskBits) {
        toast({ title: "前缀错误", description: `计算出的新子网前缀 /${finalCalculatedPrefix} 无效或不小于父网络前缀 /${data.parentMaskBits}。`, variant: "destructive"});
        return;
    }
    
    const submissionPreviewResult = generateSubnetsFromParent(parentCidrForSubmission, finalCalculatedPrefix, data.numberOfSubnets);
    if ("error" in submissionPreviewResult || submissionPreviewResult.generatedSubnets.length === 0) {
        toast({ title: "预览不一致", description: "提交前重新计算预览失败，请重试预览步骤。", variant: "destructive" });
        setPreviewError(submissionPreviewResult.error || "提交前无法生成子网。");
        setPreviewSubnets([]);
        return;
    }

    setSubmissionResult(null);

    const subnetsToCreate = submissionPreviewResult.generatedSubnets.map(subnetProps => ({
      cidr: `${subnetProps.networkAddress}/${subnetProps.prefix}`,
      vlanId: data.vlanId === NO_VLAN_SENTINEL_VALUE ? undefined : data.vlanId,
      description: data.commonDescription ? `${data.commonDescription} (分割自 ${parentCidrForSubmission})` : `分割自 ${parentCidrForSubmission}`,
    }));

    try {
      const response = await batchDivideAndCreateSubnetsAction({
        parentCidr: parentCidrForSubmission,
        subnetsToCreate,
      });

      if (response.success) {
        toast({
          title: "批量创建成功",
          description: `${response.data?.createdCount || 0} 个子网已成功创建。`,
        });
        setIsOpen(false);
        form.reset();
        setPreviewSubnets([]);
        setMaxCreatableSubnets(null);
        setCalculatedNewSubnetPrefix(null);
        if (onSubnetChange) onSubnetChange();
      } else {
        setSubmissionResult({ success: false, message: response.error?.userMessage || "批量创建失败。", errors: response.error?.details?.split(';') });
        toast({
          title: "批量创建失败",
          description: response.error?.userMessage || "一个或多个子网创建失败。",
          variant: "destructive",
        });
      }
    } catch (error) {
      setSubmissionResult({ success: false, message: (error as Error).message || "提交时发生意外错误。" });
      toast({
        title: "客户端错误",
        description: (error as Error).message || "提交时发生意外错误。",
        variant: "destructive",
      });
    }
  }
  
  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
        form.reset();
        setPreviewSubnets([]);
        setMaxCreatableSubnets(null);
        setCalculatedNewSubnetPrefix(null);
        setPreviewError(null);
        setSubmissionResult(null);
    }
  };

  const triggerContent = children || (
    <Button variant="outline">
      <GitBranch className="mr-2 h-4 w-4" /> 划分子网
    </Button>
  );

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>{triggerContent}</SheetTrigger>
      <SheetContent className="sm:max-w-2xl w-full flex flex-col p-0">
        <SheetHeader className="p-6 pb-4 border-b">
          <SheetTitle>批量划分子网</SheetTitle>
          <SheetDescription>
            从一个较大的父网络中划分出多个较小的新子网。
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-grow overflow-hidden">
            <ScrollArea className="flex-1 px-6 pt-4">
              <div className="space-y-4 pb-4">
                <FormField
                  control={form.control}
                  name="parentIpAddress"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>父网络 IP 地址</FormLabel>
                      <FormControl>
                        <Input placeholder="例如 192.168.0.0" {...field} />
                      </FormControl>
                      <FormDescription>您想要从中划分子网的父网络的网络地址。</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="parentMaskBits"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>父网络掩码位数</FormLabel>
                      <Select onValueChange={(value) => field.onChange(parseInt(value, 10))} value={String(field.value)}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="选择父网络的掩码位数" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {parentMaskBitOptions.map((option) => (
                            <SelectItem key={option.value} value={String(option.value)}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                       <FormDescription>父网络的子网掩码长度。</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="requiredHostsPerSubnet"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>每个新子网的期望可用主机数</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="例如 30 (程序将计算最佳掩码)" {...field} onChange={e => field.onChange(parseInt(e.target.value,10) || undefined)} />
                      </FormControl>
                      <FormDescription>输入您希望每个新划分出的子网能容纳的可用主机数量（已除去网络和广播地址）。</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="numberOfSubnets"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>要创建的子网数量 (可选)</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="例如 4 或留空以创建最大数量" {...field} onChange={e => field.onChange(parseInt(e.target.value,10) || undefined)} />
                      </FormControl>
                      <FormDescription>如果留空，将尝试创建最大可能数量的子网。</FormDescription>
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
                        onValueChange={(value) => field.onChange(value === NO_VLAN_SENTINEL_VALUE ? "" : value)}
                        value={field.value || NO_VLAN_SENTINEL_VALUE}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="为新子网选择 VLAN 或留空" />
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
                  name="commonDescription"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>通用描述 (可选)</FormLabel>
                      <FormControl>
                        <Textarea placeholder="为所有新创建的子网添加通用描述前缀" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="button" variant="outline" onClick={handlePreview} disabled={isCalculatingPreview} className="w-full">
                  {isCalculatingPreview && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  预览子网划分
                </Button>

                {previewError && (
                  <Alert variant="destructive" className="mt-4">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>预览错误</AlertTitle>
                    <AlertDescription>{previewError}</AlertDescription>
                  </Alert>
                )}
                
                {calculatedNewSubnetPrefix !== null && !previewError && (
                  <Alert variant="info" className="mt-4">
                    <Info className="h-4 w-4" />
                    <AlertTitle>计算提示</AlertTitle>
                    <AlertDescription>
                      根据您要求的 {getValues("requiredHostsPerSubnet")} 个可用主机，将使用 <strong>/{calculatedNewSubnetPrefix}</strong> 的前缀长度进行划分。
                      {maxCreatableSubnets !== null && ` 最多可以创建 ${maxCreatableSubnets} 个这样的子网。`}
                      {numberOfSubnetsToCreate && maxCreatableSubnets !== null && numberOfSubnetsToCreate > maxCreatableSubnets && <span className="text-destructive"> (您请求的数量超出了最大值)</span>}
                    </AlertDescription>
                  </Alert>
                )}

                {previewSubnets.length > 0 && (
                  <div className="mt-6 space-y-2">
                    <h3 className="text-lg font-semibold">预览的子网 ({previewSubnets.length} 个):</h3>
                    <ScrollArea className="h-[200px] border rounded-md">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>新 CIDR</TableHead>
                            <TableHead>网络地址</TableHead>
                            <TableHead>广播地址</TableHead>
                            <TableHead>可用 IP 范围</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {previewSubnets.map((subnet, index) => (
                            <TableRow key={index}>
                              <TableCell>{subnet.networkAddress}/{subnet.prefix}</TableCell>
                              <TableCell>{subnet.networkAddress}</TableCell>
                              <TableCell>{subnet.broadcastAddress}</TableCell>
                              <TableCell>{subnet.ipRange || "N/A"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </div>
                )}
                
                {submissionResult && !submissionResult.success && (
                  <Alert variant="destructive" className="mt-4">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>创建失败</AlertTitle>
                    <AlertDescription>
                      {submissionResult.message}
                      {submissionResult.errors && submissionResult.errors.length > 0 && (
                        <ul className="list-disc pl-5 mt-2">
                          {submissionResult.errors.map((err, i) => <li key={i}>{err}</li>)}
                        </ul>
                      )}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </ScrollArea>

            <SheetFooter className="p-6 pt-4 border-t">
              <SheetClose asChild>
                <Button type="button" variant="outline">取消</Button>
              </SheetClose>
              <Button type="submit" disabled={form.formState.isSubmitting || previewSubnets.length === 0 || isCalculatingPreview || !calculatedNewSubnetPrefix}>
                {form.formState.isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                创建 {previewSubnets.length > 0 ? `${previewSubnets.length} 个` : ''} 子网
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
