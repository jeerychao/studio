
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
import type { Role, Permission, PermissionId } from "@/types";
import { updateRoleAction, getAllPermissionsAction } from "@/lib/actions";
import { ScrollArea } from "@/components/ui/scroll-area";

const roleFormSchema = z.object({
  name: z.string(), // Name will be read-only
  description: z.string().max(200, "Description too long").optional(),
  permissions: z.array(z.string()).optional(), // Array of permission IDs
});

type RoleFormValues = z.infer<typeof roleFormSchema>;

interface RoleFormSheetProps {
  role: Role;
  children?: React.ReactNode;
  buttonProps?: ButtonProps;
}

export function RoleFormSheet({ role, children, buttonProps }: RoleFormSheetProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const { toast } = useToast();
  const isEditing = true;

  const [allPermissions, setAllPermissions] = React.useState<Permission[]>([]);
  const [isLoadingPermissions, setIsLoadingPermissions] = React.useState(false);

  const form = useForm<RoleFormValues>({
    resolver: zodResolver(roleFormSchema),
    // Default values will be set in useEffect
    defaultValues: {
      name: "",
      description: "",
      permissions: [],
    },
  });

  // Effect to fetch all available system permissions
  React.useEffect(() => {
    if (isOpen && allPermissions.length === 0) { // Only fetch if sheet is open and permissions aren't loaded
      setIsLoadingPermissions(true);
      getAllPermissionsAction()
        .then((fetchedPermissions) => {
          setAllPermissions(fetchedPermissions);
        })
        .catch((error) => {
          toast({ title: "Error fetching permissions", description: (error as Error).message, variant: "destructive" });
        })
        .finally(() => {
          setIsLoadingPermissions(false);
        });
    }
  }, [isOpen, allPermissions.length, toast]);

  // Effect to reset form fields when the sheet opens or the specific role prop changes
  React.useEffect(() => {
    if (isOpen) {
      form.reset({
        name: role.name,
        description: role.description || "",
        permissions: role.permissions || [], // These are the *role's current* permissions
      });
    }
  }, [isOpen, role.id, role.name, role.description, role.permissions, form]);


  async function onSubmit(data: RoleFormValues) {
    try {
      await updateRoleAction(role.id, {
        description: data.description,
        permissions: data.permissions as PermissionId[],
      });
      toast({ title: "Role Updated", description: `Permissions and description for role ${role.name} have been successfully updated.` });
      setIsOpen(false);
    } catch (error) {
      toast({
        title: "Error Updating Role",
        description: error instanceof Error ? error.message : "An unexpected error occurred.",
        variant: "destructive",
      });
    }
  }

  const trigger = children ? (
    React.cloneElement(children as React.ReactElement, { onClick: () => setIsOpen(true) })
  ) : (
    <Button variant="ghost" size="icon" onClick={() => setIsOpen(true)} {...buttonProps}>
      <Edit className="h-4 w-4" />
      <span className="sr-only">Edit Role</span>
    </Button>
  );

  const groupedPermissions = React.useMemo(() => {
    return allPermissions.reduce((acc, permission) => {
      (acc[permission.group] = acc[permission.group] || []).push(permission);
      return acc;
    }, {} as Record<string, Permission[]>);
  }, [allPermissions]);

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="sm:max-w-lg w-full">
        <SheetHeader>
          <SheetTitle>Edit Role: {role.name}</SheetTitle>
          <SheetDescription>
            Update the description and assign permissions for the role: <span className="font-semibold">{role.name}</span>. Role name cannot be changed.
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-6 flex flex-col h-[calc(100%-4rem)]">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role Name (Read-only)</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Administrator" {...field} readOnly disabled className="cursor-not-allowed bg-muted/50" />
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
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Brief description of the role" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormItem className="flex-grow flex flex-col min-h-0">
                <FormLabel>Permissions</FormLabel>
                <FormDescription>Select the permissions this role should have.</FormDescription>
                {isLoadingPermissions && allPermissions.length === 0 ? (
                    <p>Loading permissions...</p>
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
                                                return checked
                                                ? field.onChange([...(field.value || []), permission.id])
                                                : field.onChange(
                                                    (field.value || []).filter(
                                                        (value) => value !== permission.id
                                                    )
                                                    );
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
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </SheetClose>
              <Button type="submit" disabled={form.formState.isSubmitting || (isLoadingPermissions && allPermissions.length === 0) }>
                {form.formState.isSubmitting ? "Saving..." : "Save Changes"}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
