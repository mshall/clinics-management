import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type MarkdownViewProps = {
  source: string;
  syncMeta?: { commitSha?: string; syncedAt?: string; source?: string; branch?: string };
};

export function MarkdownView({ source, syncMeta }: MarkdownViewProps) {
  return (
    <article className="markdown-body">
      {syncMeta ? (
        <p className="sync-badge">
          Synced from {syncMeta.source ?? "upstream"} / {syncMeta.branch ?? "master"}
          {syncMeta.commitSha ? ` · ${syncMeta.commitSha.slice(0, 7)}` : ""}
          {syncMeta.syncedAt ? ` · ${syncMeta.syncedAt}` : ""}
        </p>
      ) : null}
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>
    </article>
  );
}
