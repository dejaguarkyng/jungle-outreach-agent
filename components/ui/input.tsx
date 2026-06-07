import * as React from "react";
import { cn } from "@/src/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-9 w-full rounded-md border bg-black/20 px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
