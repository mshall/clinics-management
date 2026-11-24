# Content guard terms (GRW-P2-C)

The closed deny list that `apps/api/src/growth/provider-marketing/content-guard.ts` applies to every provider-facing share text (the optional custom line, and the composed caption of every template and slot card). Matching is on normalised text: case folded, Arabic diacritics and tatweel removed, alef, yeh and teh-marbuta variants unified, Arabic-Indic digits mapped to ASCII, whole words only (so "secure" is not "cure").

| Category | English | Arabic |
|---|---|---|
| GUARANTEE | guarantee, guaranteed, guarantees, risk free, no risk, assured result, promise results, 100% | ضمان، نضمن، مضمون، بدون مخاطر، نتيجة مؤكدة، 100% |
| CURE | cure, cures, cured, permanent cure, miracle, miraculous, heals completely, complete recovery, eliminates disease | علاج نهائي، شفاء تام، شفاء كامل، نشفيك، معجزة، علاج جذري |
| COMPARISON | cheapest, lowest price, lowest fees, cheaper than, better than other, best price, price match, half price | الأرخص، أرخص، أقل سعر، أفضل سعر، أسعار منافسة، نصف السعر |
| SUPERLATIVE | best doctor, best clinic, number one, no. 1, #1, top doctor, leading doctor, the best | أفضل دكتور، أفضل طبيب، أفضل عيادة، رقم واحد، الأحسن |
| TESTIMONIAL | testimonial(s), patients say, what our patients say, my patient said, reviews say, 5 star, five star, rated by patients | شهادات المرضى، شهادة مريض، آراء المرضى، المرضى يقولون، قال لي مريض، 5 نجوم |
| BEFORE_AFTER | before and after, before/after, results gallery, transformation | قبل وبعد، صور النتائج، نتائج حقيقية |
| PRESSURE | hurry, limited time, last chance, only today, act now, don't miss, slots running out | الحق، فرصة أخيرة، لفترة محدودة، اليوم فقط، لا تفوت، العرض ينتهي |
| OVERTREATMENT | extra treatment, additional procedures, upgrade your treatment, unlimited sessions, full body check, buy a package, package deal, free procedure | جلسات إضافية، إجراءات إضافية، باقة علاجية، جلسات غير محدودة، إجراء مجاني، فحص شامل مجاني |

Rules around the list: a provider can add one line of at most 140 characters (web addresses are stripped); the protected footer is appended by the server and is not editable; the approved templates and the footer are themselves tested against this list in both languages. **NEEDS_HUMAN (NH-GRW-C1):** the list is deliberately strict until the founder's advertising counsel reviews Egyptian medical-advertising rules (Ministry of Health and Syndicate); counsel may loosen or extend it, and the Arabic and English template and footer wording needs the same review.
