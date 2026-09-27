/** Local interface language only. Never pass user content through translation. */
import { create } from 'zustand';

export type Language = 'en' | 'zh';
export type Translate = (english: string, chinese: string) => string;
export const LANGUAGE_STORAGE_KEY = 'journey-notes.language';

export function loadLanguage(): Language {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored === 'en' || stored === 'zh') return stored;
  } catch {
    // Storage restrictions must not prevent opening a notebook.
  }
  return typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('zh')
    ? 'zh'
    : 'en';
}

const translators: Record<Language, Translate> = {
  en: (english) => english,
  zh: (_english, chinese) => chinese,
};

interface LanguageStore {
  language: Language;
  setLanguage: (language: Language) => void;
}

export const useLanguageStore = create<LanguageStore>((set) => ({
  language: loadLanguage(),
  setLanguage: (language) => {
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // The in-session preference still works if persistence is unavailable.
    }
    set({ language });
  },
}));

/** Stable translator per language, safe in hooks' dependency lists. */
export function useI18n() {
  const language = useLanguageStore((state) => state.language);
  return { language, t: translators[language] };
}

/** For presentation helpers outside React; consuming views subscribe with useI18n. */
export function translate(english: string, chinese: string): string {
  return translators[useLanguageStore.getState().language](english, chinese);
}

export function getIntlLocale(): 'en-US' | 'zh-CN' {
  return useLanguageStore.getState().language === 'zh' ? 'zh-CN' : 'en-US';
}
