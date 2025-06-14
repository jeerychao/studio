
"use client";

import * as React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Cell as RechartsCell } from 'recharts';
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import type { TopNItemCount } from "@/types";

interface UsageBarChartProps {
  data: TopNItemCount[];
  dataKey: string;
  layout?: "horizontal" | "vertical";
  yAxisWidth?: number;
  barRadius?: [number, number, number, number];
  chartMargin?: { top?: number; right?: number; bottom?: number; left?: number; };
}

export function UsageBarChart({
  data,
  dataKey, // This should be 'value' or 'count' from TopNItemCount
  layout = "vertical",
  yAxisWidth = 100, // Increased for longer labels
  barRadius = [0, 4, 4, 0],
  chartMargin = { right: 30, left: 20, top: 5, bottom: layout === 'horizontal' ? 50 : 5 } // Adjusted margins
}: UsageBarChartProps) {
  if (!data || data.length === 0) {
    return <div className="text-center text-muted-foreground p-4 h-full flex items-center justify-center">无数据可显示。</div>;
  }
  
  // Ensure data has 'name' (for axis label) and 'value' (for bar height/length)
  const chartData = data.map(item => ({
    name: item.item, // 'item' from TopNItemCount becomes 'name' for the chart
    value: item.count, // 'count' from TopNItemCount becomes 'value' for the chart dataKey
    fill: item.fill // Pass fill color
  }));


  return (
    <ChartContainer config={{}} className="w-full h-full min-h-[200px]">
      <BarChart data={chartData} layout={layout} margin={chartMargin}>
        <CartesianGrid strokeDasharray="3 3" horizontal={layout === "vertical"} vertical={layout === "horizontal"} />
        {layout === "vertical" ? (
          <>
            <XAxis type="number" />
            <YAxis dataKey="name" type="category" width={yAxisWidth} tick={{ fontSize: 12 }} interval={0} />
          </>
        ) : (
          <>
            <XAxis dataKey="name" type="category" tick={{ fontSize: 10, angle: -45, textAnchor: 'end' }} height={60} interval={0} />
            <YAxis type="number" allowDecimals={false} />
          </>
        )}
        <RechartsTooltip cursor={{ fill: 'hsl(var(--muted))' }} content={<ChartTooltipContent />} />
        <Bar dataKey="value" radius={barRadius}>
          {chartData.map((entry, index) => (
            <RechartsCell key={`cell-${index}`} fill={entry.fill || "hsl(var(--chart-1))"} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

    