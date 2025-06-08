
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PlusCircle, Lightbulb, Loader2, AlertCircle, CheckCircle2, Eye } from "lucide-react"; // Changed Brain to PlusCircle
import { useToast } from "@/hooks/use-toast";
import type { VLAN } from "@/types";
import { smartBatchCreateSubnetsAction, type SmartBatchCreateSubnetsPayload, type SubnetCandidatePreview, type ActionResponse } from "@/lib/actions";
import { logger } from "@/lib/logger";
import { getSubnetPropertiesFromCidr, calculatePrefixLengthFromRequiredHosts, getUsableIpCount } from "@/lib/ip-utils"; // Import necessary utils
import { ValidationError } from "@/lib/errors"; // Import ValidationError for type checking

const NO_VLAN_SENTINEL_VALUE = "__NO_VLAN_INTERNAL__";

const smartBatchSubnetFormSchema = z.object({
  supernetCidr: z.string().min(7, "父网段CIDR表示法太短 (例如 x.x.x.x/y)"),
  numberOfSubnets: z.coerce.number().int().min(1, "子网数量必须至少为1。"),
  minIpsPerSubnet: z.coerce.number().int().min(1, "每个子网最少IP数必须大于0。"),
  commonDescription: z.string().max(200, "通用描述过长。").optional(),
  vlanId: z.string().optional(),
});

type SmartBatchSubnetFormValues = z.infer<typeof smartBatchSubnetFormSchema>;

interface SubnetSmartBatchFormSheetProps {
  vlans: VLAN[];
  children?: React.ReactNode;
  buttonProps?: ButtonProps;
  onSubnetChange?: () => void;
}

