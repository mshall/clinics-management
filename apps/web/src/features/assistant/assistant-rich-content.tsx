import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type RichBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "quote"; text: string }
  | { type: "ordered"; items: string[] }
  | { type: "unordered"; items: string[] }
  | { type: "metric"; currency: string; net?: string; gross?: string; raw: string };

const METRIC_EN =
  /^[-•]\s*\*\*?(\w+)\*\*?\s*[—–-]\s*(?:Net|net)\s*\*\*?([\d,.]+)\*\*?\s*·\s*(?:Gross|gross)\s*([\d,.]+)/i;
const METRIC_AR = /^[-•]\s*\*\*?(\w+)\*\*?\s*[—–-]\s*صافي\s*\*\*?([\d,.]+)\*\*?\s*·\s*إجمالي\s*([\d,.]+)/i;
const METRIC_PLAIN = /^[-•]\s*(\w+):\s*net\s*([\d,.]+)\s*\(gross\s*([\d,.]+)\)/i;

export function parseAssistantRichContent(text: string): RichBlock[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const blocks: RichBlock[] = [];
  let ol: string[] = [];
  let ul: string[] = [];

  const flushOl = () => {
    if (ol.length) {
      blocks.push({ type: "ordered", items: [...ol] });
      ol = [];
    }
  };
  const flushUl = () => {
    if (ul.length) {
      blocks.push({ type: "unordered", items: [...ul] });
      ul = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line) {
      flushOl();
      flushUl();
      continue;
    }

    const heading = line.match(/^#{1,3}\s+(.+)$/);
    if (heading) {
      flushOl();
      flushUl();
      blocks.push({ type: "heading", text: heading[1]!.trim() });
      continue;
    }

    if (line.startsWith("> ")) {
      flushOl();
      flushUl();
      blocks.push({ type: "quote", text: line.slice(2).trim() });
      continue;
    }

    const titleOnly = line.match(/^([^:]+):\s*$/);
    const next = lines[i + 1] ?? "";
    if (titleOnly && (/^\d+\./.test(next) || /^[-•]/.test(next) || next.startsWith(">"))) {
      flushOl();
      flushUl();
      blocks.push({ type: "heading", text: titleOnly[1]!.trim() });
      continue;
    }

    const olMatch = line.match(/^\d+\.\s+(.+)$/);
    if (olMatch) {
      flushUl();
      ol.push(olMatch[1]!);
      continue;
    }

    const metricMatch = line.match(METRIC_EN) ?? line.match(METRIC_AR) ?? line.match(METRIC_PLAIN);
    if (metricMatch) {
      flushOl();
      flushUl();
      blocks.push({
        type: "metric",
        currency: metricMatch[1]!,
        net: metricMatch[2],
        gross: metricMatch[3],
        raw: line,
      });
      continue;
    }

    if (/^[-•]\s+/.test(line)) {
      flushOl();
      ul.push(line.replace(/^[-•]\s+/, ""));
      continue;
    }

    flushOl();
    flushUl();
    blocks.push({ type: "paragraph", text: line });
  }

  flushOl();
  flushUl();
  return blocks.length ? blocks : [{ type: "paragraph", text }];
}

export function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_)/g);
  return parts.map((part, i) => {
    const bold = part.match(/^\*\*(.+)\*\*$/);
    if (bold) {
      const num = bold[1]!.match(/^[\d,.]+$/);
      return (
        <strong
          key={`${keyPrefix}-b-${i}`}
          className={cn(
            "font-semibold text-foreground",
            num && "text-[15px] tabular-nums tracking-tight text-primary",
          )}
        >
          {bold[1]}
        </strong>
      );
    }
    const italic = part.match(/^_([^_]+)_$/);
    if (italic) {
      return (
        <em key={`${keyPrefix}-i-${i}`} className="text-muted-foreground not-italic">
          {italic[1]}
        </em>
      );
    }
    return <span key={`${keyPrefix}-t-${i}`}>{part}</span>;
  });
}
