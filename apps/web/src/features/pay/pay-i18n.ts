import i18n from "@/lib/i18n";
import { payAr, payEn } from "./pay-strings";

/** Merged under `pay` at import (the shared locale files stay untouched, same pattern as credits and growth). */
i18n.addResourceBundle("en", "translation", { pay: payEn }, true, false);
i18n.addResourceBundle("ar", "translation", { pay: payAr }, true, false);
