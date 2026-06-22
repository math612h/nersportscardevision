import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import da from "./locales/da.json";
import en from "./locales/en.json";
import de from "./locales/de.json";
import fr from "./locales/fr.json";
import es from "./locales/es.json";
import it from "./locales/it.json";
import ru from "./locales/ru.json";
import zh from "./locales/zh.json";

export const SUPPORTED_LANGUAGES = [
  { code: "da", label: "Dansk", flag: "🇩🇰" },
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "it", label: "Italiano", flag: "🇮🇹" },
  { code: "ru", label: "Русский", flag: "🇷🇺" },
  { code: "zh", label: "中文", flag: "🇨🇳" },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];

export const GUEST_LANG_STORAGE_KEY = "lmu-guest-lang";

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources: {
      da: { translation: da },
      en: { translation: en },
      de: { translation: de },
      fr: { translation: fr },
      es: { translation: es },
      it: { translation: it },
      ru: { translation: ru },
      zh: { translation: zh },
    },
    lng: "da",
    fallbackLng: "da",
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
}

export default i18n;
