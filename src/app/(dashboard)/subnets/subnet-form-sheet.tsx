
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
import { parseAndValidateCIDR } from "@/lib/ip-utils"; // Import the CIDR validator

const subnetFormSchema = z.object({
  cidr: z.string().min(7, "CIDR notation is too short (e.g., x.x.x.x/y)")
    .refine((val) => {
      const parsed = parseAndValidateCIDR(val);
      // For user input, we only care if it's valid CIDR, backend will normalize the IP to network address.
      // Or, if we want to be strict that the typed IP IS the network address:
      // return parsed !== null && parsed.ip === parsed.networkAddress; 
      return parsed !== null;
    }, "Invalid CIDR notation (e.g., 192.168.1.0/24). Ensure the IP is the network address for the given prefix."),
  gateway: z.string().ip({ version: "v4", message: "Invalid IPv4 gateway address" }).optional().or(z.literal('')),
  vlanId: z.string().optional(),
  description: z.string().max(200, "Description too long").optional(),
  // utilization is no longer part of the form
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
      cidr: subnet?.cidr || "",
      gateway: subnet?.gateway || "",
      vlanId: subnet?.vlanId || "",
      description: subnet?.description || "",
    },
  });
  
  React.useEffect(() => {
    if (isOpen) {
      form.reset({
        cidr: subnet?.cidr || "",
        gateway: subnet?.gateway || "",
        vlanId: subnet?.vlanId || "",
        description: subnet?.description || "",
      });
    }
  }, [isOpen, subnet, form]);


  async function onSubmit(data: SubnetFormValues) {
    try {
      const actionData = {
        cidr: data.cidr,
        gateway: data.gateway || undefined, // Ensure empty string becomes undefined
        vlanId: data.vlanId || undefined,
        description: data.description || undefined,
      };

      if (isEditing && subnet) {
        // For update, we might also pass utilization if it were editable, but it's not in this simplified form
        await updateSubnetAction(subnet.id, { ...actionData, utilization: subnet.utilization });
        toast({ title: "Subnet Updated", description: `Subnet ${data.cidr} has been successfully updated.` });
      } else {
        await createSubnetAction(actionData); // Utilization defaults to 0 in createSubnetAction
        toast({ title: "Subnet Created", description: `Subnet ${data.cidr} has been successfully created.` });
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
            {isEditing ? "Update the details of the existing subnet." : "Provide the CIDR for the new subnet (e.g., 192.168.1.0/24). Other details are optional."}
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-6">
            <FormField
              control={form.control}
              name="cidr"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Network Address (CIDR)</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., 192.168.1.0/24" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {/* Subnet Mask is now calculated from CIDR, so no input field.
                Optionally, display calculated mask and IP range here (read-only)
                For example:
                const currentCidr = form.watch("cidr");
                const [calculatedInfo, setCalculatedInfo] = React.useState<{mask: string, range: string} | null>(null);
                React.useEffect(() => {
                  const parsed = parseAndValidateCIDR(currentCidr);
                  if(parsed) {
                    setCalculatedInfo({mask: parsed.subnetMask, range: parsed.ipRange || "N/A"});
                  } else {
                    setCalculatedInfo(null);
                  }
                }, [currentCidr]);

                {calculatedInfo && (
                  <div>
                    <p>Calculated Mask: {calculatedInfo.mask}</p>
                    <p>Calculated Range: {calculatedInfo.range}</p>
                  </div>
                )}
            */}
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
