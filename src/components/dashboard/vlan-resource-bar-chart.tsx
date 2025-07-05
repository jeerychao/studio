
"use client";

import * as React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Cell as RechartsCell } from 'recharts';
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";

interface VlanResourceChartItem {
  name: string;
  "资源数": number; // This key must match dataKey in Bar component
  fill?: string;
}

interface VlanResourceBarChartProps {
  data: VlanResourceChartItem[];
}

export function VlanResourceBarChart({ data }: VlanResourceBarChartProps) {
  return (
    <ChartContainer config={{}} className="w-full h-full min-h-[200px]">
      {!data || data.length === 0 ? (
        <div className="text-center text-muted-foreground p-4 h-full flex items-center justify-center text-sm">无 VLAN 资源数据可显示。</div>
      ) : (
        <BarChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false}/>
          <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-45} textAnchor="end" height={70} />
          <YAxis allowDecimals={false} />
          <RechartsTooltip cursor={{ fill: 'hsl(var(--muted))' }} content={<ChartTooltipContent />} />
          <Bar dataKey="资源数" radius={[4, 4, 0, 0]}>
             {data.map((entry, index) => (
              <RechartsCell key={`cell-${index}`} fill={entry.fill || "hsl(var(--chart-1))"} />
            ))}
          </Bar>
        </BarChart>
      )}
    </ChartContainer>
  );
}
