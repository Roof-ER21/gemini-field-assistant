export enum PitchMode {
  COACH = 'COACH',
  ROLEPLAY = 'ROLEPLAY',
  JUST_LISTEN = 'JUST_LISTEN'
}

export enum DifficultyLevel {
  BEGINNER = 'BEGINNER',
  ROOKIE = 'ROOKIE',
  PRO = 'PRO',
  VETERAN = 'VETERAN',
  ELITE = 'ELITE',
  NIGHTMARE = 'NIGHTMARE'
}

export interface SessionConfig {
  mode: PitchMode;
  script?: string;
  scriptId?: string;  // Script ID for per-script roleplay behavior
  difficulty: DifficultyLevel;
  isMiniModule?: boolean;
  miniModuleId?: string;
  division: 'insurance' | 'retail';
}

export type AudioVolumeCallback = (volume: number) => void;

// ============================================
// Field Translator Types
// ============================================

// Extended language support - 20+ languages
export type SupportedLanguage =
  | 'en' | 'es' | 'zh' | 'vi' | 'ko' | 'pt' | 'ar'  // Original 7
  | 'fr' | 'ru' | 'tl' | 'hi' | 'ja' | 'de' | 'it'  // Common additions
  | 'pl' | 'ht' | 'pa' | 'uk' | 'fa' | 'th' | 'bn';  // More coverage

// Dialect codes for languages with regional variants
export type SupportedDialect =
  // Spanish variants (US focus: Mexican, Puerto Rican)
  | 'es-mx' | 'es-pr' | 'es-es' | 'es-ar' | 'es-co'
  // Arabic variants (US focus: Egyptian, Lebanese)
  | 'ar-eg' | 'ar-lb' | 'ar-sa' | 'ar-ma' | 'ar-ae'
  // Base languages (no specific dialect)
  | SupportedLanguage;

export interface LanguageConfig {
  code: SupportedLanguage;
  name: string;
  nativeName: string;
  voiceCode: string;
  flag: string;
}

// Dialect configuration for regional variants
export interface DialectConfig {
  code: SupportedDialect;
  parentLang: SupportedLanguage;
  name: string;
  nativeName: string;
  voiceCode: string;
  flag: string;
  region: string;
}

// US-focused dialect variants (priority dialects)
export const DIALECT_VARIANTS: DialectConfig[] = [
  // Spanish dialects - US focus first
  { code: 'es-mx', parentLang: 'es', name: 'Mexican Spanish', nativeName: 'Español Mexicano', voiceCode: 'es-MX', flag: '🇲🇽', region: 'Mexico' },
  { code: 'es-pr', parentLang: 'es', name: 'Puerto Rican Spanish', nativeName: 'Español Puertorriqueño', voiceCode: 'es-US', flag: '🇵🇷', region: 'Puerto Rico' },
  { code: 'es-es', parentLang: 'es', name: 'Castilian Spanish', nativeName: 'Español Castellano', voiceCode: 'es-ES', flag: '🇪🇸', region: 'Spain' },
  { code: 'es-ar', parentLang: 'es', name: 'Argentine Spanish', nativeName: 'Español Argentino', voiceCode: 'es-AR', flag: '🇦🇷', region: 'Argentina' },
  { code: 'es-co', parentLang: 'es', name: 'Colombian Spanish', nativeName: 'Español Colombiano', voiceCode: 'es-CO', flag: '🇨🇴', region: 'Colombia' },

  // Arabic dialects - US focus first
  { code: 'ar-eg', parentLang: 'ar', name: 'Egyptian Arabic', nativeName: 'مصري', voiceCode: 'ar-EG', flag: '🇪🇬', region: 'Egypt' },
  { code: 'ar-lb', parentLang: 'ar', name: 'Lebanese Arabic', nativeName: 'لبناني', voiceCode: 'ar-LB', flag: '🇱🇧', region: 'Lebanon' },
  { code: 'ar-sa', parentLang: 'ar', name: 'Saudi Arabic', nativeName: 'سعودي', voiceCode: 'ar-SA', flag: '🇸🇦', region: 'Saudi Arabia' },
  { code: 'ar-ma', parentLang: 'ar', name: 'Moroccan Arabic', nativeName: 'مغربي', voiceCode: 'ar-MA', flag: '🇲🇦', region: 'Morocco' },
  { code: 'ar-ae', parentLang: 'ar', name: 'Gulf Arabic', nativeName: 'خليجي', voiceCode: 'ar-AE', flag: '🇦🇪', region: 'UAE/Gulf' },
];

