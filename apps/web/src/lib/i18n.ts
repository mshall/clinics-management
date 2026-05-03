import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ar from "@/locales/ar.json";
import en from "@/locales/en.json";

export const supportedLngs = ["en", "ar"] as const;
export type AppLocale = (typeof supportedLngs)[number];

function applyDocumentDirection(lng: string) {
  const rtl = lng === "ar";
  document.documentElement.dir = rtl ? "rtl" : "ltr";
  document.documentElement.lang = lng;
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ar: { translation: ar },
  },
  lng: localStorage.getItem("cms_locale") ?? "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

applyDocumentDirection(i18n.language);
i18n.on("languageChanged", applyDocumentDirection);

export default i18n;
