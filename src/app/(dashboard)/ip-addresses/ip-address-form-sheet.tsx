
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
import type { IPAddress, Subnet, IPAddressStatus, VLAN } from "@/types"; // Added VLAN
import { createIPAddressAction, updateIPAddressAction, getVLANsAction } from "@/lib/actions"; // Added getVLANsAction

const ipAddressStatusOptions: IPAddressStatus[] = ["allocated", "free", "reserved"];

const ipAddressFormSchema = z.object({
  ipAddress: z.string().ip({ version: "v4", message: "Invalid IPv4 address" }),
  subnetId: z.string().optional(),
  vlanId: z.string().optional(), // Added vlanId
  status: z.enum(ipAddressStatusOptions, { required_error: "Status is required"}),
  allocatedTo: z.string().max(100, "Allocated To too long").optional(),
  description: z.string().max(200, "Description too long").optional(),
});

type IPAddressFormValues = z.infer<typeof ipAddressFormSchema>;

interface IPAddressFormSheetProps {
  ipAddress?: IPAddress;
  subnets: Subnet[];
  vlans: VLAN[]; // Added vlans prop
  currentSubnetId?: string;
  children?: React.ReactNode;
  buttonProps?: ButtonProps;
}

const NO_SUBNET_SELECTED_SENTINEL = "__NO_SUBNET_INTERNAL__";
const INHERIT_VLAN_SENTINEL = "__INHERIT_VLAN_INTERNAL__";


export function IPAddressFormSheet({ ipAddress, subnets, vlans, currentSubnetId, children, buttonProps }: IPAddressFormSheetProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const { toast } = useToast();
  const isEditing = !!ipAddress;

  const form = useForm<IPAddressFormValues>({
    resolver: zodResolver(ipAddressFormSchema),
    defaultValues: {
      ipAddress: ipAddress?.ipAddress || "",
      subnetId: ipAddress?.subnetId || currentSubnetId || "",
      vlanId: ipAddress?.vlanId || "", // Initialize vlanId
      status: ipAddress?.status || "free",
      allocatedTo: ipAddress?.allocatedTo || "",
      description: ipAddress?.description || "",
    },
  });

  React.useEffect(() => {
    if (isOpen) {
        form.reset({
            ipAddress: ipAddress?.ipAddress || "",
            subnetId: ipAddress?.subnetId || currentSubnetId || (subnets.length > 0 && !currentSubnetId ? subnets[0].id : ""),
            vlanId: ipAddress?.vlanId || "", // Reset vlanId
            status: ipAddress?.status || "free",
            allocatedTo: ipAddress?.allocatedTo || "",
            description: ipAddress?.description || "",
        });
    }
  }, [isOpen, ipAddress, subnets, currentSubnetId, form, vlans]);

  async function onSubmit(data: IPAddressFormValues) {
    try {
      if (!data.subnetId && (data.status !== 'free' || (!isEditing && currentSubnetId))) {
        toast({ title: "Subnet Required", description: "A subnet must be selected unless the IP is 'free' and not being added to a specific subnet.", variant: "destructive"});
        return;
      }

      const payload = {
        ...data,
        subnetId: data.subnetId === NO_SUBNET_SELECTED_SENTINEL ? undefined : (data.subnetId || undefined),
        vlanId: data.vlanId === INHERIT_VLAN_SENTINEL ? undefined : (data.vlanId || undefined),
      };

      if (isEditing && ipAddress) {
        await updateIPAddressAction(ipAddress.id, payload);
        toast({ title: "IP Address Updated", description: `IP ${data.ipAddress} has been successfully updated.` });
      } else {
        if (!payload.subnetId && (payload.status === 'allocated' || payload.status === 'reserved')) {
             toast({ title: "Subnet Required", description: "Please select a subnet to create an allocated or reserved IP address.", variant: "destructive"});
             return;
        }
        await createIPAddressAction(payload as Omit<IPAddress, "id">);
        toast({ title: "IP Address Created", description: `IP ${data.ipAddress} has been successfully created.` });
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
      {isEditing ? <Edit className="h-4 w-4" /> : <><PlusCircle className="mr-2 h-4 w-4" /> Add IP Address</>}
      {isEditing && <span className="sr-only">Edit IP Address</span>}
    </Button>
  );

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Edit IP Address" : "Add New IP Address"}</SheetTitle>
          <SheetDescription>
            {isEditing ? "Update the details of the existing IP address." : "Fill in the details for the new IP address."}
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 py-6">
            <FormField
              control={form.control}
              name="ipAddress"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>IP Address</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., 192.168.1.100" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="subnetId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Subnet</FormLabel>
                  <Select
                    onValueChange={(value) => field.onChange(value === NO_SUBNET_SELECTED_SENTINEL ? "" : value)}
                    value={field.value || NO_SUBNET_SELECTED_SENTINEL}
                    disabled={subnets.length === 0 && !field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={subnets.length > 0 ? "Select a subnet" : "No subnets available"} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                       <SelectItem value={NO_SUBNET_SELECTED_SENTINEL}>No Subnet / Global Pool</SelectItem>
                      {subnets.map((subnet) => (
                        <SelectItem key={subnet.id} value={subnet.id}>
                          {subnet.networkAddress} ({subnet.description || "No description"})
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
              name="vlanId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>VLAN (Optional)</FormLabel>
                  <Select
                    onValueChange={(value) => field.onChange(value === INHERIT_VLAN_SENTINEL ? "" : value)}
                    value={field.value || INHERIT_VLAN_SENTINEL}
                    disabled={vlans.length === 0 && !field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={vlans.length > 0 ? "Select a VLAN or Inherit" : "No VLANs available"} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={INHERIT_VLAN_SENTINEL}>Inherit from Subnet</SelectItem>
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
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {ipAddressStatusOptions.map((status) => (
                        <SelectItem key={status} value={status} className="capitalize">
                          {status}
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
              name="allocatedTo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Allocated To (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., John Doe's Laptop, Server-01" {...field} />
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
                    <Textarea placeholder="Brief description or note" {...field} />
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
                {form.formState.isSubmitting ? "Saving..." : (isEditing ? "Save Changes" : "Create IP Address")}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
