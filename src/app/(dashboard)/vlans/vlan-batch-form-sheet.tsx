
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
import { AlertCircle, PlusCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { batchCreateVLANsAction, type ActionResponse, type BatchVlanCreationResult } from "@/lib/actions";

const vlanBatchFormSchema = z.object({
  startVlanNumber: z.coerce.number().int().min(1, "起始VLAN号码必须至少为1").max(4094, "起始VLAN号码不能超过4094"),
  endVlanNumber: z.coerce.number().int().min(1, "结束VLAN号码必须至少为1").max(4094, "结束VLAN号码不能超过4094"),
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

  const form = useForm<VlanBatchFormValues>({
    resolver: zodResolver(vlanBatchFormSchema),
    defaultValues: {
      startVlanNumber: undefined,
      endVlanNumber: undefined,
      commonDescription: "",
    },
  });

  React.useEffect(() => {
    if (isOpen) {
      form.reset({
        startVlanNumber: undefined,
        endVlanNumber: undefined,
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
    for (let i = data.startVlanNumber; i <= data.endVlanNumber; i++) {
      vlansToCreate.push({ 
        vlanNumber: i, 
        description: data.commonDescription || undefined 
      });
    }

    if (vlansToCreate.length === 0) {
      toast({ title: "无VLAN可创建", description: "指定的范围为空或无效。", variant: "destructive" });
      return;
    }
     if (vlansToCreate.length > 100) { 
      toast({ title: "范围过大", description: "请分批创建VLAN (例如，每次最多100个)。", variant: "destructive" });
      return;
    }

    try {
      // Assuming batchCreateVLANsAction returns ActionResponse<BatchVlanCreationResult>
      // or just BatchVlanCreationResult directly if no global error is expected from the action itself
      const result = await batchCreateVLANsAction(vlansToCreate);
      // The 'result' here is BatchVlanCreationResult, not ActionResponse
      // If batchCreateVLANsAction itself could fail in setup and return ActionResponse, handle that first.
      // For now, assuming it always returns BatchVlanCreationResult or throws an error caught below.
      
      setSubmissionResult(result);

      if (result.successCount > 0 && result.failureDetails.length === 0) {
        toast({
          title: "批量创建成功",
          description: `${result.successCount} 个VLAN已成功创建。`,
        });
        if (onVlanChange) onVlanChange();
        form.reset(); 
        // setIsOpen(false); // Optionally close on full success
      } else if (result.successCount > 0 && result.failureDetails.length > 0) {
        toast({
          title: "批量处理部分成功",
          description: `${result.successCount} 个VLAN创建成功，${result.failureDetails.length} 个失败。详情请见下方。`,
          variant: "default", // Or "warning" if you have one
        });
        if (onVlanChange) onVlanChange(); // Still refresh if some succeeded
      } else if (result.failureDetails.length > 0) {
         toast({
          title: "批量创建失败",
          description: `所有 ${vlansToCreate.length} 个VLAN均创建失败。详情请见下方。`,
          variant: "destructive",
        });
      } else { // successCount is 0, failureDetails is 0 - should not happen if vlansToCreate > 0
        toast({ title: "无操作", description: "没有VLAN被创建或失败。", variant: "default" });
      }

    } catch (error) { // Catch unexpected errors from batchCreateVLANsAction or client-side logic
      // If batchCreateVLANsAction throws an error that's an AppError (and thus an ActionErrorResponse in its .error)
      // This path might be taken if the action itself fails before processing items.
      const actionError = (error as ActionResponse<any>)?.error;
      if (actionError) {
        toast({
            title: "批量创建预处理错误",
            description: actionError.userMessage,
            variant: "destructive",
        });
         if (actionError.field) {
          form.setError(actionError.field as FieldPath<VlanBatchFormValues>, {
            type: "server",
            message: actionError.userMessage,
          });
        }
      } else {
        toast({
            title: "客户端错误",
            description: error instanceof Error ? error.message : "批量创建过程中发生意外错误。",
            variant: "destructive",
        });
      }
      // Provide some feedback for submissionResult in case of a full crash
      setSubmissionResult({ successCount: 0, failureDetails: [{ vlanNumberAttempted: data.startVlanNumber, error: (error as Error).message || "未知错误" }] });
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
      <PlusCircle className="mr-2 h-4 w-4" /> 批量添加VLAN
    </Button>
  );


  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>{triggerContent}</SheetTrigger>
      <SheetContent className="sm:max-w-md w-full flex flex-col">
        <SheetHeader>
          <SheetTitle>批量添加VLAN (范围)</SheetTitle>
          <SheetDescription>
            输入起始和结束VLAN号码以创建VLAN范围。
            可以为所有VLAN应用一个可选的通用描述。
            VLAN号码必须在1到4094之间。
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4 flex-grow flex flex-col">
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
              name="commonDescription"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>通用描述 (可选)</FormLabel>
                  <FormControl>
                    <Input placeholder="例如 一楼用户VLAN" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {submissionResult && (
              <div className="mt-4 space-y-3">
                <h3 className="font-semibold">处理结果:</h3>
                <Alert variant={submissionResult.failureDetails.length > 0 && submissionResult.successCount === 0 ? "destructive" : "default"}>
                   <AlertCircle className="h-4 w-4"/>
                  <AlertTitle>概要</AlertTitle>
                  <AlertDescription>
                    成功创建: {submissionResult.successCount} 个VLAN。
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
                            VLAN {failure.vlanNumberAttempted}: {failure.error}
                          </li>
                        ))}
                      </ul>
                    </ScrollArea>
                  </div>
                )}
              </div>
            )}

            <SheetFooter className="mt-auto pt-4">
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
