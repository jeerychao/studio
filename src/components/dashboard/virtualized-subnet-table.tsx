
"use client";

import * as React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Table, TableBody, TableCell, TableRow, TableHead, TableHeader } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import type { SubnetUtilizationInfo } from "@/types";

interface VirtualizedSubnetTableProps {
  subnets: SubnetUtilizationInfo[];
}

export function VirtualizedSubnetTable({ subnets }: VirtualizedSubnetTableProps) {
  const parentRef = React.useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: subnets.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 49, // Estimate row height in pixels (h-12 is 3rem/48px + 1px border)
    overscan: 5,
  });

  return (
    <div ref={parentRef} className="h-[220px] overflow-auto relative border-t border-b">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-card">
          <TableRow>
            <TableHead>子网</TableHead>
            <TableHead className="text-right">利用率</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            position: 'relative',
          }}
        >
          {subnets.length > 0 ? (
            rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const subnet = subnets[virtualRow.index];
              return (
                <TableRow
                  key={subnet.id}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <TableCell>
                    <Link href={`/ip-addresses?subnetId=${subnet.id}`} className="hover:underline">
                      {subnet.cidr} {subnet.name && `(${subnet.name})`}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant={subnet.utilization > 90 ? "destructive" : "default"}>
                      {subnet.utilization}%
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })
          ) : (
            <TableRow style={{ height: '100%' }}>
                <TableCell colSpan={2} className="h-full text-center text-muted-foreground">
                    当前没有利用率超过80%的子网。
                </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
