import i18n from "@/lib/i18n";
import { ar, en } from "./kiorex-connect-strings";

/** Merged into the app translations at import (the shared locale files stay untouched). */
i18n.addResourceBundle("en", "translation", { kiorexConnect: en }, true, false);
i18n.addResourceBundle("ar", "translation", { kiorexConnect: ar }, true, false);
