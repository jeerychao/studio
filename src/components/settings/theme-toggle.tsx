
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
import { cn } from "@/lib/utils";

export function ThemeToggle() {
  const { setTheme } = useTheme();
  const [isThemeMenuOpen, setIsThemeMenuOpen] = React.useState(false);
  const timeoutRef = React.useRef<number | null>(null);

  const handleMenuOpen = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsThemeMenuOpen(true);
  };

  const handleMenuClose = () => {
    timeoutRef.current = window.setTimeout(() => {
      setIsThemeMenuOpen(false);
    }, 300); // 300ms delay for smoother experience
  };

  return (
    <div onMouseEnter={handleMenuOpen} onMouseLeave={handleMenuClose}>
      <DropdownMenu open={isThemeMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full h-10 w-10 flex items-center justify-center space-x-1.5"
          >
            <div className="relative w-[1.2rem] h-[1.2rem] flex items-center justify-center">
              <Sun className="h-full w-full rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute inset-0 h-full w-full rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            </div>
            <ChevronDown
              className={cn(
                "h-3 w-3 text-muted-foreground opacity-70 transition-transform duration-200",
                isThemeMenuOpen && "rotate-180"
              )}
            />
            <span className="sr-only">Toggle theme</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-48"
        >
          <DropdownMenuItem onClick={() => setTheme("light")}>
            <Sun className="mr-2 h-4 w-4" />
            Light
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme("dark")}>
            <Moon className="mr-2 h-4 w-4" />
            Dark
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme("system")}>
            <Laptop className="mr-2 h-4 w-4" />
            System
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
