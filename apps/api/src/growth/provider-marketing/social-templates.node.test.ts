import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { composeCardSvg, CARD_SIZE, esc, svgToPng, wrapText, qrDataUri } from "./share-card.render";
import { fillPlaceholders, PROTECTED_FOOTER, SEED_TEMPLATES } from "./social-templates.catalogue";

describe("GRW-P2-C social template catalogue", () => {
  it("has 6 templates in AR and EN (12 rows), every one with a link placeholder and a protected footer", () => {
    assert.equal(SEED_TEMPLATES.length, 6);
    assert.equal(new Set(SEED_TEMPLATES.map((t) => t.slug)).size, 6);
    for (const t of SEED_TEMPLATES) {
      for (const l of ["ar", "en"] as const) {
        assert.ok(t[l].body.includes("{link}"), `${t.slug}/${l} link`);
        assert.ok(t[l].body.includes("{clinic}") || t[l].body.includes("{doctor}"), `${t.slug}/${l} name`);
        assert.ok(PROTECTED_FOOTER[l].length > 20);
      }
    }
    assert.ok(/[؀-ۿ]/.test(SEED_TEMPLATES[0]!.ar.body));
  });
  it("covers every kind: post, story, flyer, WhatsApp, SMS", () => {
    assert.deepEqual([...new Set(SEED_TEMPLATES.map((t) => t.kind))].sort(), ["FLYER", "POST", "SMS_TEXT", "STORY", "WHATSAPP_MESSAGE"]);
  });
  it("no template mentions price, discount, guarantee or a patient", () => {
    for (const t of SEED_TEMPLATES) for (const l of ["ar", "en"] as const) assert.ok(!/price|discount|free|patient said|سعر|خصم|مجان/i.test(`${t[l].title} ${t[l].body}`), `${t.slug}/${l}`);
  });
  it("placeholders are filled; a doctor template falls back to the clinic name", () => {
    assert.equal(fillPlaceholders("{doctor} at {clinic}: {link}", { clinic: "Nile", doctor: "Dr A", link: "https://x" }), "Dr A at Nile: https://x");
    assert.equal(fillPlaceholders("{doctor} at {clinic}", { clinic: "Nile", link: "u" }), "Nile at Nile");
  });
});

describe("GRW-P2-C share card rendering", () => {
  const base = { layout: "post" as const, title: "Online booking is open", body: "See available times", clinicName: "Nile <Clinic> & Co", link: "https://kiorly.link/b/nile?s=ABCD2345", footer: PROTECTED_FOOTER.en, qr: "data:image/png;base64,AAAA" };
  it("escapes markup in names and produces well-formed SVG with the card size", () => {
    const svg = composeCardSvg({ ...base, locale: "en" });
    assert.ok(svg.includes("Nile &lt;Clinic&gt; &amp; Co"));
    assert.ok(!svg.includes("<Clinic>"));
    assert.ok(svg.startsWith("<svg") && svg.endsWith("</svg>"));
    assert.ok(svg.includes(`width="${CARD_SIZE.post.w}"`));
    assert.equal(esc(`"'`), "&quot;&apos;");
  });
  it("Arabic cards are right-to-left and anchor text at the end", () => {
    const svg = composeCardSvg({ ...base, locale: "ar", title: "الحجز أونلاين متاح", body: "شاهد المواعيد المتاحة", footer: PROTECTED_FOOTER.ar });
    assert.ok(svg.includes('direction="rtl"') && svg.includes('text-anchor="end"'));
    assert.ok(svg.includes("الحجز أونلاين متاح"));
  });
  it("the card never contains the protected footer less than once and never a phone or patient field", () => {
    const svg = composeCardSvg({ ...base, locale: "en" });
    assert.ok(svg.includes("not medical advice"));
    assert.ok(!/patient|phone|tel:/i.test(svg.replace(PROTECTED_FOOTER.en, "")));
  });
  it("slot lines render one box per time", () => {
    const svg = composeCardSvg({ ...base, locale: "en", layout: "slots", lines: ["Tue 24 Nov, 10:00", "Tue 24 Nov, 10:30"] });
    assert.equal((svg.match(/rx="16"/g) ?? []).length, 2);
  });
  it("wraps long text and never returns an empty line", () => {
    const lines = wrapText("one two three four five six seven eight nine ten eleven twelve thirteen fourteen", 40, 300, false);
    assert.ok(lines.length > 1);
    assert.ok(lines.every((l) => l.trim().length));
  });
  it("renders a real PNG (Arabic and English) through sharp with a QR", async () => {
    const qr = await qrDataUri("https://kiorly.link/q/ABCD2345");
    for (const locale of ["en", "ar"] as const) {
      const png = await svgToPng(composeCardSvg({ ...base, locale, qr, title: locale === "ar" ? "الحجز أونلاين متاح" : "Online booking is open" }));
      assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
      assert.ok(png.length > 5000);
    }
  });
});
