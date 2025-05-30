
"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
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
import { useToast } from "@/hooks/use-toast";
import { updateOwnPasswordAction } from "@/lib/actions";
import type { User } from "@/types";
import { useCurrentUser } from "@/hooks/use-current-user";

const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required."),
  newPassword: z.string()
    .min(8, "New password must be 8-16 characters.")
    .max(16, "New password must be 8-16 characters.")
    .refine(val => /[A-Z]/.test(val), "Must include uppercase letter.")
    .refine(val => /[a-z]/.test(val), "Must include lowercase letter.")
    .refine(val => /[0-9]/.test(val), "Must include number.")
    .refine(val => /[^A-Za-z0-9]/.test(val), "Must include symbol."),
  confirmNewPassword: z.string().min(1, "Please confirm your new password."),
}).refine(data => data.newPassword === data.confirmNewPassword, {
  message: "New passwords do not match.",
  path: ["confirmNewPassword"],
});

type PasswordChangeFormValues = z.infer<typeof passwordChangeSchema>;

export function PasswordChangeForm() {
  const { toast } = useToast();
  const currentUser = useCurrentUser();

  const form = useForm<PasswordChangeFormValues>({
    resolver: zodResolver(passwordChangeSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmNewPassword: "",
    },
  });

  async function onSubmit(data: PasswordChangeFormValues) {
    if (!currentUser?.id) {
        toast({ title: "Error", description: "User not found.", variant: "destructive" });
        return;
    }
    try {
      const result = await updateOwnPasswordAction(currentUser.id, {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });

      if (result.success) {
        toast({ title: "Password Updated", description: "Your password has been successfully updated." });
        form.reset();
      } else {
        toast({ title: "Error", description: result.message || "Failed to update password.", variant: "destructive" });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An unexpected error occurred.",
        variant: "destructive",
      });
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="currentPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Current Password</FormLabel>
              <FormControl>
                <Input type="password" placeholder="Enter your current password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="newPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>New Password</FormLabel>
              <FormControl>
                <Input type="password" placeholder="Enter new password" {...field} />
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
          name="confirmNewPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirm New Password</FormLabel>
              <FormControl>
                <Input type="password" placeholder="Confirm new password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Updating..." : "Change Password"}
        </Button>
      </form>
    </Form>
  );
}
