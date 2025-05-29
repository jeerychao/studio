// src/ai/flows/suggest-subnet.ts
'use server';

/**
 * @fileOverview An AI-powered tool to suggest optimal subnet sizes and IP ranges for new network segments.
 *
 * - suggestSubnet - A function that handles the subnet suggestion process.
 * - SuggestSubnetInput - The input type for the suggestSubnet function.
 * - SuggestSubnetOutput - The return type for the suggestSubnet function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestSubnetInputSchema = z.object({
  existingSubnets: z
    .string()
    .describe(
      'A JSON array of existing subnets in the network, including their network address, subnet mask, and utilization percentage.'
    ),
  newSegmentDescription: z
    .string()
    .describe(
      'A description of the new network segment, including the number of devices it needs to support and its purpose.'
    ),
});
export type SuggestSubnetInput = z.infer<typeof SuggestSubnetInputSchema>;

const SuggestSubnetOutputSchema = z.object({
  suggestedSubnet: z
    .string()
    .describe(
      'A JSON object containing the suggested subnet address, subnet mask, and IP range for the new network segment.'
    ),
  justification: z
    .string()
    .describe(
      'A detailed explanation of why the suggested subnet configuration is optimal, considering subnetting best practices and utilization patterns.'
    ),
});
export type SuggestSubnetOutput = z.infer<typeof SuggestSubnetOutputSchema>;

export async function suggestSubnet(input: SuggestSubnetInput): Promise<SuggestSubnetOutput> {
  return suggestSubnetFlow(input);
}

const prompt = ai.definePrompt({
  name: 'suggestSubnetPrompt',
  input: {schema: SuggestSubnetInputSchema},
  output: {schema: SuggestSubnetOutputSchema},
  prompt: `You are an expert network engineer specializing in subnetting and IP address management.

You will analyze the existing network configuration and the requirements for a new network segment to suggest an optimal subnet size and IP range.
Consider subnetting best practices, such as leaving room for future expansion, and utilization patterns from the existing subnets.

Existing Subnets:
{{{existingSubnets}}}

New Segment Description:
{{{newSegmentDescription}}}

Based on this information, provide a suggested subnet configuration in JSON format and a detailed justification.
Ensure the JSON is valid and can be parsed without errors.

Output the suggested subnet configuration and justification as a JSON object with the following keys:

{
  "suggestedSubnet": {
    "subnetAddress": "Suggested subnet address in CIDR notation (e.g., 192.168.10.0/24)",
    "ipRange": "The usable IP range for this subnet (e.g., 192.168.10.1 - 192.168.10.254)"
  },
  "justification": "Detailed explanation of why this subnet configuration is optimal"
}
`,
});

const suggestSubnetFlow = ai.defineFlow(
  {
    name: 'suggestSubnetFlow',
    inputSchema: SuggestSubnetInputSchema,
    outputSchema: SuggestSubnetOutputSchema,
  },
  async input => {
    try {
      JSON.parse(input.existingSubnets);
    } catch (e) {
      throw new Error('Invalid JSON provided for existing subnets.');
    }

    const {output} = await prompt(input);
    return output!;
  }
);
