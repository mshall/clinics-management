import i18n from "@/lib/i18n";
import { promotionsAr, promotionsEn } from "./promotions-strings";

/** Merged under `promotions` at import (the shared locale files stay untouched, same pattern as credits). */
i18n.addResourceBundle("en", "translation", { promotions: promotionsEn }, true, false);
i18n.addResourceBundle("ar", "translation", { promotions: promotionsAr }, true, false);
