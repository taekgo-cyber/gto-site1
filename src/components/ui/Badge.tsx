import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "primary" | "success" | "outline" | "muted";

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-surface-strong text-muted-foreground",
  primary: "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200",
  success: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200",
  outline: "border border-border bg-background text-foreground",
  muted: "bg-border/60 text-foreground",
};

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
};

export function Badge({ variant = "default", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold leading-none",
        variantStyles[variant],
        className,
      )}
      {...props}
    />
  );
}
