
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PlusCircle, Edit } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { User, Role } from "@/types";
import { createUserAction, updateUserAction } from "@/lib/actions";
import { ADMIN_ROLE_ID } from "@/lib/data"; // For role logic if needed

const userFormSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters").max(50, "Username too long"),
  email: z.string().email("Invalid email address"),
  roleId: z.string().min(1, "Role is required"),
  password: z.preprocess(
    (val) => (val === "" ? undefined : val),
    z.string()
      .min(8, "Password must be 8-16 characters.")
      .max(16, "Password must be 8-16 characters.")
      .refine(val => /[A-Z]/.test(val), "Must include uppercase letter.")
      .refine(val => /[a-z]/.test(val), "Must include lowercase letter.")
      .refine(val => /[0-9]/.test(val), "Must include number.")
      .refine(val => /[^A-Za-z0-9]/.test(val), "Must include symbol.")
      .optional()
  ),
  confirmPassword: z.string().optional().transform(e => e === "" ? undefined : e),
})
.superRefine((data, ctx) => {
  if (data.password && data.password !== "") { // If a new password is being set
    if (!data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Please confirm your new password.",
        path: ["confirmPassword"],
      });
    } else if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Passwords do not match.",
        path: ["confirmPassword"],
      });
    }
  }
});


type UserFormValues = z.infer<typeof userFormSchema>;

interface UserFormSheetProps {
  user?: User;
  roles: Role[];
  children?: React.ReactNode;
  buttonProps?: ButtonProps;
}

export function UserFormSheet({ user, roles, children, buttonProps }: UserFormSheetProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const { toast } = useToast();
  const isEditing = !!user;

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: {
      username: "",
      email: "",
      roleId: roles.find(r => r.name === 'Viewer')?.id || roles[0]?.id || "", 
      password: "",
      confirmPassword: "",
    },
  });

  React.useEffect(() => {
    if (isOpen) {
        form.reset({
        username: user?.username || "",
        email: user?.email || "",
        roleId: user?.roleId || (roles.find(r => r.name === 'Viewer')?.id || roles[0]?.id || ""),
        password: "", 
        confirmPassword: "",
        });
    }
  }, [isOpen, user, roles, form]);

  async function onSubmit(data: UserFormValues) {
    if (!isEditing && !data.password) {
        form.setError("password", { type: "manual", message: "Password is required for new users." });
        toast({ title: "Password Required", description: "Password is required for new users.", variant: "destructive" });
        return;
    }

    const payload: Partial<User> & { password?: string } = {
      username: data.username,
      email: data.email,
      roleId: data.roleId,
    };

    if (data.password) { 
      payload.password = data.password;
    }

    try {
      if (isEditing && user) {
        await updateUserAction(user.id, payload);
        let toastDescription = `User ${data.username} has been successfully updated.`;
        if (payload.password) {
          toastDescription += " Password has been changed.";
        }
        toast({ title: "User Updated", description: toastDescription });
      } else {
        if (!payload.password) {
            toast({ title: "Password Error", description: "Password is unexpectedly missing for new user.", variant: "destructive" });
            return;
        }
        await createUserAction(payload as Omit<User, "id" | "avatar" | "lastLogin"> & { password: string });
        toast({ title: "User Created", description: `User ${data.username} has been successfully created.` });
      }
      setIsOpen(false);
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
    <Button variant={isEditing ? "ghost" : "default"} size={isEditing ? "icon" : "default"} onClick={() => setIsOpen(true)} {...buttonProps}>
      {isEditing ? <Edit className="h-4 w-4" /> : <><PlusCircle className="mr-2 h-4 w-4" /> Add User</>}
      {isEditing && <span className="sr-only">Edit User</span>}
    </Button>
  );

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Edit User" : "Add New User"}</SheetTitle>
          <SheetDescription>
            {isEditing ? "Update the user's details. Leave password fields blank to keep current password." : "Fill in the details for the new user."}
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-6">
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., johndoe" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="e.g., user@example.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="roleId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={roles.length === 0}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={roles.length > 0 ? "Select a role" : "No roles available"} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {roles.map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.name}
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
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{isEditing ? "New Password (Optional)" : "Password"}</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder={isEditing ? "Leave blank to keep current" : "Enter password"} {...field} />
                  </FormControl>
                  <FormDescription>
                    8-16 characters. Must include uppercase, lowercase, number, and symbol.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm Password</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder={isEditing && !form.getValues().password ? "Leave blank to keep current" : "Confirm new password"} {...field} />
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
                {form.formState.isSubmitting ? "Saving..." : (isEditing ? "Save Changes" : "Create User")}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
