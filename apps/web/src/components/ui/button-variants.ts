import { cva } from "class-variance-authority";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium tracking-[0.005em] transition-[background-color,box-shadow,transform,color] duration-150 ease-(--kx-ease-standard) active:translate-y-px focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-kx-1 hover:bg-(--kx-primary-hover) hover:shadow-kx-2",
        create:
          "bg-primary text-primary-foreground shadow-kx-1 hover:bg-(--kx-primary-hover) hover:shadow-kx-2",
        destructive: "bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90",
        outline: "border border-input bg-card shadow-kx-1 hover:bg-accent hover:text-accent-foreground",
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
