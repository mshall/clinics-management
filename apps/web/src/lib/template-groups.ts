/** Picker groups by specialty; custom specialties sort last. */
export function groupTemplatesBySpecialty<T extends { specialty: string }>(
  templates: T[],
  labelFor: (tpl: T) => string,
): { key: string; label: string; templates: T[] }[] {
  const map = new Map<string, { key: string; label: string; templates: T[] }>();
  for (const tpl of templates) {
    const label = labelFor(tpl);
    const key = tpl.specialty === "CUSTOM" ? `CUSTOM:${label}` : tpl.specialty;
    const group = map.get(key) ?? { key, label, templates: [] };
    group.templates.push(tpl);
    map.set(key, group);
  }
  return [...map.values()].sort((a, b) => {
    const ac = a.key.startsWith("CUSTOM:") ? 1 : 0;
    const bc = b.key.startsWith("CUSTOM:") ? 1 : 0;
    return ac - bc || a.label.localeCompare(b.label);
  });
}
