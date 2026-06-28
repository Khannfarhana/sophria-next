"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface CustomSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  /** "default" = bordered card; "ghost" = transparent inline (inside a styled container) */
  variant?: "default" | "ghost";
  wrapperClassName?: string;
}

export function CustomSelect({
  variant = "default",
  className,
  wrapperClassName,
  children,
  ...props
}: CustomSelectProps) {
  return (
    <div className={cn("relative", wrapperClassName)}>
      <select
        className={cn(
          "w-full cursor-pointer appearance-none text-sm text-foreground transition focus:outline-none disabled:cursor-not-allowed disabled:opacity-50",
          variant === "default" &&
            "rounded-sm border border-border bg-background px-3 py-2 pr-8 hover:border-foreground/30 focus:border-foreground",
          variant === "ghost" &&
            "bg-transparent pr-5 focus:ring-0",
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className={cn(
          "pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-muted",
          variant === "default" ? "right-2.5 h-3.5 w-3.5" : "right-0 h-3.5 w-3.5"
        )}
      />
    </div>
  );
}
