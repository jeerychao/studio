
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
import { Textarea } from "@/components/ui/textarea"; // Kept for description, but main input is now Input fields
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, PlusCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { batchCreateVLANsAction, type BatchVlanCreationResult } from "@/lib/actions";

const vlanBatchFormSchema = z.object({
  startVlanNumber: z.coerce.number().int().min(1, "Start VLAN number must be at least 1").max(4094, "Start VLAN number cannot exceed 4094"),
  endVlanNumber: z.coerce.number().int().min(1, "End VLAN number must be at least 1").max(4094, "End VLAN number cannot exceed 4094"),
  commonDescription: z.string().max(200, "Description too long").optional(),
}).refine(data => data.startVlanNumber <= data.endVlanNumber, {
  message: "Start VLAN number must be less than or equal to End VLAN number.",
  path: ["endVlanNumber"],
});

type VlanBatchFormValues = z.infer<typeof vlanBatchFormSchema>;

interface VlanBatchFormSheetProps {
  children?: React.ReactNode; // Optional trigger button
  onVlanChange?: () => void;
}

export function VlanBatchFormSheet({ children, onVlanChange }: VlanBatchFormSheetProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [submissionResult, setSubmissionResult] = React.useState<BatchVlanCreationResult | null>(null);
  const { toast } = useToast();

  const form = useForm<VlanBatchFormValues>({
    resolver: zodResolver(vlanBatchFormSchema),
    defaultValues: {
      startVlanNumber: undefined,
      endVlanNumber: undefined,
      commonDescription: "",
    },
  });

  async function onSubmit(data: VlanBatchFormValues) {
    setSubmissionResult(null); 

    const vlansToCreate = [];
    for (let i = data.startVlanNumber; i <= data.endVlanNumber; i++) {
      vlansToCreate.push({ 
        vlanNumber: i, 
        description: data.commonDescription || undefined 
      });
    }

    if (vlansToCreate.length === 0) {
      toast({ title: "No VLANs to Create", description: "The specified range is empty or invalid.", variant: "destructive" });
      return;
    }
     if (vlansToCreate.length > 100) { // Arbitrary limit to prevent abuse / performance issues
      toast({ title: "Range Too Large", description: "Please create VLANs in smaller batches (e.g., up to 100 at a time).", variant: "destructive" });
      return;
    }


    try {
      const result = await batchCreateVLANsAction(vlansToCreate);
      setSubmissionResult(result);

      if (result.successCount > 0) {
        toast({
          title: "Batch Processing Complete",
          description: `${result.successCount} VLAN(s) created successfully. ${result.failureDetails.length > 0 ? `${result.failureDetails.length} failed.` : ''}`,
        });
        if (onVlanChange) onVlanChange();
      } else if (result.failureDetails.length > 0) {
         toast({
          title: "Batch Creation Failed",
          description: "All entries failed. Check details below.",
          variant: "destructive",
        });
      }

      if (result.failureDetails.length === 0 && result.successCount > 0) {
        form.reset(); 
        // Keep sheet open if there were failures, so user can see them.
        // setIsOpen(false); // Only close if fully successful and desired.
      }

    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An unexpected error occurred during batch creation.",
        variant: "destructive",
      });
      setSubmissionResult({ successCount: 0, failureDetails: [{ vlanNumberAttempted: data.startVlanNumber, error: (error as Error).message }] });
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
      <PlusCircle className="mr-2 h-4 w-4" /> Batch Add VLANs
    </Button>
  );


  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>{triggerContent}</SheetTrigger>
      <SheetContent className="sm:max-w-md w-full flex flex-col">
        <SheetHeader>
          <SheetTitle>Batch Add VLANs (Range)</SheetTitle>
          <SheetDescription>
            Enter a start and end VLAN number to create a range of VLANs.
            An optional common description can be applied to all.
            VLAN numbers must be between 1 and 4094.
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4 flex-grow flex flex-col">
            <FormField
              control={form.control}
              name="startVlanNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Start VLAN Number</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="e.g., 100" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="endVlanNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>End VLAN Number</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="e.g., 110" {...field} />
                  </FormControl>
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
                    <Input placeholder="e.g., User VLANs Floor 1" {...field} />
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
                    Successfully created: {submissionResult.successCount} VLAN(s).
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
                            VLAN {failure.vlanNumberAttempted}: {failure.error}
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
                {form.formState.isSubmitting ? "Processing..." : "Create VLANs"}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
