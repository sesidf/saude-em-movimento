import * as React from "react";
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-2xl border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground hover:opacity-80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:opacity-80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground hover:opacity-80",
        outline: "text-foreground",
        success:
          "border-emerald-200/80 bg-emerald-50 text-emerald-800 hover:bg-emerald-100/80",
        warning:
          "border-amber-200/80 bg-amber-50 text-amber-800 hover:bg-amber-100/80",
        info:
          "border-blue-200/80 bg-blue-50 text-blue-800 hover:bg-blue-100/80",
        error:
          "border-red-200/80 bg-red-50 text-red-800 hover:bg-red-100/80",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

interface BadgeProps {
  className?: string;
  variant?: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info" | "error" | null | undefined;
  children?: any;
  [key: string]: any;
}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge,  };
