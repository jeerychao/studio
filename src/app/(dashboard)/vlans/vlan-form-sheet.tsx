
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
  vlanNumber: z.coerce.number().int().min(1, "VLAN number must be at least 1").max(4094, "VLAN number cannot exceed 4094"),
  description: z.string().max(200, "Description too long").optional(),
});

type VlanFormValues = z.infer<typeof vlanFormSchema>;

interface VlanFormSheetProps {
  vlan?: VLAN;
  children?: React.ReactNode; // For custom trigger
  buttonProps?: ButtonProps;
}

export function VlanFormSheet({ vlan, children, buttonProps }: VlanFormSheetProps) {
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
        toast({ title: "VLAN Updated", description: `VLAN ${data.vlanNumber} has been successfully updated.` });
      } else {
        await createVLANAction(data);
        toast({ title: "VLAN Created", description: `VLAN ${data.vlanNumber} has been successfully created.` });
      }
      setIsOpen(false);
      form.reset({ vlanNumber: undefined, description: "" }); // Reset to truly empty for next "Add"
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
      {isEditing ? <Edit className="h-4 w-4" /> : <><PlusCircle className="mr-2 h-4 w-4" /> Add VLAN</>}
      {isEditing && <span className="sr-only">Edit VLAN</span>}
    </Button>
  );


  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Edit VLAN" : "Add New VLAN"}</SheetTitle>
          <SheetDescription>
            {isEditing ? "Update the details of the existing VLAN." : "Fill in the details for the new VLAN."}
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-6">
            <FormField
              control={form.control}
              name="vlanNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>VLAN Number</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="e.g., 10" {...field} />
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
                    <Textarea placeholder="Brief description of the VLAN" {...field} />
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
                {form.formState.isSubmitting ? "Saving..." : (isEditing ? "Save Changes" : "Create VLAN")}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
