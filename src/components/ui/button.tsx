import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-0 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-b from-blue-500 to-blue-600 text-white shadow-[0_2px_10px_rgb(37,99,235,0.2)] border border-blue-600 transition-all duration-200 hover:from-blue-400 hover:to-blue-500 hover:shadow-[0_4px_15px_rgb(37,99,235,0.3)] hover:-translate-y-[1px] active:translate-y-[1px] active:shadow-none",
        destructive:
          "bg-gradient-to-b from-red-500 to-red-600 text-white shadow-[0_2px_10px_rgb(220,38,38,0.2)] border border-red-600 transition-all duration-200 hover:from-red-400 hover:to-red-500 hover:shadow-[0_4px_15px_rgb(220,38,38,0.3)] hover:-translate-y-[1px] active:translate-y-[1px] active:shadow-none",
        outline:
          "bg-white text-slate-700 shadow-sm border border-slate-200 transition-all duration-200 hover:bg-slate-50 hover:border-slate-300 hover:shadow-[0_2px_8px_rgba(0,0,0,0.05)] hover:-translate-y-[1px] active:translate-y-[1px] active:shadow-none",
        secondary:
          "bg-slate-100 text-slate-900 shadow-sm border border-slate-200 transition-all duration-200 hover:bg-slate-200/80 hover:-translate-y-[1px] active:translate-y-[1px] active:shadow-none",
        ghost:
          "transition-all duration-200 hover:bg-slate-100 hover:text-slate-900",
        link:
          "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-5 py-2 text-[13px] font-semibold",
        sm: "h-8 px-3 text-xs font-semibold",
        lg: "h-11 px-7 text-sm font-bold",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  carregando?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, carregando = false, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || carregando}
        {...props}
      >
        {carregando && <Loader2 className="h-4 w-4 animate-spin shrink-0 mr-1" />}
        {children}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
