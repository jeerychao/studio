
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
import { PlusCircle, Edit } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Device } from "@/types";
import { DeviceType } from "@/types"; // Import enum directly
import { createDeviceAction, updateDeviceAction, type ActionResponse } from "@/lib/actions";

const deviceFormSchema = z.object({
  name: z.string().min(1, "设备名称不能为空。").max(100, "设备名称过长，最多100个字符。"),
  deviceType: z.nativeEnum(DeviceType).optional(),
  location: z.string().max(100, "位置信息过长，最多100个字符。").optional(),
  managementIp: z.string().ip({ version: "v4", message: "无效的 IPv4 地址" }).optional().or(z.literal("")), // Allow empty string
  brand: z.string().max(50, "品牌名称过长，最多50个字符。").optional(),
  modelNumber: z.string().max(50, "型号过长，最多50个字符。").optional(),
  serialNumber: z.string().max(100, "序列号过长，最多100个字符。").optional(),
  description: z.string().max(255, "描述过长，最多255个字符。").optional(),
});

type DeviceFormValues = z.infer<typeof deviceFormSchema>;

// For user-friendly display in the dropdown
const deviceTypeLabels: Record<DeviceType, string> = {
  [DeviceType.ROUTER]: "路由器 (Router)",
  [DeviceType.SWITCH]: "交换机 (Switch)",
  [DeviceType.FIREWALL]: "防火墙 (Firewall)",
  [DeviceType.SERVER]: "服务器 (Server)",
  [DeviceType.ACCESS_POINT]: "无线接入点 (AP)",
  [DeviceType.OLT]: "光线路终端 (OLT)",
  [DeviceType.DDN_DEVICE]: "DDN 设备",
  [DeviceType.OTHER]: "其他 (Other)",
};
const deviceTypeOptions = Object.values(DeviceType);
const NO_DEVICE_TYPE_SELECTED = "__NO_DEVICE_TYPE_INTERNAL__";


interface DeviceFormSheetProps {
  device?: Device;
  children?: React.ReactNode;
  buttonProps?: ButtonProps;
  onDeviceChange?: () => void;
}

export function DeviceFormSheet({ device, children, buttonProps, onDeviceChange }: DeviceFormSheetProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const { toast } = useToast();
  const isEditing = !!device;

  const form = useForm<DeviceFormValues>({
    resolver: zodResolver(deviceFormSchema),
    defaultValues: {
      name: "",
      deviceType: undefined,
      location: "",
      managementIp: "",
      brand: "",
      modelNumber: "",
      serialNumber: "",
      description: "",
    },
  });

  React.useEffect(() => {
    if (isOpen) {
      form.reset({
        name: device?.name || "",
        deviceType: device?.deviceType || undefined,
        location: device?.location || "",
        managementIp: device?.managementIp || "",
        brand: device?.brand || "",
        modelNumber: device?.modelNumber || "",
        serialNumber: device?.serialNumber || "",
        description: device?.description || "",
      });
      form.clearErrors();
    }
  }, [isOpen, device, form]);

  async function onSubmit(data: DeviceFormValues) {
    form.clearErrors();
    let response: ActionResponse<Device>;
    try {
      const payload = {
        name: data.name,
        deviceType: data.deviceType || undefined,
        location: data.location || undefined,
        managementIp: data.managementIp === "" ? undefined : data.managementIp, // Send undefined if empty
        brand: data.brand || undefined,
        modelNumber: data.modelNumber || undefined,
        serialNumber: data.serialNumber || undefined,
        description: data.description || undefined,
      };

      if (isEditing && device) {
        response = await updateDeviceAction(device.id, payload);
      } else {
        response = await createDeviceAction(payload);
      }

      if (response.success && response.data) {
        toast({
          title: isEditing ? "设备已更新" : "设备已创建",
          description: `设备 ${response.data.name} 已成功${isEditing ? '更新' : '创建'}。`,
        });
        setIsOpen(false);
        if (onDeviceChange) onDeviceChange();
      } else if (response.error) {
        toast({
          title: "操作失败",
          description: response.error.userMessage,
          variant: "destructive",
        });
        if (response.error.field) {
          form.setError(response.error.field as FieldPath<DeviceFormValues>, {
            type: "server",
            message: response.error.userMessage,
          });
        }
      }
    } catch (error) {
      toast({
        title: "客户端错误",
        description: error instanceof Error ? error.message : "提交表单时发生意外错误。",
        variant: "destructive",
      });
    }
  }

  const trigger = children ? (
    React.cloneElement(children as React.ReactElement, { onClick: () => setIsOpen(true) })
  ) : (
    <Button variant={isEditing ? "ghost" : "default"} size={isEditing ? "icon" : "default"} onClick={() => setIsOpen(true)} {...buttonProps}>
      {isEditing ? <Edit className="h-4 w-4" /> : <><PlusCircle className="mr-2 h-4 w-4" /> 添加设备</>}
      {isEditing && <span className="sr-only">编辑设备</span>}
    </Button>
  );

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="sm:max-w-lg w-full flex flex-col p-0">
        <SheetHeader className="p-6 pb-4 border-b">
          <SheetTitle>{isEditing ? "编辑设备" : "添加新设备"}</SheetTitle>
          <SheetDescription>
            {isEditing ? "更新现有设备的详细信息。" : "填写新设备的详细信息。"}
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-grow overflow-hidden">
            <ScrollArea className="flex-1 px-6 pt-6 pb-2">
              <div className="space-y-6">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>设备名称</FormLabel>
                      <FormControl>
                        <Input placeholder="例如 Core-Switch-Alpha" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="deviceType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>设备类型 (可选)</FormLabel>
                      <Select
                        onValueChange={(value) => field.onChange(value === NO_DEVICE_TYPE_SELECTED ? undefined : value as DeviceType)}
                        value={field.value || NO_DEVICE_TYPE_SELECTED}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="选择设备类型" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={NO_DEVICE_TYPE_SELECTED}>-- 无类型 --</SelectItem>
                          {deviceTypeOptions.map((type) => (
                            <SelectItem key={type} value={type}>
                              {deviceTypeLabels[type]}
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
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>位置 (可选)</FormLabel>
                      <FormControl>
                        <Input placeholder="例如 主数据中心 A1柜" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="managementIp"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>管理IP (可选)</FormLabel>
                      <FormControl>
                        <Input placeholder="例如 10.200.0.1" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="brand"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>品牌 (可选)</FormLabel>
                      <FormControl>
                        <Input placeholder="例如 H3C, Cisco" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="modelNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>型号 (可选)</FormLabel>
                      <FormControl>
                        <Input placeholder="例如 S7506E" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="serialNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>序列号 (可选)</FormLabel>
                      <FormControl>
                        <Input placeholder="例如 UNIQUE_SN_XYZ" {...field} />
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
                        <Textarea placeholder="设备的简要描述或备注" {...field} />
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
                {form.formState.isSubmitting ? "保存中..." : (isEditing ? "保存更改" : "创建设备")}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
    
