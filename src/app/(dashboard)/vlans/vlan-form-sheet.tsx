
"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PlusCircle, Edit } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { VLAN } from "@/types";
import { createVLANAction, updateVLANAction } from "@/lib/actions";

const vlanFormSchema = z.object({
  vlanNumber: z.coerce.number().int().min(1, "VLAN 号码必须至少为 1").max(4094, "VLAN 号码不能超过 4094"),
  description: z.string().max(200, "描述过长").optional(),
});

type VlanFormValues = z.infer<typeof vlanFormSchema>;

interface VlanFormSheetProps {
  vlan?: VLAN;
  children?: React.ReactNode; 
  buttonProps?: ButtonProps;
  onVlanChange?: () => void; 
}

export function VlanFormSheet({ vlan, children, buttonProps, onVlanChange }: VlanFormSheetProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const { toast } = useToast();
  const isEditing = !!vlan;

  const form = useForm<VlanFormValues>({
    resolver: zodResolver(vlanFormSchema),
    defaultValues: {
      vlanNumber: vlan?.vlanNumber || undefined,
      description: vlan?.description || "",
    },
  });

  React.useEffect(() => {
    if (isOpen) {
        form.reset({
        vlanNumber: vlan?.vlanNumber || undefined,
        description: vlan?.description || "",
        });
    }
  }, [isOpen, vlan, form]);

  async function onSubmit(data: VlanFormValues) {
    try {
      if (isEditing && vlan) {
        await updateVLANAction(vlan.id, data);
        toast({ title: "VLAN 已更新", description: `VLAN ${data.vlanNumber} 已成功更新。` });
      } else {
        await createVLANAction(data);
        toast({ title: "VLAN 已创建", description: `VLAN ${data.vlanNumber} 已成功创建。` });
      }
      setIsOpen(false);
      if (onVlanChange) onVlanChange();
      form.reset({ vlanNumber: undefined, description: "" });
    } catch (error) {
      toast({
        title: "错误",
        description: error instanceof Error ? error.message : "发生意外错误。",
        variant: "destructive",
      });
    }
  }
  
  const trigger = children ? (
    React.cloneElement(children as React.ReactElement, { onClick: () => setIsOpen(true) })
  ) : (
    <Button variant={isEditing ? "ghost" : "default"} size={isEditing ? "icon" : "default"} onClick={() => setIsOpen(true)} {...buttonProps}>
      {isEditing ? <Edit className="h-4 w-4" /> : <><PlusCircle className="mr-2 h-4 w-4" /> 添加VLAN</>}
      {isEditing && <span className="sr-only">编辑VLAN</span>}
    </Button>
  );


  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{isEditing ? "编辑VLAN" : "添加新VLAN"}</SheetTitle>
          <SheetDescription>
            {isEditing ? "更新现有VLAN的详细信息。" : "填写新VLAN的详细信息。"}
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-6">
            <FormField
              control={form.control}
              name="vlanNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>VLAN 号码</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="例如 10" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>描述 (可选)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="VLAN的简要描述" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <SheetFooter className="mt-8">
              <SheetClose asChild>
                <Button type="button" variant="outline">
                  取消
                </Button>
              </SheetClose>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "保存中..." : (isEditing ? "保存更改" : "创建VLAN")}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
