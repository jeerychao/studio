
"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Subnet } from "@/types";
import { Label } from "@/components/ui/label";

interface IPSubnetFilterProps {
  subnets: Subnet[];
  currentSubnetId?: string;
}

export function IPSubnetFilter({ subnets, currentSubnetId }: IPSubnetFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleSubnetChange = (subnetId: string) => {
    const current = new URLSearchParams(Array.from(searchParams.entries()));

    if (!subnetId || subnetId === "all") {
      current.delete("subnetId");
    } else {
      current.set("subnetId", subnetId);
    }
    const query = current.toString() ? `?${current.toString()}` : "";
    router.push(`${pathname}${query}`);
  };

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="subnet-filter" className="text-sm font-medium">Filter by Subnet:</Label>
      <Select
        value={currentSubnetId || "all"}
        onValueChange={handleSubnetChange}
      >
        <SelectTrigger id="subnet-filter" className="w-full md:w-[250px]">
          <SelectValue placeholder="Select a subnet" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Subnets</SelectItem>
          {subnets.map((subnet) => (
            <SelectItem key={subnet.id} value={subnet.id}>
              {subnet.networkAddress} ({subnet.description || "No description"})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
