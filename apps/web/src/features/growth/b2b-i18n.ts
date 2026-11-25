import i18n from "@/lib/i18n";
import { b2bAr, b2bEn } from "./b2b-strings";

/** GRW-P4-C: merged under `growth.b2b` (deep merge keeps the existing growth keys). */
i18n.addResourceBundle("en", "translation", { growth: { b2b: b2bEn } }, true, false);
i18n.addResourceBundle("ar", "translation", { growth: { b2b: b2bAr } }, true, false);
