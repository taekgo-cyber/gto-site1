import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

const baseStyles =
  "inline-flex touch-manipulation items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50";

const variantStyles: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90",
  secondary: "bg-surface text-foreground hover:bg-border",
  outline:
    "border border-border bg-background text-foreground hover:bg-surface",
  ghost: "bg-transparent text-foreground hover:bg-surface",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "min-h-11 px-3.5 text-[15px]",
  md: "min-h-11 px-4 text-[15px]",
  lg: "min-h-12 px-6 text-[16px]",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        baseStyles,
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
      {...props}
    />
  );
}
