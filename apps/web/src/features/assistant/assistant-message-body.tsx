import { parseAssistantRichContent, renderInlineMarkdown } from "@/features/assistant/assistant-rich-content";
import { cn } from "@/lib/utils";

type Props = {
  text: string;
  className?: string;
};

export function AssistantMessageBody({ text, className }: Props) {
  const blocks = parseAssistantRichContent(text);

  return (
    <div className={cn("space-y-2.5 text-[13px] leading-relaxed", className)}>
      {blocks.map((block, idx) => {
        switch (block.type) {
          case "heading":
            return (
              <div key={idx} className="border-b border-primary/15 pb-1.5">
                <p className="text-[15px] font-semibold leading-snug tracking-tight text-foreground">
                  {renderInlineMarkdown(block.text, `h-${idx}`)}
                </p>
              </div>
            );
          case "quote":
            return (
              <div
                key={idx}
                className="rounded-md border border-border/80 border-s-primary/25 bg-background/60 px-2.5 py-2 text-xs text-muted-foreground"
              >
                {renderInlineMarkdown(block.text, `q-${idx}`)}
              </div>
            );
          case "metric":
            return (
              <div
                key={idx}
                className="flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-background/70 px-2.5 py-2 shadow-sm"
              >
                <span className="text-xs font-semibold uppercase tracking-wide text-primary">{block.currency}</span>
                <MetricValues block={block} idx={idx} />
              </div>
            );
          case "ordered":
            return (
              <ol key={idx} className="ms-4 list-decimal space-y-1.5 marker:font-medium marker:text-primary">
                {block.items.map((item, j) => (
                  <li key={j} className="ps-1 text-foreground/95">
                    {renderInlineMarkdown(item, `ol-${idx}-${j}`)}
                  </li>
                ))}
              </ol>
            );
          case "unordered":
            return (
              <ul key={idx} className="space-y-1.5">
                {block.items.map((item, j) => (
                  <li key={j} className="flex gap-2 text-foreground/95">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary/70" aria-hidden />
                    <span className="min-w-0 flex-1">{renderInlineMarkdown(item, `ul-${idx}-${j}`)}</span>
                  </li>
                ))}
              </ul>
            );
          default:
            return (
              <p key={idx} className="text-foreground/95">
                {renderInlineMarkdown(block.text, `p-${idx}`)}
              </p>
            );
        }
      })}
    </div>
  );
}

function MetricValues({ block, idx }: { block: { net?: string; gross?: string; raw: string }; idx: number }) {
  if (block.net && block.gross) {
    return (
      <div className="text-end text-xs">
        <div>
          Net{" "}
          <span className="text-sm font-semibold tabular-nums text-foreground">{block.net}</span>
        </div>
        <div className="text-[11px] text-muted-foreground tabular-nums">Gross {block.gross}</div>
      </div>
    );
  }
  return <span className="text-xs text-muted-foreground">{renderInlineMarkdown(block.raw, `m-${idx}`)}</span>;
}
