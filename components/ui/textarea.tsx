import * as React from "react";
import { cn } from "@/src/lib/utils";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "min-h-28 w-full resize-y rounded-md border bg-black/20 px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";
