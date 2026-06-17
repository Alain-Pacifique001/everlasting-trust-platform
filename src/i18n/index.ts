import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './locales/en';
import fr from './locales/fr';
import rw from './locales/rw';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en, fr, rw },
    fallbackLng: 'en',
    supportedLngs: ['en', 'fr', 'rw'],
    interpolation: { escapeValue: false },
  });

const applyDir = (lng: string) => {
  if (typeof document !== 'undefined') {
    document.documentElement.dir = 'ltr';
    document.documentElement.lang = lng;
  }
};
applyDir(i18n.language);
i18n.on('languageChanged', applyDir);

export default i18n;
