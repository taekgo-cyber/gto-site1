import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "primary" | "success" | "outline" | "muted";

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-surface text-muted-foreground",
  primary: "bg-primary/10 text-primary",
  success: "bg-green-100 text-green-700",
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
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        variantStyles[variant],
        className,
      )}
      {...props}
    />
  );
}
