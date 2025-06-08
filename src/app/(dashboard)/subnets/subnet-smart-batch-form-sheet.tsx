
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
import { GitBranch, Loader2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { VLAN, Subnet as AppSubnetType } from "@/types";
import { batchDivideAndCreateSubnetsAction, type ActionResponse } from "@/lib/actions";
import { getSubnetPropertiesFromCidr, getPrefixFromRequiredHosts, generateSubnetsFromParent } from "@/lib/ip-utils";
import type { SubnetProperties } from "@/lib/ip-utils";

const NO_VLAN_SENTINEL_VALUE = "__NO_VLAN_INTERNAL__";

const subnetDivisionFormSchema = z.object({
  parentCidr: z.string().min(7, "父网络 CIDR 无效 (例如 x.x.x.x/y)"),
  newSubnetPrefixLength: z.coerce.number().int().min(1).max(30, "新子网前缀长度必须在 1-30 之间"),
  numberOfSubnets: z.coerce.number().int().min(1, "至少需要创建1个子网").optional(),
  vlanId: z.string().optional(),
  commonDescription: z.string().max(150, "通用描述过长").optional(),
}).refine(data => {
    const parentProps = getSubnetPropertiesFromCidr(data.parentCidr);
    if (!parentProps) return false; // Will be caught by individual CIDR validation
    return data.newSubnetPrefixLength > parentProps.prefix;
  }, {
    message: "新子网前缀长度必须大于父网络的前缀长度 (即更小的网络)。",
    path: ["newSubnetPrefixLength"],
  }
);

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
  const [previewError, setPreviewError] = React.useState<string | null>(null);
  const [isCalculatingPreview, setIsCalculatingPreview] = React.useState(false);
  const [submissionResult, setSubmissionResult] = React.useState<{success: boolean, message: string, errors?: string[]} | null>(null);


  const form = useForm<SubnetDivisionFormValues>({
    resolver: zodResolver(subnetDivisionFormSchema),
    defaultValues: {
      parentCidr: "",
      newSubnetPrefixLength: undefined,
      numberOfSubnets: undefined,
      vlanId: NO_VLAN_SENTINEL_VALUE,
      commonDescription: "",
    },
  });

  const { watch, trigger } = form;
  const parentCidr = watch("parentCidr");
  const newSubnetPrefixLength = watch("newSubnetPrefixLength");
  const numberOfSubnetsToCreate = watch("numberOfSubnets");

  const handlePreview = React.useCallback(async () => {
    const isValid = await trigger(["parentCidr", "newSubnetPrefixLength"]);
    if (!isValid) {
      setPreviewSubnets([]);
      setMaxCreatableSubnets(null);
      setPreviewError("请修正表单中的错误。");
      return;
    }
    setIsCalculatingPreview(true);
    setPreviewError(null);
    setPreviewSubnets([]);
    setMaxCreatableSubnets(null);

    try {
      const parentProps = getSubnetPropertiesFromCidr(parentCidr);
      if (!parentProps) {
        setPreviewError("父网络 CIDR 无效。");
        setIsCalculatingPreview(false);
        return;
      }
      if (newSubnetPrefixLength <= parentProps.prefix) {
        setPreviewError("新子网前缀必须大于父网络前缀。");
        setIsCalculatingPreview(false);
        return;
      }

      const result = generateSubnetsFromParent(parentCidr, newSubnetPrefixLength, numberOfSubnetsToCreate);

      if ("error" in result) {
        setPreviewError(result.error);
        setPreviewSubnets([]);
        setMaxCreatableSubnets(0);
      } else {
        setPreviewSubnets(result.generatedSubnets);
        setMaxCreatableSubnets(result.maxPossible);
        if (result.generatedSubnets.length === 0 && numberOfSubnetsToCreate && numberOfSubnetsToCreate > 0) {
            setPreviewError("无法根据指定数量生成子网，可能超出父网络容量。");
        } else if (result.generatedSubnets.length === 0) {
            setPreviewError("无法生成任何子网。请检查输入。");
        }
      }
    } catch (e) {
      setPreviewError((e as Error).message || "预览计算时发生未知错误。");
    } finally {
      setIsCalculatingPreview(false);
    }
  }, [parentCidr, newSubnetPrefixLength, numberOfSubnetsToCreate, trigger]);


  async function onSubmit(data: SubnetDivisionFormValues) {
    if (previewSubnets.length === 0) {
      toast({ title: "无子网可创建", description: "请先生成并预览要创建的子网。", variant: "destructive" });
      return;
    }
    setSubmissionResult(null);

    const subnetsToCreate = previewSubnets.map(subnetProps => ({
      cidr: `${subnetProps.networkAddress}/${subnetProps.prefix}`,
      vlanId: data.vlanId === NO_VLAN_SENTINEL_VALUE ? undefined : data.vlanId,
      description: data.commonDescription ? `${data.commonDescription} (分割自 ${data.parentCidr})` : `分割自 ${data.parentCidr}`,
    }));

    try {
      const response = await batchDivideAndCreateSubnetsAction({
        parentCidr: data.parentCidr, // For logging/context if needed by action
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
                  name="parentCidr"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>父网络 CIDR</FormLabel>
                      <FormControl>
                        <Input placeholder="例如 192.168.0.0/16" {...field} />
                      </FormControl>
                      <FormDescription>您想要从中划分子网的现有网络。</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="newSubnetPrefixLength"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>新子网前缀长度</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="例如 24 (对应 /24)" {...field} onChange={e => field.onChange(parseInt(e.target.value,10) || undefined)} />
                      </FormControl>
                      <FormDescription>每个新子网的掩码位数 (例如，24 代表 255.255.255.0)。必须大于父网络前缀。</FormDescription>
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

                {maxCreatableSubnets !== null && !previewError && (
                   <Alert className="mt-4">
                    <AlertDescription>
                      根据当前设置，最多可以创建 <strong>{maxCreatableSubnets}</strong> 个不重叠的 / {form.getValues("newSubnetPrefixLength")} 子网。
                      {numberOfSubnetsToCreate && numberOfSubnetsToCreate > maxCreatableSubnets && <span className="text-destructive"> (您请求的数量超出了最大值)</span>}
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
              <Button type="submit" disabled={form.formState.isSubmitting || previewSubnets.length === 0 || isCalculatingPreview}>
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

    