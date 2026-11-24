import i18n from "@/lib/i18n";
import { creditsAr, creditsEn } from "./credits-strings";

/** Merged under `credits` at import (the shared locale files stay untouched, same pattern as growth). */
i18n.addResourceBundle("en", "translation", { credits: creditsEn }, true, false);
i18n.addResourceBundle("ar", "translation", { credits: creditsAr }, true, false);
