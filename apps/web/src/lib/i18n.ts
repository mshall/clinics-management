import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ar from "@/locales/ar.json";
import en from "@/locales/en.json";
import { persistLocale, readStoredLocale } from "@/lib/locale-cookie";

export const supportedLngs = ["en", "ar"] as const;
export type AppLocale = (typeof supportedLngs)[number];

function applyDocumentDirection(lng: string) {
  const rtl = lng === "ar";
  document.documentElement.dir = rtl ? "rtl" : "ltr";
  document.documentElement.lang = lng;
}

const initialLocale = readStoredLocale();

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ar: { translation: ar },
  },
  lng: initialLocale,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

applyDocumentDirection(i18n.language);
i18n.on("languageChanged", (lng) => {
  applyDocumentDirection(lng);
  persistLocale(lng as AppLocale);
});

export default i18n;
