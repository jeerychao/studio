
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, PlusCircle, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { batchCreateVLANsAction, type ActionResponse, type BatchVlanCreationResult } from "@/lib/actions";
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
    } else {
      // Ensure cleanup when sheet is closed by any means (e.g., programmatically or by user)
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
      toast({ title: "无VLAN可创建", description: "指定的范围和步长未产生任何VLAN号码。", variant: "destructive" });
      setIsOpen(false); // Close if no operation
      return;
    }
     if (vlansToCreate.length > 200) { 
      toast({ title: "范围过大", description: `尝试创建 ${vlansToCreate.length} 个VLAN。请分批创建 (例如，每次最多200个)。`, variant: "destructive" });
      // Do not close sheet, allow user to correct input
      return;
    }

    try {
      const result = await batchCreateVLANsAction(vlansToCreate, currentUser?.id);
      setSubmissionResult(result); // Set result to display in sheet if it remains open

      if (result.successCount > 0 && result.failureDetails.length === 0) { // All successful
        toast({
          title: "批量创建成功",
          description: `${result.successCount} 个VLAN已成功创建。`,
        });
        setIsOpen(false); // Close sheet on full success
        if (onVlanChange) onVlanChange();
      } else if (result.successCount > 0 && result.failureDetails.length > 0) { // Partial success
        toast({
          title: "批量处理部分成功",
          description: `${result.successCount} 个VLAN创建成功，${result.failureDetails.length} 个失败。详情请见下方。`,
          variant: "default",
          duration: 8000,
        });
        // Sheet remains open to show failureDetails
        if (onVlanChange) onVlanChange(); // Refresh list for successful items
      } else if (result.failureDetails.length > 0) { // All failed
         toast({
          title: "批量创建失败",
          description: `所有 ${vlansToCreate.length} 个VLAN均创建失败。详情请见下方。`,
          variant: "destructive",
          duration: 8000,
        });
         // Sheet remains open
      } else { // No operation (e.g. if vlansToCreate was empty, though handled above)
        toast({ title: "无操作", description: "没有VLAN被创建或失败。", variant: "default" });
        setIsOpen(false); // Close sheet if no actual operation occurred
      }

    } catch (clientError) {
        toast({
            title: "客户端提交错误",
            description: clientError instanceof Error ? clientError.message : "尝试批量创建VLAN时发生意外错误。",
            variant: "destructive",
        });
        setSubmissionResult({
            successCount: 0,
            failureDetails: [{ vlanNumberAttempted: data.startVlanNumber || 0, error: "客户端错误: " + (clientError instanceof Error ? clientError.message : "未知错误") }]
        });
        // Sheet remains open
    }
  }

  // handleOpenChange is used by Sheet's onOpenChange.
  // The useEffect watching `isOpen` is more comprehensive for cleanup.
  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    // The useEffect hook will handle resetting form and submissionResult when `isOpen` changes to false.
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
            <ScrollArea className="flex-1 px-6 pt-4 pb-2">
              <div className="space-y-4 pb-4"> {/* Added pb-4 to ensure space for last element before footer potentially */}
                <FormField
                  control={form.control}
                  name="startVlanNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>起始VLAN号码</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder="例如 100" {...field} />
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
                        <Input type="number" placeholder="例如 110" {...field} />
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
                        <Input type="number" placeholder="例如 1 或 10" {...field} />
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

                {submissionResult && (
                  <div className="mt-6 space-y-3">
                    <h3 className="font-semibold text-base border-b pb-1 mb-2">处理结果:</h3>
                    <Alert variant={submissionResult.failureDetails.length > 0 && submissionResult.successCount === 0 ? "destructive" : "default"}>
                      {submissionResult.failureDetails.length > 0 ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                      <AlertTitle>{submissionResult.failureDetails.length > 0 ? (submissionResult.successCount > 0 ? "部分成功" : "操作失败") : "全部成功"}</AlertTitle>
                      <AlertDescription>
                        成功创建: {submissionResult.successCount} 个VLAN。
                        <br />
                        失败尝试: {submissionResult.failureDetails.length} 个。
                      </AlertDescription>
                    </Alert>

                    {submissionResult.failureDetails.length > 0 && (
                      <div className="border border-dashed border-destructive p-3 rounded-md">
                        <h4 className="font-medium text-destructive text-sm mb-1">失败详情 ({submissionResult.failureDetails.length} 条):</h4>
                        <ScrollArea className="h-[100px] mt-1 rounded-md border bg-destructive/5 p-2">
                          <ul className="space-y-1 text-xs">
                            {submissionResult.failureDetails.map((failure, index) => (
                              <li key={index} className="text-destructive">
                                <strong>VLAN {failure.vlanNumberAttempted}:</strong> {failure.error || "错误信息未提供"}
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
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "处理中..." : "创建VLAN"}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
    

    