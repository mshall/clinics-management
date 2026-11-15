/** Brand / trade names common in Egypt → generic tokens used for interaction & allergy rules. */
const EGYPT_DRUG_ALIASES: Record<string, string> = {
  augmentin: "amoxicillin clavulanate",
  augmentine: "amoxicillin clavulanate",
  amoxiclav: "amoxicillin clavulanate",
  klavox: "amoxicillin clavulanate",
  dalacin: "clindamycin",
  zithromax: "azithromycin",
  flagyl: "metronidazole",
  voltaren: "diclofenac",
  cataflam: "diclofenac",
  brufen: "ibuprofen",
  panadol: "paracetamol",
  congor: "paracetamol",
  profenid: "ketoprofen",
  xanax: "alprazolam",
  lexotanil: "bromazepam",
  ciprobay: "ciprofloxacin",
  omacor: "omega-3",
};

export function normalizeDrugNameForSafety(raw: string): { canonical: string; matchedCatalog: boolean } {
  const d = raw.normalize("NFKC").trim().toLowerCase();
  if (!d) return { canonical: d, matchedCatalog: false };
  const tokens = d.split(/[\s,/+-]+/).filter(Boolean);
  const expanded: string[] = [];
  let matchedCatalog = false;
  for (const t of tokens) {
    const alias = EGYPT_DRUG_ALIASES[t];
    if (alias) {
      matchedCatalog = true;
      expanded.push(alias);
    } else {
      expanded.push(t);
    }
  }
  const whole = EGYPT_DRUG_ALIASES[d.replace(/\s+/g, "")] ?? EGYPT_DRUG_ALIASES[d];
  if (whole) {
    matchedCatalog = true;
    return { canonical: whole, matchedCatalog: true };
  }
  return { canonical: expanded.join(" "), matchedCatalog };
}

export function drugNamesMatchForInteraction(a: string, b: string): boolean {
  const ca = normalizeDrugNameForSafety(a).canonical;
  const cb = normalizeDrugNameForSafety(b).canonical;
  return ca.includes(cb) || cb.includes(ca) || ca.split(" ").some((t) => t.length > 3 && cb.includes(t));
}