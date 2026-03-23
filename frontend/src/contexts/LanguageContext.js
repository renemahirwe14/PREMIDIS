import React, { createContext, useContext, useState, useEffect } from 'react';
import frTranslations from '../locales/fr.json';
import enTranslations from '../locales/en.json';
import swTranslations from '../locales/sw.json';
import hiTranslations from '../locales/hi.json';

const LanguageContext = createContext(null);

const translations = {
  fr: frTranslations,
  en: enTranslations,
  sw: swTranslations,
  hi: hiTranslations
};

export const LanguageProvider = ({ children }) => {
  const [language, setLanguage] = useState(localStorage.getItem('language') || 'fr');

  useEffect(() => {
    localStorage.setItem('language', language);
    document.documentElement.lang = language;
  }, [language]);

  const t = (key) => {
    // Get translation for current language
    const translation = translations[language]?.[key];
    if (translation) return translation;

    // Fallback: try French
    if (language !== 'fr' && translations.fr?.[key]) {
      return translations.fr[key];
    }

    // Fallback: try English
    if (language !== 'en' && translations.en?.[key]) {
      return translations.en[key];
    }

    // If no translation found, return key formatted nicely
    const lastPart = key.includes('.') ? key.split('.').pop() : key;
    return lastPart
      .replace(/([A-Z])/g, ' $1')
      .replace(/[._-]/g, ' ')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  };

  const changeLanguage = (lang) => {
    if (translations[lang]) {
      setLanguage(lang);
    }
  };

  return (
    <LanguageContext.Provider value={{
      language,
      setLanguage: changeLanguage,
      t,
      availableLanguages: [
        { code: 'fr', name: 'Francais', flag: '🇫🇷' },
        { code: 'en', name: 'English', flag: '🇬🇧' },
        { code: 'sw', name: 'Kiswahili', flag: '🇹🇿' },
        { code: 'hi', name: 'हिन्दी', flag: '🇮🇳' }
      ]
    }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};

export default LanguageContext;
