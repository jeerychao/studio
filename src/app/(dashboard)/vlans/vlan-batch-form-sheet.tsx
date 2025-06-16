
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, PlusCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { batchCreateVLANsAction, type BatchVlanCreationResult } from "@/lib/actions";
import { useCurrentUser } from "@/hooks/use-current-user";

const vlanBatchFormSchema = z.object({
  startVlanNumber: z.coerce.number().int().min(1, "起始VLAN号码必须至少为1").max(4094, "起始VLAN号码不能超过4094"),
  endVlanNumber: z.coerce.number().int().min(1, "结束VLAN号码必须至少为1").max(4094, "结束VLAN号码不能超过4094"),
  step: z.coerce.number().int().min(1, "步长必须至少为1").optional().default(1),
  commonName: z.string().max(100, "通用名称过长").optional(),
  commonDescription: z.string().max(200, "描述过长").optional(),
}).refine(data => data.startVlanNumber <= data.endVlanNumber, {
  message: "起始VLAN号码必须小于或等于结束VLAN号码。",
  path: ["endVlanNumber"],
});

type VlanBatchFormValues = z.infer<typeof vlanBatchFormSchema>;

interface VlanBatchFormSheetProps {
  children?: React.ReactNode;
  onVlanChange?: () => void;
}

