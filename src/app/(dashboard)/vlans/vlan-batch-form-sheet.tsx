
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
  FormDescription,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { batchCreateVLANsAction, type BatchVlanCreationResult } from "@/lib/actions";

const vlanBatchFormSchema = z.object({
  vlanData: z.string().min(1, "VLAN data cannot be empty."),
});

type VlanBatchFormValues = z.infer<typeof vlanBatchFormSchema>;

interface VlanBatchFormSheetProps {
  children: React.ReactNode; // Trigger button
  onVlanChange?: () => void;
}

interface ProcessedVLANInput {
  vlanNumber: number;
  description?: string;
  originalLine: string;
}

export function VlanBatchFormSheet({ children, onVlanChange }: VlanBatchFormSheetProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [submissionResult, setSubmissionResult] = React.useState<BatchVlanCreationResult | null>(null);
  const { toast } = useToast();

  const form = useForm<VlanBatchFormValues>({
    resolver: zodResolver(vlanBatchFormSchema),
    defaultValues: {
      vlanData: "",
    },
  });

  const parseVlanData = (data: string): ProcessedVLANInput[] => {
    return data
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        const parts = line.split(",");
        const vlanNumberStr = parts[0]?.trim();
        const description = parts.slice(1).join(",").trim() || undefined;
        const vlanNumber = parseInt(vlanNumberStr, 10);
        return { vlanNumber, description, originalLine: line };
      });
  };

  async function onSubmit(data: VlanBatchFormValues) {
    setSubmissionResult(null); // Clear previous results
    const parsedVlans = parseVlanData(data.vlanData);

    if (parsedVlans.length === 0) {
      form.setError("vlanData", { message: "No valid VLAN entries found to process." });
      return;
    }

    // Preliminary client-side validation for VLAN number format
    const invalidFormatEntries = parsedVlans.filter(v => isNaN(v.vlanNumber) || v.vlanNumber < 1 || v.vlanNumber > 4094);
    if (invalidFormatEntries.length > 0) {
      const errorMessages = invalidFormatEntries.map(v => `Invalid format or VLAN number out of range (1-4094) on line: "${v.originalLine}"`).join("\n");
      setSubmissionResult({
        successCount: 0,
        failureDetails: invalidFormatEntries.map(v => ({
            inputLine: v.originalLine,
            vlanNumber: isNaN(v.vlanNumber) ? undefined : v.vlanNumber,
            error: `Invalid VLAN number format or out of range (1-4094).`
        })),
      });
      toast({ title: "Validation Error", description: "Some entries have formatting issues.", variant: "destructive"});
      return;
    }
    
    const vlansToCreate = parsedVlans.map(({ vlanNumber, description }) => ({ vlanNumber, description }));

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
        setIsOpen(false); // Close sheet only if all were successful
        form.reset(); // Reset form on full success
      }

    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An unexpected error occurred during batch creation.",
        variant: "destructive",
      });
      setSubmissionResult({ successCount: 0, failureDetails: [{ inputLine: "Batch Operation", error: (error as Error).message }] });
    }
  }
  
  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
        // Reset form and results when sheet is closed manually
        form.reset();
        setSubmissionResult(null);
    }
  };


  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent className="sm:max-w-md w-full flex flex-col">
        <SheetHeader>
          <SheetTitle>Batch Add VLANs</SheetTitle>
          <SheetDescription>
            Enter VLAN data, one entry per line. Format: <code>VLAN_NUMBER,Description</code>
            <br />
            Example: <code>100,Sales Department</code> or just <code>101</code> for a VLAN without a description.
            VLAN numbers must be between 1 and 4094.
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-4 flex-grow flex flex-col">
            <FormField
              control={form.control}
              name="vlanData"
              render={({ field }) => (
                <FormItem className="flex-grow flex flex-col">
                  <FormLabel>VLAN Entries</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="10,VLAN for Marketing\n11,VLAN for Engineering\n12"
                      className="min-h-[150px] flex-grow resize-none"
                      {...field}
                    />
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
                    Failed entries: {submissionResult.failureDetails.length}.
                  </AlertDescription>
                </Alert>

                {submissionResult.failureDetails.length > 0 && (
                  <div>
                    <h4 className="font-medium">Failure Details:</h4>
                    <ScrollArea className="h-[120px] mt-1 rounded-md border p-2">
                      <ul className="space-y-1 text-sm">
                        {submissionResult.failureDetails.map((failure, index) => (
                          <li key={index} className="text-destructive">
                            Line: "<code>{failure.inputLine}</code>" - Error: {failure.error}
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
