import i18n from "@/lib/i18n";
import { doorAr, doorEn } from "./kiorex-door-strings";
import { marketingAr, marketingEn } from "./kiorex-marketing-strings";

/** Merged into the app translations at import (the shared locale files stay untouched). */
i18n.addResourceBundle("en", "translation", { kiorexMarketing: marketingEn, kiorexDoor: doorEn }, true, false);
i18n.addResourceBundle("ar", "translation", { kiorexMarketing: marketingAr, kiorexDoor: doorAr }, true, false);
