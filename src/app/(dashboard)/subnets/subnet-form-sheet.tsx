
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

const subnetFormSchema = z.object({
  networkAddress: z.string().ip({ version: "v4", message: "Invalid IPv4 network address" }),
  subnetMask: z.string().ip({ version: "v4", message: "Invalid IPv4 subnet mask" }),
  gateway: z.string().ip({ version: "v4", message: "Invalid IPv4 gateway address" }).optional().or(z.literal('')),
  vlanId: z.string().optional(),
  description: z.string().max(200, "Description too long").optional(),
  utilization: z.coerce.number().min(0).max(100).optional(),
});

type SubnetFormValues = z.infer<typeof subnetFormSchema>;

interface SubnetFormSheetProps {
  subnet?: Subnet;
  vlans: VLAN[];
  children?: React.ReactNode; // For custom trigger
  buttonProps?: ButtonProps; // For default trigger styling
}

const NO_VLAN_SENTINEL_VALUE = "__NO_VLAN_INTERNAL__";

export function SubnetFormSheet({ subnet, vlans, children, buttonProps }: SubnetFormSheetProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const { toast } = useToast();
  const isEditing = !!subnet;

  const form = useForm<SubnetFormValues>({
    resolver: zodResolver(subnetFormSchema),
    defaultValues: {
      networkAddress: subnet?.networkAddress || "",
      subnetMask: subnet?.subnetMask || "",
      gateway: subnet?.gateway || "",
      vlanId: subnet?.vlanId || "",
      description: subnet?.description || "",
      utilization: subnet?.utilization || 0,
    },
  });
  
  React.useEffect(() => {
    if (isOpen) {
      form.reset({
        networkAddress: subnet?.networkAddress || "",
        subnetMask: subnet?.subnetMask || "",
        gateway: subnet?.gateway || "",
        vlanId: subnet?.vlanId || "",
        description: subnet?.description || "",
        utilization: subnet?.utilization || 0,
      });
    }
  }, [isOpen, subnet, form]);


  async function onSubmit(data: SubnetFormValues) {
    try {
      if (isEditing && subnet) {
        await updateSubnetAction(subnet.id, data);
        toast({ title: "Subnet Updated", description: `Subnet ${data.networkAddress} has been successfully updated.` });
      } else {
        await createSubnetAction(data);
        toast({ title: "Subnet Created", description: `Subnet ${data.networkAddress} has been successfully created.` });
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
      {isEditing ? <Edit className="h-4 w-4" /> : <><PlusCircle className="mr-2 h-4 w-4" /> Add Subnet</>}
      {isEditing && <span className="sr-only">Edit Subnet</span>}
    </Button>
  );

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Edit Subnet" : "Add New Subnet"}</SheetTitle>
          <SheetDescription>
            {isEditing ? "Update the details of the existing subnet." : "Fill in the details for the new subnet."}
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-6">
            <FormField
              control={form.control}
              name="networkAddress"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Network Address</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., 192.168.1.0" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="subnetMask"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Subnet Mask</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., 255.255.255.0" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="gateway"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Gateway (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., 192.168.1.1" {...field} />
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
                  <FormLabel>VLAN (Optional)</FormLabel>
                  <Select
                    onValueChange={(value) => {
                      if (value === NO_VLAN_SENTINEL_VALUE) {
                        field.onChange(""); // Update react-hook-form with empty string
                      } else {
                        field.onChange(value);
                      }
                    }}
                    value={field.value === "" ? NO_VLAN_SENTINEL_VALUE : field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a VLAN" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NO_VLAN_SENTINEL_VALUE}>No VLAN</SelectItem>
                      {vlans.map((vlan) => (
                        <SelectItem key={vlan.id} value={vlan.id}>
                          VLAN {vlan.vlanNumber} ({vlan.description || "No description"})
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
              name="utilization"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Utilization (%) (Optional)</FormLabel>
                  <FormControl>
                    <Input type="number" min="0" max="100" placeholder="e.g., 60" {...field} />
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
                    <Textarea placeholder="Brief description of the subnet" {...field} />
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
                {form.formState.isSubmitting ? "Saving..." : (isEditing ? "Save Changes" : "Create Subnet")}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
