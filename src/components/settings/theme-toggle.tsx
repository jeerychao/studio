
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
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleOpenChange = (openValue: boolean) => {
    setIsOpen(openValue);
    if (!openValue) {
      clearTimer();
    }
  };
  
  const handleMouseEnter = () => {
    clearTimer(); // Clear any pending close timer if mouse re-enters
  };

  const handleMouseLeave = () => {
    clearTimer();
    timerRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 300); // Adjust delay as needed (milliseconds)
  };

  const handleItemClick = (theme: string) => {
    setTheme(theme);
    setIsOpen(false); 
    clearTimer();
  };


  return (
    <DropdownMenu open={isOpen} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="rounded-full h-10 w-auto px-2.5 flex items-center justify-center space-x-1.5 hover:bg-transparent hover:text-current"
          onMouseEnter={handleMouseEnter} // Keep open if mouse moves back to trigger
          onMouseLeave={handleMouseLeave} // Start close timer if mouse leaves trigger
          onClick={() => setIsOpen(!isOpen)} // Toggle on click
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
        onMouseEnter={handleMouseEnter} // Keep open if mouse moves to content
        onMouseLeave={handleMouseLeave} // Start close timer if mouse leaves content
      >
        <DropdownMenuItem onClick={() => handleItemClick("light")}>
          <Sun className="mr-2 h-4 w-4" />
          Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleItemClick("dark")}>
          <Moon className="mr-2 h-4 w-4" />
          Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleItemClick("system")}>
          <Laptop className="mr-2 h-4 w-4" />
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
