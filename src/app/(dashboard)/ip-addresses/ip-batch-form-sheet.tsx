
"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, PlusCircle } from "lucide-react"; // Added PlusCircle for potential standalone trigger
import { useToast } from "@/hooks/use-toast";
import type { Subnet, VLAN, IPAddressStatus } from "@/types";
import { batchCreateIPAddressesAction, type BatchIpCreationResult } from "@/lib/actions";
import { ipToNumber } from "@/lib/ip-utils"; // For startIp <= endIp validation

const INHERIT_VLAN_SENTINEL = "__INHERIT_VLAN_INTERNAL__";
const ipAddressStatusOptions: IPAddressStatus[] = ["allocated", "free", "reserved"];


const ipBatchFormSchema = z.object({
  startIp: z.string().ip({ version: "v4", message: "Invalid start IPv4 address" }),
  endIp: z.string().ip({ version: "v4", message: "Invalid end IPv4 address" }),
  subnetId: z.string().min(1, "Subnet is required"),
  vlanId: z.string().optional(), // Can be empty or INHERIT_VLAN_SENTINEL
  commonDescription: z.string().max(200, "Description too long").optional(),
  status: z.enum(ipAddressStatusOptions, { required_error: "Status is required"}),
}).refine(data => {
    try {
        return ipToNumber(data.startIp) <= ipToNumber(data.endIp);
    } catch (e) {
        return false; // if ipToNumber throws, consider it invalid for this comparison
    }
}, {
  message: "Start IP must be less than or equal to End IP.",
  path: ["endIp"],
});

type IpBatchFormValues = z.infer<typeof ipBatchFormSchema>;

interface IPBatchFormSheetProps {
  subnets: Subnet[];
  vlans: VLAN[];
  children?: React.ReactNode; // Trigger button
  onIpAddressChange?: () => void;
}

export function IPBatchFormSheet({ subnets, vlans, children, onIpAddressChange }: IPBatchFormSheetProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [submissionResult, setSubmissionResult] = React.useState<BatchIpCreationResult | null>(null);
  const { toast } = useToast();

  const form = useForm<IpBatchFormValues>({
    resolver: zodResolver(ipBatchFormSchema),
    defaultValues: {
      startIp: "",
      endIp: "",
      subnetId: subnets.length > 0 ? subnets[0].id : "",
      vlanId: INHERIT_VLAN_SENTINEL,
      commonDescription: "",
      status: "free",
    },
  });
  
  React.useEffect(() => {
    if (isOpen) {
        form.reset({
            startIp: "",
            endIp: "",
            subnetId: subnets.length > 0 ? subnets[0].id : "",
            vlanId: INHERIT_VLAN_SENTINEL,
            commonDescription: "",
            status: "free",
        });
        setSubmissionResult(null);
    }
  }, [isOpen, subnets, form]);


  async function onSubmit(data: IpBatchFormValues) {
    setSubmissionResult(null);

    const vlanIdToSubmit = data.vlanId === INHERIT_VLAN_SENTINEL ? undefined : data.vlanId;

    const payload = {
        startIp: data.startIp,
        endIp: data.endIp,
        subnetId: data.subnetId,
        vlanId: vlanIdToSubmit,
        description: data.commonDescription || undefined,
        status: data.status,
    };
    
    const startNum = ipToNumber(data.startIp);
    const endNum = ipToNumber(data.endIp);
    if (endNum - startNum + 1 > 256) { // Limit batch size to prevent performance issues/abuse
        toast({ title: "Range Too Large", description: "Please create IP addresses in smaller batches (e.g., up to 256 at a time).", variant: "destructive" });
        return;
    }


    try {
      const result = await batchCreateIPAddressesAction(payload);
      setSubmissionResult(result);

      if (result.successCount > 0) {
        toast({
          title: "Batch Processing Complete",
          description: `${result.successCount} IP(s) created successfully. ${result.failureDetails.length > 0 ? `${result.failureDetails.length} failed.` : ''}`,
        });
        if (onIpAddressChange) onIpAddressChange();
      } else if (result.failureDetails.length > 0) {
         toast({
          title: "Batch Creation Failed",
          description: "All entries failed. Check details below.",
          variant: "destructive",
        });
      }
      
      // Do not close if there are failures, so user can see them.
      // if (result.failureDetails.length === 0 && result.successCount > 0) {
      //   setIsOpen(false); 
      //   form.reset(); 
      // }

    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An unexpected error occurred during batch creation.",
        variant: "destructive",
      });
      setSubmissionResult({ successCount: 0, failureDetails: [{ ipAttempted: data.startIp, error: (error as Error).message }] });
    }
  }
  
  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
        form.reset();
        setSubmissionResult(null);
    }
  };

  const triggerContent = children || (
    <Button variant="outline">
      <PlusCircle className="mr-2 h-4 w-4" /> Batch Add IPs
    </Button>
  );

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>{triggerContent}</SheetTrigger>
      <SheetContent className="sm:max-w-lg w-full flex flex-col">
        <SheetHeader>
          <SheetTitle>Batch Add IP Addresses (Range)</SheetTitle>
          <SheetDescription>
            Enter a start and end IP address to create a range. Select a subnet.
            Other fields are optional or have defaults.
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3 py-4 flex-grow flex flex-col">
            <FormField
              control={form.control}
              name="startIp"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Start IP Address</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., 192.168.1.10" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="endIp"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>End IP Address</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., 192.168.1.20" {...field} />
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
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={subnets.length === 0}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={subnets.length > 0 ? "Select a subnet" : "No subnets available"} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {subnets.map((subnet) => (
                        <SelectItem key={subnet.id} value={subnet.id}>
                          {subnet.cidr} ({subnet.description || "No description"})
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
                    onValueChange={(value) => field.onChange(value)}
                    value={field.value || INHERIT_VLAN_SENTINEL}
                    disabled={vlans.length === 0 && field.value !== INHERIT_VLAN_SENTINEL}
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
                  <FormLabel>Status for all IPs</FormLabel>
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
              name="commonDescription"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Common Description (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Batch created devices" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {submissionResult && (
              <div className="mt-4 space-y-3">
                <h3 className="font-semibold">Processing Results:</h3>
                <Alert variant={submissionResult.failureDetails.length > 0 ? "destructive" : "default"}>
                   <AlertCircle className="h-4 w-4"/>
                  <AlertTitle>Summary</AlertTitle>
                  <AlertDescription>
                    Successfully created: {submissionResult.successCount} IP(s).
                    <br />
                    Failed attempts: {submissionResult.failureDetails.length}.
                  </AlertDescription>
                </Alert>

                {submissionResult.failureDetails.length > 0 && (
                  <div>
                    <h4 className="font-medium">Failure Details:</h4>
                    <ScrollArea className="h-[120px] mt-1 rounded-md border p-2">
                      <ul className="space-y-1 text-sm">
                        {submissionResult.failureDetails.map((failure, index) => (
                          <li key={index} className="text-destructive">
                            IP {failure.ipAttempted}: {failure.error}
                          </li>
                        ))}
                      </ul>
                    </ScrollArea>
                  </div>
                )}
              </div>
            )}

            <SheetFooter className="mt-auto pt-4">
              <SheetClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </SheetClose>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Processing..." : "Create IP Addresses"}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