export function VlanBatchFormSheet({ children, onVlanChange }: VlanBatchFormSheetProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [submissionResult, setSubmissionResult] = React.useState<BatchVlanCreationResult | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const { toast } = useToast();
  const { currentUser } = useCurrentUser();

  const form = useForm<VlanBatchFormValues>({
    resolver: zodResolver(vlanBatchFormSchema),
    defaultValues: {
      startVlanNumber: undefined,
      endVlanNumber: undefined,
      step: 1,
      commonName: "",
      commonDescription: "",
    },
  });

  React.useEffect(() => {
    if (isOpen) {
      form.reset({
        startVlanNumber: undefined,
        endVlanNumber: undefined,
        step: 1,
        commonName: "",
        commonDescription: "",
      });
      setSubmissionResult(null);
      form.clearErrors();
    }
  }, [isOpen, form]);

  async function onSubmit(data: VlanBatchFormValues) {
    form.clearErrors();
    setSubmissionResult(null);
    setIsSubmitting(true);

    const vlansToCreate = [];
    const stepValue = data.step || 1;

    for (let i = data.startVlanNumber; i <= data.endVlanNumber; i += stepValue) {
      vlansToCreate.push({
        vlanNumber: i,
        name: data.commonName || undefined,
        description: data.commonDescription || undefined
      });
    }

    if (vlansToCreate.length === 0) {
      const noOpError = "指定的范围和步长未产生任何VLAN号码。";
      setSubmissionResult({ successCount: 0, failureDetails: [{ vlanNumberAttempted: data.startVlanNumber, error: noOpError }] });
      setIsSubmitting(false);
      return;
    }
    if (vlansToCreate.length > 200) {
      const rangeTooLargeError = `尝试创建 ${vlansToCreate.length} 个VLAN。请分批创建 (例如，每次最多200个)。`;
      setSubmissionResult({ successCount: 0, failureDetails: [{ vlanNumberAttempted: data.startVlanNumber, error: rangeTooLargeError }] });
      setIsSubmitting(false);
      return;
    }

    try {
      const result = await batchCreateVLANsAction(vlansToCreate, currentUser?.id);
      setSubmissionResult(result);

      if (result.successCount > 0 && result.failureDetails.length === 0) {
        toast({
          title: "批量创建成功",
          description: `${result.successCount} 个VLAN已成功创建。`,
        });
        if (onVlanChange) onVlanChange();
        setIsOpen(false);
      } else if (result.successCount > 0 && result.failureDetails.length > 0) {
        toast({
            title: "批量处理部分成功",
            description: (
                <div>
                  <p>{result.successCount} 个VLAN创建成功，{result.failureDetails.length} 个失败。</p>
                  <p className="text-xs mt-1">详情请查看表单内提示。</p>
                </div>
            ),
            variant: "destructive",
            duration: 10000,
        });
        if (onVlanChange) onVlanChange();
        // Sheet remains open
      } else if (result.failureDetails.length > 0) { // Only failures
        toast({
            title: "批量创建失败", // General toast title
            description: `所有 ${vlansToCreate.length} 个VLAN均创建失败。详情请查看表单内提示。`,
            variant: "destructive",
            duration: 10000,
        });
        // Sheet remains open
      } else { // successCount === 0 && failureDetails.length === 0 (e.g. server no-op)
        toast({ title: "无操作", description: "没有VLAN被创建或失败。" });
        setIsOpen(false);
      }
    } catch (clientError) {
        const errorMessage = clientError instanceof Error ? clientError.message : "尝试批量创建VLAN时发生意外错误。";
        toast({
            title: "客户端提交错误",
            description: errorMessage,
            variant: "destructive",
        });
        setSubmissionResult({
            successCount: 0,
            failureDetails: [{
                vlanNumberAttempted: data.startVlanNumber,
                error: errorMessage
            }]
        });
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
  };

  const triggerContent = children || (
    <Button variant="outline">
      <PlusCircle className="mr-2 h-4 w-4" /> 批量添加VLAN
    </Button>
  );

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>{triggerContent}</SheetTrigger>
      <SheetContent className="sm:max-w-md w-full flex flex-col p-0">
        <SheetHeader className="p-6 pb-4 border-b">
          <SheetTitle>批量添加VLAN (范围)</SheetTitle>
          <SheetDescription>
            输入起始和结束VLAN号码及步长以创建VLAN序列。
            可以为所有VLAN应用可选的通用名称和描述。
            VLAN号码必须在1到4094之间。
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex-grow flex flex-col overflow-hidden">
            <ScrollArea className="flex-1 px-6 pt-4">
              <div className="space-y-4 pb-4">
                <FormField
                  control={form.control}
                  name="startVlanNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>起始VLAN号码</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="例如 100" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="endVlanNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>结束VLAN号码</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="例如 110" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="step"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>步长 (可选, 默认为1)</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="例如 1 或 10" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="commonName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>通用名称 (可选)</FormLabel>
                      <FormControl>
                        <Input placeholder="例如 用户VLAN" {...field} />
                      </FormControl>
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
                        <Input placeholder="例如 一楼用户区" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {/* Display processing results/errors */}
                {submissionResult && (submissionResult.failureDetails.length > 0 || (submissionResult.successCount === 0 && submissionResult.failureDetails.length === 0 && submissionResult.failureDetails[0]?.error)) && (
                  <div className="mt-6 space-y-3">
                    <Alert variant={submissionResult.failureDetails.length > 0 ? "destructive" : "default"}>
                      <AlertCircle className="h-4 w-4" />
                       <AlertTitle>
                        {(() => {
                          if (submissionResult.failureDetails.length > 0 && submissionResult.successCount === 0) {
                            return "批量创建失败"; // Matches image title
                          }
                          if (submissionResult.failureDetails.length > 0 && submissionResult.successCount > 0) {
                            return "批量处理部分成功";
                          }
                           const firstClientError = submissionResult.failureDetails[0]?.error;
                           if (submissionResult.successCount === 0 && submissionResult.failureDetails.length > 0 && firstClientError && (firstClientError.includes("未产生任何VLAN号码") || firstClientError.includes("范围过大"))) {
                             return "输入错误";
                           }
                          return "处理结果"; // Fallback
                        })()}
                      </AlertTitle>
                      <AlertDescription>
                        {(() => {
                          if (submissionResult.failureDetails.length > 0 && submissionResult.successCount === 0) {
                             // Check if it's a client-side validation message
                            const clientErrorMsg = submissionResult.failureDetails[0]?.error;
                            if (clientErrorMsg && (clientErrorMsg.includes("未产生任何VLAN号码") || clientErrorMsg.includes("范围过大"))) {
                                return clientErrorMsg;
                            }
                            return `所有 ${submissionResult.failureDetails.length} 个VLAN均创建失败。`; // Matches image structure for server failures
                          }
                          if (submissionResult.failureDetails.length > 0 && submissionResult.successCount > 0) {
                            return `成功创建: ${submissionResult.successCount} 个VLAN。失败: ${submissionResult.failureDetails.length} 个。`;
                          }
                          // This case should ideally not show the alert if there are no failures and some successes.
                          // But if it's a client-side error message (e.g. no VLANs produced), it's handled above.
                          return `成功创建: ${submissionResult.successCount} 个VLAN。`;
                        })()}
                      </AlertDescription>
                    </Alert>
                    
                    {/* Show detailed list only if there are server-side failures, not for client-side range errors */}
                    {submissionResult.failureDetails.length > 0 &&
                     !(submissionResult.successCount === 0 && submissionResult.failureDetails[0]?.error && (submissionResult.failureDetails[0].error.includes("未产生任何VLAN号码") || submissionResult.failureDetails[0].error.includes("范围过大"))) &&
                     (
                      <div className="border border-dashed border-destructive p-3 mt-3 rounded-md">
                        <h4 className="font-medium text-destructive mb-2">
                          失败详情 (共 {submissionResult.failureDetails.length} 条):
                        </h4>
                        <ScrollArea className="h-[120px] mt-1 rounded-md border bg-destructive/5 p-2">
                          <ul className="space-y-1 text-sm">
                            {submissionResult.failureDetails.map((failure, index) => (
                              <li key={index} className="text-destructive font-medium">
                                VLAN {failure.vlanNumberAttempted}: {failure.error || "错误信息未提供"}
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
            <SheetFooter className="p-6 pt-4 border-t">
              <SheetClose asChild>
                <Button type="button" variant="outline">
                  取消
                </Button>
              </SheetClose>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />处理中...</> : "创建VLAN"}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
