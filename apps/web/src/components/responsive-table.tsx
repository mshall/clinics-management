import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type TableMinWidth = "sm" | "md" | "lg" | "xl";

export const tableMinWidthClass: Record<TableMinWidth, string> = {
  sm: "min-w-[480px]",
  md: "min-w-[640px]",
  lg: "min-w-[720px]",
  xl: "min-w-[960px]",
};

export interface ResponsiveTableProps extends HTMLAttributes<HTMLDivElement> {
  /** Hint for consumers — apply the matching class on the nested `<table>`. */
  minWidth?: TableMinWidth;
}

/** Horizontally scrollable table wrapper for narrow viewports. */
export function ResponsiveTable({ className, children, ...props }: ResponsiveTableProps) {
  return (
    <div className={cn("-mx-1 overflow-x-auto rounded-md border px-1 sm:mx-0 sm:px-0", className)} {...props}>
      {children}
    </div>
  );
}

export interface ResponsiveTableElementProps extends React.TableHTMLAttributes<HTMLTableElement> {
  minWidth?: TableMinWidth;
}

/** Table with a default min-width for use inside ResponsiveTable. */
export function ResponsiveTableElement({ className, minWidth = "md", ...props }: ResponsiveTableElementProps) {
  return <table className={cn("w-full text-sm", tableMinWidthClass[minWidth], className)} {...props} />;
}
