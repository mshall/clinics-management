/** Lightweight markdown conventions for assistant replies (rendered in the web widget). */

export function mdHeading(title: string): string {
  return `## ${title.trim()}\n\n`;
}

export function mdSubtext(text: string): string {
  return `_${text.trim()}_\n\n`;
}

export function mdBullets(items: string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}

export function mdNumbered(items: string[]): string {
  return items.map((item, i) => `${i + 1}. ${item}`).join("\n");
}

export function mdMetric(currency: string, net: string, gross: string, locale: "en" | "ar"): string {
  return locale === "ar"
    ? `- **${currency}** — صافي **${net}** · إجمالي ${gross}`
    : `- **${currency}** — Net **${net}** · Gross ${gross}`;
}

export function mdCallout(text: string): string {
  return `> ${text.trim()}\n`;
}
