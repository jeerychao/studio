
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

const userFormSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters").max(50, "Username too long"),
  email: z.string().email("Invalid email address"),
  roleId: z.string().min(1, "Role is required"),
  // Treat empty strings as undefined for optional fields, makes Zod validation cleaner
  password: z.string().optional().transform(e => e === "" ? undefined : e),
  confirmPassword: z.string().optional().transform(e => e === "" ? undefined : e),
})
.refine((data) => { // Ensure passwords match if a password is provided
  return data.password === data.confirmPassword;
}, {
  message: "Passwords do not match",
  path: ["confirmPassword"], 
})
.refine((data) => { // Ensure password length if a password is provided
  if (data.password && data.password.length > 0) { // Check only if password is not empty
    return data.password.length >= 8;
  }
  return true; // No password provided or empty string, so length rule doesn't apply here
}, {
  message: "Password must be at least 8 characters long.",
  path: ["password"], 
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
      username: user?.username || "",
      email: user?.email || "",
      roleId: user?.roleId || "",
      password: "",
      confirmPassword: "",
    },
  });

  React.useEffect(() => {
    if (isOpen) {
        form.reset({
        username: user?.username || "",
        email: user?.email || "",
        roleId: user?.roleId || (roles.length > 0 ? roles[0].id : ""),
        password: "", 
        confirmPassword: "",
        });
    }
  }, [isOpen, user, roles, form]);

  async function onSubmit(data: UserFormValues) {
    // Password is required for new users - Zod schema handles length and match if provided.
    if (!isEditing && (!data.password || data.password.length === 0)) {
        form.setError("password", { type: "manual", message: "Password is required for new users." });
        toast({ title: "Password Required", description: "Password is required for new users.", variant: "destructive" });
        return;
    }
    // Zod schema now handles:
    // 1. Password match (if confirmPassword is provided)
    // 2. Password length (if password is provided and not empty)

    const payload: Partial<User> & { password?: string } = {
      username: data.username,
      email: data.email,
      roleId: data.roleId,
    };

    if (data.password && data.password.length > 0) {
      payload.password = data.password;
    }

    try {
      if (isEditing && user) {
        await updateUserAction(user.id, payload);
        toast({ title: "User Updated", description: `User ${data.username} has been successfully updated.` });
      } else {
        await createUserAction(payload as Omit<User, "id" | "avatar" | "lastLogin"> & { password: string });
        toast({ title: "User Created", description: `User ${data.username} has been successfully created.` });
      }
      setIsOpen(false);
      form.reset(); 
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
                  <Select onValueChange={field.onChange} defaultValue={field.value} disabled={roles.length === 0}>
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
                    Password must be at least 8 characters long.
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

