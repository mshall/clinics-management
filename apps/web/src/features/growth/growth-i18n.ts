import i18n from "@/lib/i18n";
import { growthAr, growthEn } from "./growth-strings";

/** Merged into the app translations at import (the shared locale files stay untouched, same pattern as the Kiorex tab). */
i18n.addResourceBundle("en", "translation", { growth: growthEn }, true, false);
i18n.addResourceBundle("ar", "translation", { growth: growthAr }, true, false);
