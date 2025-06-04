
"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
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
  FormDescription
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Edit } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Role, Permission, PermissionId as AppPermissionId } from "@/types";
import { PERMISSIONS } from "@/types";
import { mockPermissions } from "@/lib/data";
import { updateRoleAction, getAllPermissionsAction } from "@/lib/actions";
import { ScrollArea } from "@/components/ui/scroll-area";

const permissionIntegrityRules = [
  { view: PERMISSIONS.VIEW_SUBNET, actions: [PERMISSIONS.CREATE_SUBNET, PERMISSIONS.EDIT_SUBNET, PERMISSIONS.DELETE_SUBNET], groupName: "子网管理" },
  { view: PERMISSIONS.VIEW_VLAN, actions: [PERMISSIONS.CREATE_VLAN, PERMISSIONS.EDIT_VLAN, PERMISSIONS.DELETE_VLAN], groupName: "VLAN 管理" },
  { view: PERMISSIONS.VIEW_IPADDRESS, actions: [PERMISSIONS.CREATE_IPADDRESS, PERMISSIONS.EDIT_IPADDRESS, PERMISSIONS.DELETE_IPADDRESS], groupName: "IP 地址管理" },
  { view: PERMISSIONS.VIEW_USER, actions: [PERMISSIONS.CREATE_USER, PERMISSIONS.EDIT_USER, PERMISSIONS.DELETE_USER], groupName: "用户管理" },
  { view: PERMISSIONS.VIEW_ROLE, actions: [PERMISSIONS.EDIT_ROLE_DESCRIPTION, PERMISSIONS.EDIT_ROLE_PERMISSIONS], groupName: "角色管理" },
  { view: PERMISSIONS.VIEW_AUDIT_LOG, actions: [PERMISSIONS.DELETE_AUDIT_LOG], groupName: "审计日志" },
  { view: PERMISSIONS.VIEW_TOOLS_IMPORT_EXPORT, actions: [PERMISSIONS.PERFORM_TOOLS_IMPORT, PERMISSIONS.PERFORM_TOOLS_EXPORT], groupName: "数据导出工具" },
];

const roleFormSchema = z.object({
  name: z.string(),
  description: z.string().max(200, "描述过长").optional(),
  permissions: z.array(z.string()).optional(),
}).superRefine((data, ctx) => {
  console.log("[RoleFormSheet SuperRefine] Validating permissions. Data received:", JSON.stringify(data.permissions));
  const selectedPermissions = (data.permissions || []) as AppPermissionId[];
  console.log("[RoleFormSheet SuperRefine] Selected permissions for logic:", JSON.stringify(selectedPermissions));

  for (const group of permissionIntegrityRules) {
    console.log(`[RoleFormSheet SuperRefine] Checking group: ${group.groupName}. View: ${group.view}. Actions: ${group.actions.join(', ')}`);
    const hasActionPermission = group.actions.some(action => selectedPermissions.includes(action as AppPermissionId));
    const hasViewPermission = selectedPermissions.includes(group.view as AppPermissionId);
    console.log(`[RoleFormSheet SuperRefine] Group: ${group.groupName}. Calculated: { hasActionPermission: ${hasActionPermission}, hasViewPermission: ${hasViewPermission} }`);

    if (hasActionPermission && !hasViewPermission) {
      const viewPermissionDetails = mockPermissions.find(p => p.id === group.view);
      const viewPermissionName = viewPermissionDetails ? `"${viewPermissionDetails.name}"` : `对应的查看权限 (ID: ${group.view})`;
      const errorMessage = `若要授予 "${group.groupName}" 中的操作权限，您必须同时授予 ${viewPermissionName}。`;
      console.log(`[RoleFormSheet SuperRefine] Adding issue for group ${group.groupName}: ${errorMessage}`);
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: errorMessage,
        path: ["permissions"], 
      });
    }
  }
  console.log("[RoleFormSheet SuperRefine] Validation finished.");
});

type RoleFormValues = z.infer<typeof roleFormSchema>;

interface RoleFormSheetProps {
  role: Role;
  children?: React.ReactNode;
  buttonProps?: ButtonProps;
  onRoleChange?: () => void;
}

