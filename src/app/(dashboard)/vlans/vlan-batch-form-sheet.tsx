
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
import { AlertCircle, PlusCircle, CheckCircle2 } from "lucide-react"; // Alert related imports no longer needed here
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
      form.clearErrors();
    } else {
      // Also reset when closed by any means to ensure clean state next time
      form.reset({
        startVlanNumber: undefined,
        endVlanNumber: undefined,
        step: 1,
        commonName: "",
        commonDescription: "",
      });
      form.clearErrors();
    }
  }, [isOpen, form]);


  async function onSubmit(data: VlanBatchFormValues) {
    form.clearErrors(); 

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
      setIsOpen(false);
      return;
    }
     if (vlansToCreate.length > 200) { 
      toast({ title: "范围过大", description: `尝试创建 ${vlansToCreate.length} 个VLAN。请分批创建 (例如，每次最多200个)。`, variant: "destructive" });
      return; // Keep sheet open for user to correct
    }

    try {
      const result = await batchCreateVLANsAction(vlansToCreate, currentUser?.id);

      if (result.successCount > 0 && result.failureDetails.length === 0) {
        toast({
          title: "批量创建成功",
          description: `${result.successCount} 个VLAN已成功创建。`,
        });
        if (onVlanChange) onVlanChange();
      } else if (result.successCount > 0 && result.failureDetails.length > 0) {
        toast({
          title: "批量处理部分成功",
          description: (
            <div>
              <p>{result.successCount} 个VLAN创建成功，{result.failureDetails.length} 个失败。</p>
              <p className="mt-2 text-xs">失败详情:</p>
              <ScrollArea className="h-[100px] mt-1 rounded-md border p-2 bg-destructive/10">
                <ul className="list-disc list-inside text-xs">
                  {result.failureDetails.map((f, i) => <li key={i}><strong>VLAN {f.vlanNumberAttempted}:</strong> {f.error}</li>)}
                </ul>
              </ScrollArea>
            </div>
          ),
          variant: "default",
          duration: 15000,
        });
        if (onVlanChange) onVlanChange();
      } else if (result.failureDetails.length > 0) {
         toast({
          title: "批量创建失败",
          description: (
             <div>
              <p>所有 {vlansToCreate.length} 个VLAN均创建失败。</p>
              <p className="mt-2 text-xs">失败详情:</p>
              <ScrollArea className="h-[100px] mt-1 rounded-md border p-2 bg-destructive/10">
                <ul className="list-disc list-inside text-xs">
                  {result.failureDetails.map((f, i) => <li key={i}><strong>VLAN {f.vlanNumberAttempted}:</strong> {f.error}</li>)}
                </ul>
              </ScrollArea>
            </div>
          ),
          variant: "destructive",
          duration: 15000,
        });
      } else {
        toast({ title: "无操作", description: "没有VLAN被创建或失败。", variant: "default" });
      }
      setIsOpen(false); // Close sheet after any submission attempt
    } catch (clientError) {
        toast({
            title: "客户端提交错误",
            description: clientError instanceof Error ? clientError.message : "尝试批量创建VLAN时发生意外错误。",
            variant: "destructive",
        });
        setIsOpen(false); // Close sheet on client error
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
            <ScrollArea className="flex-1 px-6 pt-4 pb-2">
              <div className="space-y-4 pb-4">
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
    
