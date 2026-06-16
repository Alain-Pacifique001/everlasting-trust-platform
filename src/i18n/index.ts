import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './locales/en';
import fr from './locales/fr';
import rw from './locales/rw';
import zh from './locales/zh';
import sw from './locales/sw';
import es from './locales/es';
import ar from './locales/ar';
import pt from './locales/pt';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en, fr, rw, zh, sw, es, ar, pt },
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });

// Set RTL direction for Arabic
const applyDir = (lng: string) => {
  if (typeof document !== 'undefined') {
    document.documentElement.dir = lng === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lng;
  }
};
applyDir(i18n.language);
i18n.on('languageChanged', applyDir);

export default i18n;
