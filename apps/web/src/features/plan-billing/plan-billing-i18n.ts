import i18n from "@/lib/i18n";
import { planBillingAr, planBillingEn } from "./plan-billing-strings";

/** Merged under `planBilling` at import (the shared locale files stay untouched, same pattern as credits and growth). */
i18n.addResourceBundle("en", "translation", { planBilling: planBillingEn }, true, false);
i18n.addResourceBundle("ar", "translation", { planBilling: planBillingAr }, true, false);
