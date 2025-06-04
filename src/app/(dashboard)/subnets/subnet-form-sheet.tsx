
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PlusCircle, Edit } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Subnet, VLAN } from "@/types";
import { createSubnetAction, updateSubnetAction } from "@/lib/actions";
import { parseAndValidateCIDR } from "@/lib/ip-utils";

const subnetFormSchema = z.object({
  cidr: z.string().min(7, "CIDR 表示法太短 (例如 x.x.x.x/y)")
    .refine((val) => {
      const parsed = parseAndValidateCIDR(val);
      return parsed !== null; 
    }, "无效的 CIDR 表示法格式 (例如 192.168.1.0/24)。请确保 IP 地址和前缀长度有效。"),
  vlanId: z.string().optional(),
  description: z.string().max(200, "描述过长").optional(),
});

type SubnetFormValues = z.infer<typeof subnetFormSchema>;

interface SubnetFormSheetProps {
  subnet?: Subnet;
  vlans: VLAN[];
  children?: React.ReactNode;
  buttonProps?: ButtonProps;
  onSubnetChange?: () => void; // Callback prop
}

const NO_VLAN_SENTINEL_VALUE = "__NO_VLAN_INTERNAL__";

export function SubnetFormSheet({ subnet, vlans, children, buttonProps, onSubnetChange }: SubnetFormSheetProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const { toast } = useToast();
  const isEditing = !!subnet;

  const form = useForm<SubnetFormValues>({
    resolver: zodResolver(subnetFormSchema),
    defaultValues: {
      cidr: subnet?.cidr || "",
      vlanId: subnet?.vlanId || "",
      description: subnet?.description || "",
    },
  });
  
  React.useEffect(() => {
    if (isOpen) {
      form.reset({
        cidr: subnet?.cidr || "",
        vlanId: subnet?.vlanId || "",
        description: subnet?.description || "",
      });
    }
  }, [isOpen, subnet, form]);


  async function onSubmit(data: SubnetFormValues) {
    try {
      const actionData = {
        cidr: data.cidr,
        vlanId: data.vlanId === NO_VLAN_SENTINEL_VALUE ? undefined : (data.vlanId || undefined),
        description: data.description || undefined,
      };

      if (isEditing && subnet) {
        await updateSubnetAction(subnet.id, actionData );
        toast({ title: "子网已更新", description: `子网已成功更新。` });
      } else {
        await createSubnetAction(actionData);
        toast({ title: "子网已创建", description: `子网 ${data.cidr} 已成功创建。` });
      }
      setIsOpen(false);
      if (onSubnetChange) onSubnetChange(); // Call callback
      form.reset();
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
      {isEditing ? <Edit className="h-4 w-4" /> : <><PlusCircle className="mr-2 h-4 w-4" /> 添加子网</>}
      {isEditing && <span className="sr-only">编辑子网</span>}
    </Button>
  );

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{isEditing ? "编辑子网" : "添加新子网"}</SheetTitle>
          <SheetDescription>
            {isEditing ? "更新现有子网的详细信息。" : "提供新子网的 CIDR (例如 192.168.1.0/24)。其他详细信息是可选的。"}
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-6">
            <FormField
              control={form.control}
              name="cidr"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>网络地址 (CIDR)</FormLabel>
                  <FormControl>
                    <Input placeholder="例如 192.168.1.0/24" {...field} />
                  </FormControl>
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
                    onValueChange={(value) => {
                      if (value === NO_VLAN_SENTINEL_VALUE) {
                        field.onChange(""); 
                      } else {
                        field.onChange(value);
                      }
                    }}
                    value={field.value === "" || field.value === undefined ? NO_VLAN_SENTINEL_VALUE : field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="选择一个 VLAN" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NO_VLAN_SENTINEL_VALUE}>无 VLAN</SelectItem>
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
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>描述 (可选)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="子网的简要描述" {...field} />
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
                {form.formState.isSubmitting ? "保存中..." : (isEditing ? "保存更改" : "创建子网")}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
