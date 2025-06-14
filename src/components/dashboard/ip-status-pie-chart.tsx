
"use client";

import * as React from "react";
import { PieChart, Pie, Cell as RechartsCell, Tooltip as RechartsTooltip, Legend as RechartsLegend } from 'recharts';
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";

interface IPStatusPieChartProps {
  data: Array<{ name: string; value: number; fill: string; }>;
}

// Custom ChartLegendContent component
const ChartLegendContent = (props: any) => {
    const { payload } = props;
    if (!payload || payload.length === 0) {
        return null;
    }
    return (
        <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground mt-2">
            {payload.map((entry: any, index: number) => (
                <div key={`item-${index}`} className="flex items-center gap-1.5">
                    <span style={{ backgroundColor: entry.color }} className="h-2.5 w-2.5 rounded-full inline-block"></span>
                    <span>{entry.value} ({entry.payload.name})</span> {/* Display name from payload */}
                </div>
            ))}
        </div>
    );
};

export function IPStatusPieChart({ data }: IPStatusPieChartProps) {
  if (!data || data.length === 0) {
    return <div className="text-center text-muted-foreground p-4 h-full flex items-center justify-center">无 IP 状态数据可显示。</div>;
  }

  return (
    <ChartContainer config={{}} className="w-full h-full min-h-[200px]"> {/* Added min-h for ResponsiveContainer */}
      <PieChart>
        <RechartsTooltip
          cursor={false}
          content={<ChartTooltipContent hideLabel />}
        />
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          labelLine={false}
          outerRadius={80} // Adjusted for better fit
          innerRadius={50} // Adjusted for better fit
          dataKey="value"
          nameKey="name" // Ensure name is used for legend/tooltip context
        >
          {data.map((entry, index) => (
            <RechartsCell key={`cell-${index}`} fill={entry.fill} name={entry.name} />
          ))}
        </Pie>
        <RechartsLegend content={<ChartLegendContent />} />
      </PieChart>
    </ChartContainer>
  );
}

    