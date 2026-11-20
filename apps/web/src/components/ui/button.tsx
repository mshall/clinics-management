import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium tracking-[0.005em] transition-[background-color,box-shadow,transform,color] duration-150 ease-[var(--kx-ease-standard)] active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-[var(--kx-shadow-1)] hover:bg-[var(--kx-primary-hover)] hover:shadow-[var(--kx-shadow-2)]",
        create:
          "bg-primary text-primary-foreground shadow-[var(--kx-shadow-1)] hover:bg-[var(--kx-primary-hover)] hover:shadow-[var(--kx-shadow-2)]",
        destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline: "border border-input bg-card shadow-[var(--kx-shadow-1)] hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-accent",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 min-h-11 px-4 py-2 touch-manipulation md:h-10 md:min-h-10",
        sm: "h-9 min-h-9 rounded-lg px-3 text-xs touch-manipulation sm:h-8 sm:min-h-8",
        lg: "h-12 min-h-12 rounded-lg px-8 text-base touch-manipulation",
        icon: "h-11 min-h-11 w-11 min-w-11 touch-manipulation",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
