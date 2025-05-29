
"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription as ShadFormDescription } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { BrainCircuit, Lightbulb } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { suggestSubnetAIAction } from "@/lib/actions";
import type { AISuggestionResponse, ExistingSubnetInput } from "@/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

const subnetSuggestionFormSchema = z.object({
  existingSubnetsText: z.string().min(1, "Existing subnets information is required.")
    .refine((data) => {
      try {
        const parsed = JSON.parse(data);
        if (!Array.isArray(parsed)) return false;
        return parsed.every(item => 
          typeof item.networkAddress === 'string' &&
          typeof item.utilization === 'number' &&
          item.utilization >= 0 && item.utilization <= 100
        );
      } catch (e) {
        return false;
      }
    }, "Must be a valid JSON array of {networkAddress: string, utilization: number} objects."),
  newSegmentDescription: z.string().min(10, "Please provide a detailed description (min 10 characters).").max(500, "Description too long."),
});

type SubnetSuggestionFormValues = z.infer<typeof subnetSuggestionFormSchema>;

export default function SubnetSuggestionPage() {
  const [isLoading, setIsLoading] = React.useState(false);
  const [suggestion, setSuggestion] = React.useState<AISuggestionResponse | null>(null);
  const { toast } = useToast();

  const form = useForm<SubnetSuggestionFormValues>({
    resolver: zodResolver(subnetSuggestionFormSchema),
    defaultValues: {
      existingSubnetsText: JSON.stringify([{ networkAddress: "192.168.0.0/22", utilization: 65 }, { networkAddress: "10.10.0.0/16", utilization: 40 }], null, 2),
      newSegmentDescription: "New development lab requiring support for up to 50 devices, including test servers, workstations, and IoT devices. Prioritize isolation and future scalability.",
    },
  });

  async function onSubmit(data: SubnetSuggestionFormValues) {
    setIsLoading(true);
    setSuggestion(null);
    try {
      // The schema validation ensures existingSubnetsText is valid JSON parsable to ExistingSubnetInput[]
      // The AI flow itself expects a string for existingSubnets, so we pass data.existingSubnetsText directly
      const result = await suggestSubnetAIAction({
        existingSubnets: data.existingSubnetsText,
        newSegmentDescription: data.newSegmentDescription,
      });
      setSuggestion(result);
      toast({ title: "Suggestion Ready", description: "AI has provided a subnet recommendation." });
    } catch (error) {
      toast({
        title: "Error Generating Suggestion",
        description: error instanceof Error ? error.message : "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <PageHeader
        title="AI Subnet Suggestion"
        description="Leverage AI to recommend optimal subnet configurations for new network segments."
        icon={BrainCircuit}
      />
      <div className="grid md:grid-cols-2 gap-8 items-start">
        <Card>
          <CardHeader>
            <CardTitle>Network Details</CardTitle>
            <CardDescription>Provide information about your existing network and the new segment requirements.</CardDescription>
          </CardHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <CardContent className="space-y-6">
                <FormField
                  control={form.control}
                  name="existingSubnetsText"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Existing Subnets (JSON format)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder='[{"networkAddress": "192.168.0.0/24", "utilization": 70}, ...]'
                          className="min-h-[150px] font-mono text-sm"
                          {...field}
                        />
                      </FormControl>
                      <ShadFormDescription>
                        Provide a JSON array of objects, each with `networkAddress` (CIDR notation) and `utilization` (0-100).
                      </ShadFormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="newSegmentDescription"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New Segment Requirements</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Describe the purpose, number of devices, growth expectations, etc."
                          className="min-h-[100px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
              <CardFooter>
                <Button type="submit" disabled={isLoading} className="w-full">
                  {isLoading ? "Analyzing..." : <><Lightbulb className="mr-2 h-4 w-4" /> Get Suggestion</>}
                </Button>
              </CardFooter>
            </form>
          </Form>
        </Card>

        <Card className="sticky top-20"> {/* Make suggestion card sticky */}
          <CardHeader>
            <CardTitle>AI Recommendation</CardTitle>
            <CardDescription>The AI's suggestion will appear here.</CardDescription>
          </CardHeader>
          <CardContent className="min-h-[200px]"> {/* Ensure minimum height */}
            {isLoading && (
              <div className="space-y-4">
                <Skeleton className="h-8 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-full" />
                 <Skeleton className="h-4 w-1/2" />
              </div>
            )}
            {!isLoading && suggestion && (
              <Alert>
                <BrainCircuit className="h-4 w-4" />
                <AlertTitle>Suggested Configuration</AlertTitle>
                <AlertDescription className="space-y-3 mt-2">
                  <div>
                    <p className="font-semibold">Subnet Address:</p>
                    <p className="font-mono bg-muted p-2 rounded-md text-sm">{suggestion.suggestedSubnet.subnetAddress}</p>
                  </div>
                  <div>
                    <p className="font-semibold">IP Range:</p>
                    <p className="font-mono bg-muted p-2 rounded-md text-sm">{suggestion.suggestedSubnet.ipRange}</p>
                  </div>
                  <div>
                    <p className="font-semibold">Justification:</p>
                    <p className="text-sm leading-relaxed">{suggestion.justification}</p>
                  </div>
                </AlertDescription>
              </Alert>
            )}
            {!isLoading && !suggestion && (
              <p className="text-muted-foreground text-center py-10">Fill out the form and click "Get Suggestion" to see results.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