export function RoleFormSheet({ role, children, buttonProps, onRoleChange }: RoleFormSheetProps) {
  console.log("[RoleFormSheet] Component rendering/re-rendering. Role ID:", role.id, "Role Name:", role.name);
  const [isOpen, setIsOpen] = React.useState(false);
  const { toast } = useToast();
  const isEditing = true;

  const [allPermissions, setAllPermissions] = React.useState<Permission[]>([]);
  const [isLoadingPermissions, setIsLoadingPermissions] = React.useState(false);

  const form = useForm<RoleFormValues>({
    resolver: zodResolver(roleFormSchema),
    defaultValues: {
      name: "",
      description: "",
      permissions: [],
    },
  });

  React.useEffect(() => {
    console.log("[RoleFormSheet Effect] isOpen changed:", isOpen, "allPermissions length:", allPermissions.length);
    if (isOpen && allPermissions.length === 0) {
      setIsLoadingPermissions(true);
      console.log("[RoleFormSheet Effect] Fetching all permissions...");
      getAllPermissionsAction()
        .then((fetchedPermissions) => {
          console.log("[RoleFormSheet Effect] Permissions fetched:", fetchedPermissions.length);
          setAllPermissions(fetchedPermissions);
        })
        .catch((error) => {
          console.error("[RoleFormSheet Effect] Error fetching permissions:", error);
          toast({ title: "获取权限错误", description: (error as Error).message, variant: "destructive" });
        })
        .finally(() => {
          console.log("[RoleFormSheet Effect] Finished fetching permissions, isLoadingPermissions set to false.");
          setIsLoadingPermissions(false);
        });
    }
  }, [isOpen, allPermissions.length, toast]);

  React.useEffect(() => {
    console.log("[RoleFormSheet Effect] isOpen or role details changed. isOpen:", isOpen, "Role ID:", role.id);
    if (isOpen) {
      console.log("[RoleFormSheet Effect] Resetting form with role data:", JSON.stringify({
        name: role.name,
        description: role.description || "",
        permissions: role.permissions || [],
      }));
      form.reset({
        name: role.name,
        description: role.description || "",
        permissions: role.permissions || [],
      });
    }
  }, [isOpen, role.id, role.name, role.description, role.permissions, form]);


  async function onSubmit(data: RoleFormValues) {
    console.log("[RoleFormSheet onSubmit] Form submitted with data:", JSON.stringify(data));
    try {
      await updateRoleAction(role.id, {
        description: data.description,
        permissions: data.permissions as AppPermissionId[],
      });
      console.log("[RoleFormSheet onSubmit] Role update successful.");
      toast({ title: "角色已更新", description: `角色 ${role.name} 的权限和描述已成功更新。` });
      setIsOpen(false);
      if (onRoleChange) {
        console.log("[RoleFormSheet onSubmit] Calling onRoleChange callback.");
        onRoleChange();
      }
    } catch (error) {
      console.error("[RoleFormSheet onSubmit] Error updating role:", error);
      toast({
        title: "更新角色错误",
        description: error instanceof Error ? error.message : "发生意外错误。",
        variant: "destructive",
      });
    }
  }

  const trigger = children ? (
    React.cloneElement(children as React.ReactElement, { onClick: () => { console.log("[RoleFormSheet] Trigger clicked, setting isOpen to true."); setIsOpen(true); } })
  ) : (
    <Button variant="ghost" size="icon" onClick={() => { console.log("[RoleFormSheet] Default trigger button clicked, setting isOpen to true."); setIsOpen(true); }} {...buttonProps}>
      <Edit className="h-4 w-4" />
      <span className="sr-only">编辑角色</span>
    </Button>
  );

  const groupedPermissions = React.useMemo(() => {
    console.log("[RoleFormSheet Memo] Recalculating groupedPermissions. All permissions count:", allPermissions.length);
    return allPermissions.reduce((acc, permission) => {
      (acc[permission.group] = acc[permission.group] || []).push(permission);
      return acc;
    }, {} as Record<string, Permission[]>);
  }, [allPermissions]);

  return (
    <Sheet open={isOpen} onOpenChange={(openState) => { console.log("[RoleFormSheet] Sheet onOpenChange called with state:", openState); setIsOpen(openState); }}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="sm:max-w-lg w-full">
        <SheetHeader>
          <SheetTitle>编辑角色：{role.name}</SheetTitle>
          <SheetDescription>
            更新角色 <span className="font-semibold">{role.name}</span> 的描述和分配的权限。角色名称不能更改。
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-6 flex flex-col h-[calc(100%-4rem)]">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>角色名称 (只读)</FormLabel>
                  <FormControl>
                    <Input placeholder="例如 管理员" {...field} readOnly disabled className="cursor-not-allowed bg-muted/50" />
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
                    <Textarea placeholder="角色的简要描述" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormItem className="flex-grow flex flex-col min-h-0">
                <FormLabel>权限</FormLabel>
                <FormDescription>选择此角色应具有的权限。</FormDescription>
                {isLoadingPermissions && allPermissions.length === 0 ? (
                    <p>加载权限中...</p>
                ) : (
                <ScrollArea className="flex-grow border rounded-md p-4 mt-2">
                    <div className="space-y-4">
                    {Object.entries(groupedPermissions).map(([groupName, permissionsInGroup]) => (
                        <div key={groupName}>
                        <h4 className="font-semibold text-md mb-2">{groupName}</h4>
                        <FormField
                            control={form.control}
                            name="permissions"
                            render={() => (
                            <div className="space-y-2">
                                {permissionsInGroup.map((permission) => (
                                <FormField
                                    key={permission.id}
                                    control={form.control}
                                    name="permissions"
                                    render={({ field }) => {
                                    return (
                                        <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                                        <FormControl>
                                            <Checkbox
                                            checked={field.value?.includes(permission.id)}
                                            onCheckedChange={(checked) => {
                                                const currentPermissions = field.value || [];
                                                let newPermissions;
                                                if (checked) {
                                                    newPermissions = [...currentPermissions, permission.id];
                                                } else {
                                                    newPermissions = currentPermissions.filter(
                                                        (value) => value !== permission.id
                                                    );
                                                }
                                                console.log(`[RoleFormSheet Permissions Checkbox] Permission "${permission.name}" (${permission.id}) checked: ${checked}. New selection:`, JSON.stringify(newPermissions));
                                                return field.onChange(newPermissions);
                                            }}
                                            />
                                        </FormControl>
                                        <FormLabel className="font-normal cursor-pointer">
                                            {permission.name}
                                        </FormLabel>
                                        </FormItem>
                                    );
                                    }}
                                />
                                ))}
                            </div>
                            )}
                        />
                        </div>
                    ))}
                    </div>
                </ScrollArea>
                )}
                 <FormMessage>{form.formState.errors.permissions?.message}</FormMessage>
            </FormItem>


            <SheetFooter className="mt-auto pt-6">
              <SheetClose asChild>
                <Button type="button" variant="outline" onClick={() => console.log("[RoleFormSheet] Cancel button clicked.")}>
                  取消
                </Button>
              </SheetClose>
              <Button type="submit" disabled={form.formState.isSubmitting || (isLoadingPermissions && allPermissions.length === 0) }>
                {form.formState.isSubmitting ? "保存中..." : "保存更改"}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}

    