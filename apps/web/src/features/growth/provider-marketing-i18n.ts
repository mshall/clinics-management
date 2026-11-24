import i18n from "@/lib/i18n";
import { pmAr, pmEn } from "./provider-marketing-strings";

/** GRW-P2-C: merged under `growth.pm` (deep merge keeps the existing growth keys). */
i18n.addResourceBundle("en", "translation", { growth: { pm: pmEn } }, true, false);
i18n.addResourceBundle("ar", "translation", { growth: { pm: pmAr } }, true, false);
