// Pure splitter for the TEXT lockup used in login footers ("Kiorly Pharmacy by Kiorex" / «كيورلي للصيدليات من كيوريكس»).
// Arabic caveat: the font's required ligature ل+ي (rlig) would paint ل and the final ي in ONE colour, so the renderer must switch rlig off for the brand word (kinds brand+last) — see KiorlyFootText.
// Rule (Latin and Arabic alike): the LAST letter of the brand word (Y of Kiorly; ي of كيورلي) and the ENTIRE product word get the product accent; everything else inherits.
const BRAND = /^(Kiorly|كيورلي)/;
/** "brand" = K-I-O-R-L (كيورل), "last" = the final letter, "word" = the product word. */
export type FootSeg = { text: string; kind?: "brand" | "last" | "word" };
export function footSegments(text: string, word: string): FootSeg[] {
  const segs: FootSeg[] = [];
  const push = (t: string, kind?: FootSeg["kind"]) => { if (t) segs.push(kind ? { text: t, kind } : { text: t }); };
  const m = BRAND.exec(text);
  let cur = 0;
  if (m) { const e = m[0].length; push(text.slice(0, e - 1), "brand"); push(text.slice(e - 1, e), "last"); cur = e; }
  const wi = word ? text.indexOf(word, cur) : -1;
  if (wi >= 0) { push(text.slice(cur, wi)); push(word, "word"); cur = wi + word.length; }
  push(text.slice(cur));
  return segs;
}
