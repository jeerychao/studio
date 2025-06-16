
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
// Alert components are no longer needed here for inline error display
import { PlusCircle, Loader2 } from "lucide-react";
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
  // submissionResult is no longer used for inline display
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
      // No need to clear submissionResult state as it's removed from display
      form.clearErrors();
    }
  }, [isOpen, form]);

  async function onSubmit(data: VlanBatchFormValues) {
    form.clearErrors();
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
      toast({
        title: "输入错误",
        description: "指定的范围和步长未产生任何VLAN号码。",
        variant: "destructive",
        duration: 10000,
      });
      setIsSubmitting(false);
      // Keep sheet open
      return;
    }
    if (vlansToCreate.length > 200) {
      toast({
        title: "输入错误",
        description: `尝试创建 ${vlansToCreate.length} 个VLAN。请分批创建 (例如，每次最多200个)。`,
        variant: "destructive",
        duration: 10000,
      });
      setIsSubmitting(false);
      // Keep sheet open
      return;
    }

    try {
      const result = await batchCreateVLANsAction(vlansToCreate, currentUser?.id);
      
      if (result.successCount > 0 && result.failureDetails.length === 0) {
        toast({
          title: "批量创建成功",
          description: `${result.successCount} 个VLAN已成功创建。`,
        });
        if (onVlanChange) onVlanChange();
        setIsOpen(false); // Close sheet on full success
      } else if (result.successCount > 0 && result.failureDetails.length > 0) {
        toast({
            title: "批量处理部分成功",
            description: `成功创建: ${result.successCount} 个VLAN。失败: ${result.failureDetails.length} 个。首个错误: ${result.failureDetails[0].vlanNumberAttempted}: ${result.failureDetails[0].error}`,
            variant: "destructive",
            duration: 15000,
        });
        if (onVlanChange) onVlanChange();
        // Keep sheet open
      } else if (result.successCount === 0 && result.failureDetails.length > 0) { 
        toast({
            title: "批量创建失败", 
            description: `所有 ${vlansToCreate.length} 个VLAN均创建失败。首个错误: ${result.failureDetails[0].vlanNumberAttempted}: ${result.failureDetails[0].error}`,
            variant: "destructive",
            duration: 15000,
        });
        // Keep sheet open
      } else { 
        toast({ title: "无操作", description: "没有VLAN被创建或失败。" });
        setIsOpen(false); // Close if no operation and no errors
      }
    } catch (clientError) {
        const errorMessage = clientError instanceof Error ? clientError.message : "尝试批量创建VLAN时发生意外错误。";
        toast({
            title: "客户端提交错误",
            description: errorMessage,
            variant: "destructive",
            duration: 10000,
        });
        // Keep sheet open
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
                {/* Removed inline submissionResult display */}
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
