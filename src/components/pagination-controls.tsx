
"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight, CornerDownLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  basePath: string;
  currentQuery?: URLSearchParams;
  onPageChange?: (newPage: number) => void;
}

export function PaginationControls({
  currentPage,
  totalPages,
  basePath,
  currentQuery,
  onPageChange,
}: PaginationControlsProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [jumpToPage, setJumpToPage] = React.useState<string>(String(currentPage));

  React.useEffect(() => {
    setJumpToPage(String(currentPage));
  }, [currentPage]);

  const navigateToPage = (pageNumber: number) => {
    if (onPageChange) {
      onPageChange(pageNumber);
    } else {
      const params = new URLSearchParams(currentQuery?.toString() || "");
      params.set("page", String(pageNumber));
      router.push(`${basePath}?${params.toString()}`);
    }
  };

  const handleJumpToPageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setJumpToPage(e.target.value);
  };

  const handleJumpToPage = () => {
    const pageNum = parseInt(jumpToPage, 10);
    if (isNaN(pageNum)) {
      toast({ title: "无效页码", description: "请输入一个有效的数字。", variant: "destructive" });
      setJumpToPage(String(currentPage)); // Reset to current page
      return;
    }
    if (pageNum < 1 || pageNum > totalPages) {
      toast({
        title: "页码超出范围",
        description: `请输入一个介于 1 和 ${totalPages} 之间的页码。`,
        variant: "destructive",
      });
      setJumpToPage(String(currentPage)); // Reset to current page
      return;
    }
    navigateToPage(pageNum);
  };
  
  const handleJumpToPageKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleJumpToPage();
    }
  };

  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className="flex items-center justify-between mt-6 gap-2 sm:gap-4">
      <Button
        variant="outline"
        size="sm"
        onClick={() => navigateToPage(currentPage - 1)}
        disabled={currentPage <= 1}
        className="flex-shrink-0"
      >
        <ChevronLeft className="mr-1 h-4 w-4 sm:mr-2" />
        上一页
      </Button>
      
      <div className="flex items-center gap-1 sm:gap-2">
        <span className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap">
          第
        </span>
        <Input
          type="number"
          min="1"
          max={totalPages}
          value={jumpToPage}
          onChange={handleJumpToPageInputChange}
          onKeyPress={handleJumpToPageKeyPress}
          onBlur={handleJumpToPage} // Also jump on blur if value changed
          className="h-8 w-12 sm:w-16 text-center px-1 text-xs sm:text-sm"
          aria-label="跳转到页面"
        />
        <span className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap">
          / {totalPages} 页
        </span>
        {/* Hidden on smaller screens, or could be a smaller icon */}
        <Button 
            variant="outline" 
            size="icon" 
            onClick={handleJumpToPage} 
            className="h-8 w-8 ml-1 hidden sm:inline-flex"
            aria-label="跳转"
            disabled={parseInt(jumpToPage, 10) === currentPage && currentPage >=1 && currentPage <= totalPages}
        >
            <CornerDownLeft className="h-4 w-4" />
        </Button>
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={() => navigateToPage(currentPage + 1)}
        disabled={currentPage >= totalPages}
        className="flex-shrink-0"
      >
        下一页
        <ChevronRight className="ml-1 h-4 w-4 sm:ml-2" />
      </Button>
    </div>
  );
}
