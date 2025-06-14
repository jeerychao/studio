
"use client";

import * as React from "react";
import { Moon, Sun, Laptop, ChevronDown } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ThemeToggle() {
  const { setTheme } = useTheme();
  const [isOpen, setIsOpen] = React.useState(false);
  const autoCloseTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  const clearAutoCloseTimer = () => {
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
  };

  // This function is called by Radix's DropdownMenu onOpenChange
  const handleRadixOpenChange = (openValue: boolean) => {
    clearAutoCloseTimer(); // Crucial: always clear our timer when Radix's state changes
    setIsOpen(openValue);   // Sync our state with Radix's
  };

  // When mouse enters the trigger or content, cancel any pending auto-close
  const handleMouseEnterInteractiveArea = () => {
    clearAutoCloseTimer();
  };

  // When mouse leaves the trigger or content, and the menu is open, start auto-close timer
  const handleMouseLeaveInteractiveArea = () => {
    clearAutoCloseTimer(); // Clear any existing one first
    if (isOpen) { // Only if our state says it's open
      autoCloseTimerRef.current = setTimeout(() => {
        setIsOpen(false); // This will trigger handleRadixOpenChange(false) via Radix
      }, 500); // 500ms delay
    }
  };

  const handleThemeItemClick = (theme: string) => {
    setTheme(theme);
    setIsOpen(false); // Explicitly close our state
    clearAutoCloseTimer(); // And clear timer
    // Radix will also attempt to close, which is fine.
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={handleRadixOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="rounded-full h-10 w-auto px-2.5 flex items-center justify-center space-x-1.5 hover:bg-transparent hover:text-current"
          onMouseEnter={handleMouseEnterInteractiveArea}
          onMouseLeave={handleMouseLeaveInteractiveArea}
          // onClick is handled by Radix to call onOpenChange
        >
          <div className="relative w-[1.1rem] h-[1.1rem] flex items-center justify-center">
            <Sun className="h-full w-full rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute inset-0 h-full w-full rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          </div>
          <ChevronDown className="h-3 w-3 text-muted-foreground opacity-70" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onMouseEnter={handleMouseEnterInteractiveArea}
        onMouseLeave={handleMouseLeaveInteractiveArea}
      >
        <DropdownMenuItem onClick={() => handleThemeItemClick("light")}>
          <Sun className="mr-2 h-4 w-4" />
          Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleThemeItemClick("dark")}>
          <Moon className="mr-2 h-4 w-4" />
          Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleThemeItemClick("system")}>
          <Laptop className="mr-2 h-4 w-4" />
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
