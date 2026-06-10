import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { formatUserRole } from "@/lib/locale-display";
import { cn } from "@/lib/utils";
import type { OrgHierarchyNode } from "@/features/org-hierarchy/org-hierarchy-types";

const NODE_W = 168;
const NODE_H = 52;
const USER_NODE_H = 40;
const H_GAP = 72;
const V_GAP = 14;

type LayoutBox = {
  node: OrgHierarchyNode;
  x: number;
  y: number;
  w: number;
  h: number;
};

type LayoutResult = { box: LayoutBox; children: LayoutResult[] };

function nodeHeight(node: OrgHierarchyNode): number {
  return node.nodeType === "user" ? USER_NODE_H : NODE_H;
}

function subtreeHeight(result: LayoutResult): number {
  if (!result.children.length) return result.box.h;
  const inner =
    result.children.reduce((sum, c, i) => sum + subtreeHeight(c) + (i ? V_GAP : 0), 0);
  return Math.max(result.box.h, inner);
}

function layoutNode(node: OrgHierarchyNode, depth: number, yStart: number): { result: LayoutResult; nextY: number } {
  const h = nodeHeight(node);
  const x = depth * (NODE_W + H_GAP);

  if (!node.children.length) {
    const box: LayoutBox = { node, x, y: yStart, w: NODE_W, h };
    return { result: { box, children: [] }, nextY: yStart + h + V_GAP };
  }

  let cursor = yStart;
  const children: LayoutResult[] = [];
  for (const child of node.children) {
    const laid = layoutNode(child, depth + 1, cursor);
    children.push(laid.result);
    cursor = laid.nextY;
  }

  const blockH = children.reduce((sum, c, i) => sum + subtreeHeight(c) + (i ? V_GAP : 0), 0);
  const firstCenter = children[0].box.y + children[0].box.h / 2;
  const lastCenter = children[children.length - 1].box.y + children[children.length - 1].box.h / 2;
  const y = (firstCenter + lastCenter) / 2 - h / 2;

  const box: LayoutBox = { node, x, y, w: NODE_W, h };
  return { result: { box, children }, nextY: Math.max(yStart + h + V_GAP, yStart + blockH) };
}

function flattenLayout(result: LayoutResult): LayoutResult[] {
  return [result, ...result.children.flatMap(flattenLayout)];
}

function nodeColors(nodeType: OrgHierarchyNode["nodeType"]) {
  switch (nodeType) {
    case "platform":
      return { fill: "hsl(var(--primary) / 0.12)", stroke: "hsl(var(--primary))", text: "hsl(var(--primary))" };
    case "organization":
      return { fill: "hsl(221 83% 53% / 0.12)", stroke: "hsl(221 83% 53%)", text: "hsl(221 83% 45%)" };
    case "clinic":
      return { fill: "hsl(142 76% 36% / 0.12)", stroke: "hsl(142 76% 36%)", text: "hsl(142 55% 28%)" };
    case "users_group":
      return { fill: "hsl(var(--muted))", stroke: "hsl(var(--border))", text: "hsl(var(--muted-foreground))" };
    case "user":
      return { fill: "hsl(var(--card))", stroke: "hsl(var(--border))", text: "hsl(var(--foreground))" };
  }
}

function edgePath(parent: LayoutBox, child: LayoutBox): string {
  const x1 = parent.x + parent.w;
  const y1 = parent.y + parent.h / 2;
  const x2 = child.x;
  const y2 = child.y + child.h / 2;
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
}

function countLine(node: OrgHierarchyNode, t: (k: string) => string): string | null {
  const c = node.counts;
  if (!c) return null;
  const parts: string[] = [];
  if (c.organizations != null) parts.push(`${c.organizations} ${t("platform.kpi.orgs")}`);
  if (c.clinics != null) parts.push(`${c.clinics} ${t("platform.kpi.clinics")}`);
  if (c.users != null) parts.push(`${c.users} ${t("platform.kpi.users")}`);
  if (c.patients != null) parts.push(`${c.patients} ${t("platform.patients")}`);
  return parts.length ? parts.join(" · ") : null;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function OrgHierarchyMindMap({
  root,
  onSelect,
  selectedId,
}: {
  root: OrgHierarchyNode;
  onSelect?: (node: OrgHierarchyNode) => void;
  selectedId?: string;
}) {
  const { t } = useTranslation();

  const { layout, width, height } = useMemo(() => {
    const { result } = layoutNode(root, 0, 0);
    const flat = flattenLayout(result);
    const maxX = Math.max(...flat.map((f) => f.box.x + f.box.w));
    const maxY = Math.max(...flat.map((f) => f.box.y + f.box.h));
    return { layout: result, width: maxX + 48, height: maxY + 48 };
  }, [root]);

  const flat = useMemo(() => flattenLayout(layout), [layout]);

  const edges = useMemo(() => {
    const out: { key: string; d: string }[] = [];
    function walk(r: LayoutResult) {
      for (const child of r.children) {
        out.push({ key: `${r.box.node.id}-${child.box.node.id}`, d: edgePath(r.box, child.box) });
        walk(child);
      }
    }
    walk(layout);
    return out;
  }, [layout]);

  return (
    <div className="min-h-full overflow-auto rounded-lg border border-border bg-muted/20 p-4">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="min-w-full"
        role="img"
        aria-label={t("orgHierarchy.title")}
      >
        <defs>
          <marker id="mindmap-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" fill="hsl(var(--border))" />
          </marker>
        </defs>
        <g transform="translate(24, 24)">
          {edges.map((e) => (
            <path
              key={e.key}
              d={e.d}
              fill="none"
              stroke="hsl(var(--border))"
              strokeWidth={1.5}
              markerEnd="url(#mindmap-arrow)"
            />
          ))}
          {flat.map(({ box }) => {
            const colors = nodeColors(box.node.nodeType);
            const clickable = box.node.nodeType !== "platform" && box.node.nodeType !== "users_group";
            const selected = selectedId === box.node.id;
            const counts = countLine(box.node, t);
            const roleLabel = box.node.meta?.role ? formatUserRole(box.node.meta.role, t) : null;
            const kindLabel =
              box.node.meta?.kind === "parent"
                ? t("clinics.parent")
                : box.node.meta?.kind === "branch"
                  ? t("clinics.branch")
                  : null;
            const subtitle = box.node.subtitle ?? roleLabel ?? kindLabel ?? counts;

            return (
              <g
                key={box.node.id}
                transform={`translate(${box.x}, ${box.y})`}
                className={cn(clickable && "cursor-pointer")}
                onClick={() => clickable && onSelect?.(box.node)}
              >
                <rect
                  width={box.w}
                  height={box.h}
                  rx={10}
                  fill={colors.fill}
                  stroke={selected ? "hsl(var(--primary))" : colors.stroke}
                  strokeWidth={selected ? 2.5 : 1.5}
                />
                <text
                  x={box.w / 2}
                  y={subtitle ? box.h / 2 - 6 : box.h / 2 + 1}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={colors.text}
                  fontSize={box.node.nodeType === "user" ? 11 : 12}
                  fontWeight={box.node.nodeType === "user" ? 400 : 600}
                >
                  {truncate(box.node.label, 22)}
                </text>
                {subtitle ? (
                  <text
                    x={box.w / 2}
                    y={box.h / 2 + 12}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="hsl(var(--muted-foreground))"
                    fontSize={10}
                  >
                    {truncate(subtitle, 28)}
                  </text>
                ) : null}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
