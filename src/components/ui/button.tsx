import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "sm" | "md" | "lg";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "md", ...props }, ref) => {
    const base =
      "inline-flex items-center justify-center font-medium transition-all duration-200 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan-400 disabled:opacity-50 disabled:pointer-events-none select-none";

    const sizes: Record<string, string> = {
      sm: "px-3 py-1.5 text-sm",
      md: "px-4 py-2 text-base",
      lg: "px-6 py-3 text-lg",
    };

    const variants: Record<string, string> = {
      default:
        "bg-brand-cyan-400 text-black hover:bg-brand-cyan-500 shadow-brand-md hover:shadow-brand-lg",
      outline:
        "border border-brand-cyan-400 text-brand-cyan-400 hover:bg-brand-cyan-400/10 hover:shadow-brand-md",
      ghost:
        "text-brand-cyan-400 hover:bg-brand-cyan-400/10 hover:text-brand-cyan-300",
      secondary:
        "bg-neutral-800 text-white hover:bg-neutral-700 hover:shadow-md",
    };

    return (
      <button
        ref={ref}
        className={cn(base, sizes[size], variants[variant], className)}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";

export { Button };