export function SubnetSmartBatchFormSheet({
  vlans,
  children,
  buttonProps,
  onSubnetChange,
}: SubnetSmartBatchFormSheetProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const { toast } = useToast();
  const [isPreviewing, setIsPreviewing] = React.useState(false);
  const [isCreating, setIsCreating] = React.useState(false);
  const [previewResults, setPreviewResults] = React.useState<SubnetCandidatePreview[] | null>(null);
  const [previewError, setPreviewError] = React.useState<string | null>(null);
  const [creationResult, setCreationResult] = React.useState<{createdCount: number, errors: any[] } | null>(null);
  const [maxSubnetsHint, setMaxSubnetsHint] = React.useState<string | null>(null);


  const form = useForm<SmartBatchSubnetFormValues>({
    resolver: zodResolver(smartBatchSubnetFormSchema),
    defaultValues: {
      supernetCidr: "",
      numberOfSubnets: 1,
      minIpsPerSubnet: 1,
      commonDescription: "",
      vlanId: "",
    },
  });

  React.useEffect(() => {
    if (isOpen) {
      form.reset();
      setPreviewResults(null);
      setPreviewError(null);
      setIsPreviewing(false);
      setIsCreating(false);
      setCreationResult(null);
      setMaxSubnetsHint(null);
    }
  }, [isOpen, form]);

  React.useEffect(() => {
    const supernetCidrValue = form.watch('supernetCidr');
    const minIpsValue = form.watch('minIpsPerSubnet');
  
    if (supernetCidrValue && minIpsValue > 0) {
      try {
        // Basic CIDR format check before calling getSubnetPropertiesFromCidr
        const cidrRegex = /^(\d{1,3}\.){3}\d{1,3}\/(\d{1,2})$/;
        if (!cidrRegex.test(supernetCidrValue)) {
          setMaxSubnetsHint("父网段 CIDR 格式无效。");
          return;
        }
        const supernetProps = getSubnetPropertiesFromCidr(supernetCidrValue);
        if (!supernetProps) {
          setMaxSubnetsHint("父网段 CIDR 格式无效。");
          return;
        }
  
        const childPrefix = calculatePrefixLengthFromRequiredHosts(minIpsValue);
        if (childPrefix <= supernetProps.prefix) {
          setMaxSubnetsHint(`所需 IP 数 (${minIpsValue.toLocaleString()}) 过多，无法从父网段 /${supernetProps.prefix} 中划分出更小的子网。`);
          return;
        }
        if (childPrefix > 32 || childPrefix < 0){
           setMaxSubnetsHint(`根据所需 IP 数 (${minIpsValue.toLocaleString()}) 计算出的子网掩码 /${childPrefix} 无效。`);
           return;
        }
  
        const maxPossibleChildren = Math.pow(2, childPrefix - supernetProps.prefix);
        if (maxPossibleChildren === Infinity || isNaN(maxPossibleChildren) || maxPossibleChildren > Number.MAX_SAFE_INTEGER) {
          setMaxSubnetsHint("无法计算最大子网数量，可能父网段过大或子网过小。");
          return;
        }
        setMaxSubnetsHint(`提示：此父网段最多可划分为 ${maxPossibleChildren.toLocaleString()} 个 /${childPrefix} 的子网。`);
  
      } catch (e) { 
        if (e instanceof ValidationError) {
          setMaxSubnetsHint(e.userMessage || "计算子网参数时出错。");
        } else if (e instanceof Error && e.message.includes("Invalid prefix length")) {
          setMaxSubnetsHint("父网段 CIDR 或计算的子网前缀无效。");
        }
        else {
          setMaxSubnetsHint("计算最大子网数时发生未知错误。");
          logger.warn("Error calculating max subnets hint", e);
        }
      }
    } else {
      setMaxSubnetsHint(null); 
    }
  }, [form.watch('supernetCidr'), form.watch('minIpsPerSubnet'), form]);


  const handlePreview = async (values: SmartBatchSubnetFormValues) => {
    setIsPreviewing(true);
    setPreviewResults(null);
    setPreviewError(null);
    setCreationResult(null);
    form.clearErrors();

    const payload: SmartBatchCreateSubnetsPayload = {
      supernetCidr: values.supernetCidr,
      numberOfSubnets: values.numberOfSubnets,
      minIpsPerSubnet: values.minIpsPerSubnet,
      commonDescription: values.commonDescription || undefined,
      vlanId: values.vlanId === NO_VLAN_SENTINEL_VALUE ? undefined : values.vlanId,
    };

    try {
      const response = await smartBatchCreateSubnetsAction(payload, 'preview');
      if (response.success && response.data?.preview) {
        setPreviewResults(response.data.preview);
        if (response.data.preview.every(p => p.status === 'ok')) {
            toast({ title: "预览成功", description: "所有候选子网均有效且无重叠。" });
        } else if (response.data.preview.some(p => p.status === 'overlap')) {
            toast({ title: "预览完成，存在重叠", description: "部分候选子网与现有子网重叠。", variant: "default" });
        } else if (response.data.preview.some(p => p.status === 'error')) {
            toast({ title: "预览完成，存在错误", description: "部分候选子网生成时出错，请检查父网段或参数。", variant: "destructive" });
        }
      } else if (response.error) {
        setPreviewError(response.error.userMessage);
        toast({ title: "预览失败", description: response.error.userMessage, variant: "destructive" });
        if (response.error.field) {
            form.setError(response.error.field as FieldPath<SmartBatchSubnetFormValues>, { type: "server", message: response.error.userMessage });
        }
      }
    } catch (error) {
      const err = error as Error;
      setPreviewError("预览时发生意外错误：" + err.message);
      toast({ title: "预览客户端错误", description: err.message, variant: "destructive" });
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleCreateSubnets = async () => {
    if (!previewResults || previewResults.some(p => p.status !== 'ok')) {
      toast({ title: "无法创建", description: "预览结果包含错误或重叠项，或者没有预览结果。", variant: "destructive" });
      return;
    }
    setIsCreating(true);
    setCreationResult(null);
    
    const formValues = form.getValues();
    const payload: SmartBatchCreateSubnetsPayload = {
        supernetCidr: formValues.supernetCidr,
        numberOfSubnets: formValues.numberOfSubnets, 
        minIpsPerSubnet: formValues.minIpsPerSubnet,
        commonDescription: formValues.commonDescription || undefined,
        vlanId: formValues.vlanId === NO_VLAN_SENTINEL_VALUE ? undefined : formValues.vlanId,
    };
    
    try {
        const response = await smartBatchCreateSubnetsAction(payload, 'create');
        if (response.success && response.data?.createdSubnets) {
            toast({ title: "批量创建成功", description: `${response.data.createdSubnets.length} 个子网已创建。`});
            setCreationResult({ createdCount: response.data.createdSubnets.length, errors: response.data.errors || [] });
            if (onSubnetChange) onSubnetChange();
            // setIsOpen(false); // Optionally close sheet on full success
        } else if (response.error) {
            toast({ title: "创建失败", description: response.error.userMessage, variant: "destructive" });
            setCreationResult({ createdCount: 0, errors: [response.error] });
        } else {
            toast({ title: "创建操作无明确结果", description: "服务器未返回预期的创建数据。", variant: "destructive"});
        }
    } catch (error) {
        const err = error as Error;
        toast({ title: "创建客户端错误", description: err.message, variant: "destructive" });
        setCreationResult({ createdCount: 0, errors: [{ userMessage: err.message }] });
    } finally {
        setIsCreating(false);
    }
  };

  const trigger = children ? (
    React.cloneElement(children as React.ReactElement, { onClick: () => setIsOpen(true) })
  ) : (
    <Button variant="outline" onClick={() => setIsOpen(true)} {...buttonProps}>
      <PlusCircle className="mr-2 h-4 w-4" /> 批量添加子网
    </Button>
  );
  
  const canConfirmCreation = previewResults && previewResults.length > 0 && previewResults.every(p => p.status === 'ok');

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="sm:max-w-2xl w-full flex flex-col p-0">
        <SheetHeader className="p-6 pb-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            <PlusCircle className="h-6 w-6 text-primary" />
            批量添加子网
          </SheetTitle>
          <SheetDescription>
            输入父网段、期望的子网数量以及每个子网大致需要的IP数量。系统将尝试为您规划子网。
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handlePreview)} className="flex-1 flex flex-col overflow-hidden">
            <ScrollArea className="flex-1 px-6 pt-6 pb-2">
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="supernetCidr"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>父网段 CIDR</FormLabel>
                      <FormControl>
                        <Input placeholder="例如 10.0.0.0/16" {...field} />
                      </FormControl>
                      <FormDescription>您希望从中划分新子网的现有大块网络。</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                    control={form.control}
                    name="numberOfSubnets"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>期望子网数量</FormLabel>
                        <FormControl>
                            <Input type="number" placeholder="例如 4" {...field} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                    <FormField
                    control={form.control}
                    name="minIpsPerSubnet"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>每子网最少可用IP数</FormLabel>
                        <FormControl>
                            <Input type="number" placeholder="例如 60" {...field} />
                        </FormControl>
                        <FormDescription>系统将计算最接近的掩码。</FormDescription>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                </div>
                {maxSubnetsHint && (
                  <FormDescription className="text-sm text-primary mt-1 bg-primary/10 p-2 rounded-md">
                    <Lightbulb className="inline-block mr-1 h-4 w-4" /> {maxSubnetsHint}
                  </FormDescription>
                )}
                <FormField
                  control={form.control}
                  name="commonDescription"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>通用描述 (可选)</FormLabel>
                      <FormControl>
                        <Input placeholder="例如 办公区-{CIDR}" {...field} />
                      </FormControl>
                      <FormDescription>将应用于所有新创建的子网。您可以使用 {`{CIDR}`} 作为占位符。</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="vlanId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>关联VLAN (可选)</FormLabel>
                      <Select
                        onValueChange={(value) => field.onChange(value === NO_VLAN_SENTINEL_VALUE ? "" : value)}
                        value={field.value || NO_VLAN_SENTINEL_VALUE}
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
                <Button type="submit" className="w-full" disabled={isPreviewing}>
                  {isPreviewing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
                  预览划分结果
                </Button>

                {previewError && (
                    <Alert variant="destructive" className="mt-4">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>预览出错</AlertTitle>
                        <AlertDescription>{previewError}</AlertDescription>
                    </Alert>
                )}

                {previewResults && previewResults.length > 0 && (
                    <div className="mt-6 space-y-3">
                        <h3 className="text-lg font-semibold border-b pb-2 mb-3">预览结果:</h3>
                        <ScrollArea className="max-h-[300px] border rounded-md">
                        <Table>
                            <TableHeader>
                            <TableRow>
                                <TableHead>计划的CIDR</TableHead>
                                <TableHead>掩码</TableHead>
                                <TableHead>可用IP</TableHead>
                                <TableHead>状态</TableHead>
                            </TableRow>
                            </TableHeader>
                            <TableBody>
                            {previewResults.map((res) => (
                                <TableRow key={res.id} className={res.status === 'overlap' || res.status === 'error' ? "bg-destructive/10" : ""}>
                                <TableCell className="font-mono">{res.candidateCidr}</TableCell>
                                <TableCell>/{res.plannedPrefix}</TableCell>
                                <TableCell>{res.plannedUsableIps}</TableCell>
                                <TableCell>
                                    {res.status === 'ok' && <Badge variant="secondary" className="text-green-600"><CheckCircle2 className="mr-1 h-3 w-3"/>可用</Badge>}
                                    {res.status === 'overlap' && <Badge variant="destructive"><AlertCircle className="mr-1 h-3 w-3"/>重叠: {res.overlappingWithCidr}</Badge>}
                                    {res.status === 'error' && <Badge variant="destructive"><AlertCircle className="mr-1 h-3 w-3"/>错误: {res.message}</Badge>}
                                </TableCell>
                                </TableRow>
                            ))}
                            </TableBody>
                        </Table>
                        </ScrollArea>
                    </div>
                )}
                 {creationResult && (
                    <div className="mt-6 space-y-3">
                        <h3 className="text-lg font-semibold border-b pb-2 mb-3">创建结果:</h3>
                         <Alert variant={creationResult.errors.length > 0 ? "destructive" : "default"}>
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>概要</AlertTitle>
                            <AlertDescription>
                                成功创建: {creationResult.createdCount} 个子网。
                                {creationResult.errors.length > 0 && ` 失败: ${creationResult.errors.length} 个。`}
                            </AlertDescription>
                        </Alert>
                        {/* TODO: Display detailed creation errors if any */}
                    </div>
                )}
              </div>
            </ScrollArea>

            <SheetFooter className="p-6 pt-4 border-t">
              <SheetClose asChild>
                <Button type="button" variant="outline">
                  取消
                </Button>
              </SheetClose>
              <Button
                type="button"
                onClick={handleCreateSubnets}
                disabled={!canConfirmCreation || isCreating || isPreviewing}
              >
                {isCreating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                确认创建子网 (开发中)
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}