// Detection result with dialect information
export interface DetectionResult {
  language: SupportedLanguage;
  dialect?: SupportedDialect;
  confidence: number;
  region?: string;
}

// Helper to get dialect config by code
export const getDialectConfig = (code: SupportedDialect): DialectConfig | undefined => {
  return DIALECT_VARIANTS.find(d => d.code === code);
};

// Helper to get dialects for a parent language
export const getDialectsForLanguage = (lang: SupportedLanguage): DialectConfig[] => {
  return DIALECT_VARIANTS.filter(d => d.parentLang === lang);
};

export const SUPPORTED_LANGUAGES: LanguageConfig[] = [
  // Primary languages (most common in US)
  { code: 'en', name: 'English', nativeName: 'English', voiceCode: 'en-US', flag: '🇺🇸' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', voiceCode: 'es-MX', flag: '🇲🇽' },
  { code: 'zh', name: 'Chinese', nativeName: '中文', voiceCode: 'zh-CN', flag: '🇨🇳' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt', voiceCode: 'vi-VN', flag: '🇻🇳' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', voiceCode: 'ko-KR', flag: '🇰🇷' },
  { code: 'tl', name: 'Tagalog', nativeName: 'Tagalog', voiceCode: 'fil-PH', flag: '🇵🇭' },
  { code: 'fr', name: 'French', nativeName: 'Français', voiceCode: 'fr-FR', flag: '🇫🇷' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', voiceCode: 'ar-EG', flag: '🇪🇬' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', voiceCode: 'ru-RU', flag: '🇷🇺' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', voiceCode: 'pt-BR', flag: '🇧🇷' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', voiceCode: 'hi-IN', flag: '🇮🇳' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', voiceCode: 'de-DE', flag: '🇩🇪' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', voiceCode: 'ja-JP', flag: '🇯🇵' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', voiceCode: 'it-IT', flag: '🇮🇹' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski', voiceCode: 'pl-PL', flag: '🇵🇱' },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська', voiceCode: 'uk-UA', flag: '🇺🇦' },
  { code: 'fa', name: 'Persian', nativeName: 'فارسی', voiceCode: 'fa-IR', flag: '🇮🇷' },
  { code: 'th', name: 'Thai', nativeName: 'ไทย', voiceCode: 'th-TH', flag: '🇹🇭' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', voiceCode: 'bn-IN', flag: '🇧🇩' },
  { code: 'ht', name: 'Haitian Creole', nativeName: 'Kreyòl Ayisyen', voiceCode: 'ht-HT', flag: '🇭🇹' },
  { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', voiceCode: 'pa-IN', flag: '🇮🇳' },
];

export type PhraseCategory = 'greeting' | 'pitch' | 'insurance' | 'objection' | 'scheduling' | 'closing';

export interface QuickPhrase {
  id: string;
  category: PhraseCategory;
  englishText: string;
  createdBy: string; // 'system' | managerId
  scope: 'global' | 'personal';
  translations: Partial<Record<SupportedLanguage, string>>;
  createdAt: string;
}

export interface TranslationMessage {
  id: string;
  speaker: 'rep' | 'homeowner';
  originalText: string;
  originalLang: SupportedLanguage;
  translatedText: string;
  translatedLang: SupportedLanguage;
  timestamp: string;
}

export interface TranslationSession {
  id: string;
  userId: string;
  startTime: string;
  endTime?: string;
  targetLanguage: SupportedLanguage;
  messages: TranslationMessage[];
}

// ============================================
// Agnes the Linguist Types
// ============================================

/**
 * Agnes session states
 */
export type AgnesState =
  | 'idle'           // Ready to start, showing button
  | 'activating'     // Agnes says intro to rep
  | 'detecting'      // Listening for homeowner to detect language
  | 'introducing'    // Agnes introduces herself to homeowner
  | 'listening'      // Actively listening for speech
  | 'translating'    // Processing translation
  | 'speaking'       // Agnes speaking translation
  | 'ended';         // Session ended

/**
 * Agnes session data
 */
export interface AgnesSession {
  id: string;
  userId: string;
  startTime: Date;
  endTime?: Date;
  detectedLanguage?: SupportedLanguage;
  autoSpeak: boolean;
}
