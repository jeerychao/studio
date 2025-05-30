
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
import { Edit } from "lucide-react"; // PlusCircle removed
import { useToast } from "@/hooks/use-toast";
import type { Role } from "@/types";
import { updateRoleAction } from "@/lib/actions"; // createRoleAction removed

// Schema now only validates description for editing fixed roles
const roleFormSchema = z.object({
  name: z.string(), // Name will be read-only
  description: z.string().max(200, "Description too long").optional(),
});

type RoleFormValues = z.infer<typeof roleFormSchema>;

interface RoleFormSheetProps {
  role: Role; // Role is now required as we are only editing
  children?: React.ReactNode;
  buttonProps?: ButtonProps;
}

export function RoleFormSheet({ role, children, buttonProps }: RoleFormSheetProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const { toast } = useToast();
  const isEditing = true; // This form is now only for editing

  const form = useForm<RoleFormValues>({
    resolver: zodResolver(roleFormSchema),
    defaultValues: {
      name: role?.name || "",
      description: role?.description || "",
    },
  });
  
  React.useEffect(() => {
    if (isOpen) {
        form.reset({
        name: role.name, // Always use the role prop's name
        description: role.description || "",
        });
    }
  }, [isOpen, role, form]);

  async function onSubmit(data: RoleFormValues) {
    try {
      // We only update the description. The name comes from the role prop and is not submitted for change.
      await updateRoleAction(role.id, { description: data.description });
      toast({ title: "Role Updated", description: `Description for role ${role.name} has been successfully updated.` });
      setIsOpen(false);
      // Form reset is handled by useEffect
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An unexpected error occurred.",
        variant: "destructive",
      });
    }
  }

  const trigger = children ? (
    React.cloneElement(children as React.ReactElement, { onClick: () => setIsOpen(true) })
  ) : (
    // Default trigger is an edit icon button
    <Button variant="ghost" size="icon" onClick={() => setIsOpen(true)} {...buttonProps}>
      <Edit className="h-4 w-4" />
      <span className="sr-only">Edit Role Description</span>
    </Button>
  );

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Edit Role Description</SheetTitle>
          <SheetDescription>
            Update the description for the role: <span className="font-semibold">{role.name}</span>. Role name cannot be changed.
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-6">
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
            <SheetFooter className="mt-8">
              <SheetClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </SheetClose>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Saving..." : "Save Changes"}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
