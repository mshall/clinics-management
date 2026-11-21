import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { tableMinWidthClass } from "@/components/responsive-table-utils";
import { type TableMinWidth } from "@/components/responsive-table-utils";

export interface ResponsiveTableProps extends HTMLAttributes<HTMLDivElement> {
  /** Hint for consumers — apply the matching class on the nested `<table>`. */
  minWidth?: TableMinWidth;
}

/** Horizontally scrollable table wrapper for narrow viewports. */
export function ResponsiveTable({ className, children, ...props }: ResponsiveTableProps) {
  return (
    <div tabIndex={0} className={cn("-mx-1 overflow-x-auto rounded-md border px-1 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring sm:mx-0 sm:px-0", className)} {...props}>
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
