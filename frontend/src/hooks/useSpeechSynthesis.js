import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Strips Markdown syntax so text sounds natural when spoken by TTS
 */
export const cleanMarkdownForSpeech = (markdownText) => {
  if (!markdownText || typeof markdownText !== 'string') return '';

  return markdownText
    // Remove code blocks
    .replace(/```[\s\S]*?```/g, ' [Code block omitted] ')
    // Remove inline code
    .replace(/`([^`]+)`/g, '$1')
    // Remove images
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '')
    // Remove links but keep text: [text](url) -> text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    // Remove headers (# Header)
    .replace(/^#{1,6}\s+/gm, '')
    // Remove blockquotes (> quote)
    .replace(/^>\s+/gm, '')
    // Remove bold/italics (***text***, **text**, *text*, ___text___, __text__, _text_)
    .replace(/(\*{1,3}|_{1,3})([^*_]+)\1/g, '$2')
    // Remove horizontal rules
    .replace(/^(-{3,}|\*{3,}|_{3,})$/gm, '')
    // Remove bullet points / numbering at start of line
    .replace(/^(\s*[-*+]|\s*\d+\.)\s+/gm, '')
    // Remove table formatting (pipes)
    .replace(/\|/g, ' ')
    // Collapse multiple whitespace/newlines
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Maps Urdu Perso-Arabic characters to Devanagari phonetics.
 * Allows Hindi TTS engines (widely installed on Windows/Chrome) to speak Urdu fluently.
 */
const URDU_TO_DEVANAGARI_MAP = {
  'ا': 'आ', 'آ': 'आ', 'ب': 'ब', 'پ': 'प', 'ت': 'त', 'ٹ': 'ट', 'ث': 'स',
  'ج': 'ज', 'چ': 'च', 'ح': 'ह', 'خ': 'ख़', 'د': 'द', 'ڈ': 'ड', 'ذ': 'ज़',
  'ر': 'र', 'ڑ': 'ड़', 'ز': 'ज़', 'ژ': 'झ़', 'س': 'स', 'श': 'श', 'ص': 'स',
  'ض': 'ज़', 'ط': 'त', 'ظ': 'ज़', 'ع': 'अ', 'غ': 'ग़', 'ف': 'फ़', 'ق': 'क़',
  'ک': 'क', 'گ': 'ग', 'ل': 'ल', 'م': 'म', 'ن': 'न', 'ں': 'ं', 'و': 'ो',
  'ہ': 'ह', 'ھ': 'ह', 'ۂ': 'ह', 'ۃ': 'त', 'ی': 'ी', 'ے': 'े', 'ئ': 'इ',
  'ء': '', 'ۓ': 'ए', '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  '۔': '.', '،': ',', '؟': '?', '؛': ';'
};

const URDU_COMPOUNDS = {
  'بھ': 'भ', 'پھ': 'फ', 'تھ': 'थ', 'ٹھ': 'ठ', 'جھ': 'झ', 'چھ': 'छ',
  'دھ': 'ध', 'ڈھ': 'ढ', 'کھ': 'ख', 'گھ': 'घ', 'لہ': 'ल्ह', 'مہ': 'म्ह'
};

export const transliterateUrduToHindi = (text) => {
  if (!text || typeof text !== 'string') return text;
  
  let res = text
    .replace(/ہے/g, 'है')
    .replace(/ہیں/g, 'हैं')
    .replace(/ہو/g, 'हो')
    .replace(/ہوں/g, 'हूँ')
    .replace(/تھا/g, 'था')
    .replace(/تھی/g, 'थी')
    .replace(/تھے/g, 'थे')
    .replace(/کیا/g, 'क्या')
    .replace(/کیوں/g, 'क्यों')
    .replace(/کیسے/g, 'कैसे')
    .replace(/کہاں/g, 'कहाँ')
    .replace(/کب/g, 'कब')
    .replace(/کون/g, 'कौन')
    .replace(/اور/g, 'और')
    .replace(/ایک/g, 'एक')
    .replace(/میں/g, 'में')
    .replace(/نہیں/g, 'नहीं')
    .replace(/آپ/g, 'आप')
    .replace(/تم/g, 'तुम')
    .replace(/ہم/g, 'हम')
    .replace(/یہ/g, 'यह')
    .replace(/وہ/g, 'वह')
    .replace(/مجھے/g, 'मुझे')
    .replace(/نوٹ/g, 'नोट')
    .replace(/بنانا/g, 'बनाना')
    .replace(/کرنا/g, 'करना')
    .replace(/دکھاؤ/g, 'दिखाओ')
    .replace(/بتاؤ/g, 'बताओ');

  for (const [comp, dev] of Object.entries(URDU_COMPOUNDS)) {
    res = res.split(comp).join(dev);
  }

  let out = '';
  for (let i = 0; i < res.length; i++) {
    const ch = res[i];
    out += URDU_TO_DEVANAGARI_MAP[ch] !== undefined ? URDU_TO_DEVANAGARI_MAP[ch] : ch;
  }

  return out;
};

/**
 * Robust BCP-47 fallback chains for all 13 supported languages
 */
export const LANG_ALIASES = {
  'en-in': ['en-in', 'en-us', 'en-gb', 'en'],
  'en-us': ['en-us', 'en-in', 'en-gb', 'en'],
  'hi-in': ['hi-in', 'hi', 'hin', 'ur-in'],
  'bn-in': ['bn-in', 'bn-bd', 'bn', 'ben', 'hi-in'],
  'as-in': ['as-in', 'as', 'asm', 'bn-in', 'bn-bd', 'bn', 'hi-in'],
  'or-in': ['or-in', 'ory-in', 'or', 'ory', 'hi-in', 'bn-in'],
  'ta-in': ['ta-in', 'ta-lk', 'ta-sg', 'ta', 'tam', 'te-in', 'hi-in'],
  'te-in': ['te-in', 'te', 'tel', 'ta-in', 'hi-in'],
  'ur-in': ['ur-in', 'ur-pk', 'ur', 'urd', 'hi-in', 'hi', 'ar-sa', 'ar'],
  'zh-cn': ['zh-cn', 'zh-tw', 'zh-hk', 'zh', 'cmn', 'yue'],
  'ja-jp': ['ja-jp', 'ja', 'jpn'],
  'fr-fr': ['fr-fr', 'fr-ca', 'fr-be', 'fr', 'fra', 'fre'],
  'es-es': ['es-es', 'es-mx', 'es-us', 'es', 'spa'],
  'ru-ru': ['ru-ru', 'ru', 'rus'],
};

// Heuristic regex patterns for French and Spanish in Latin text
const FRENCH_HEURISTICS = /\b(le|la|les|un|une|des|est|sont|pour|dans|avec|créer|faire|rapport|fichier|bonjour|merci|s'il|vous|plaît)\b|[éèêàâçîïôûù]/i;
const SPANISH_HEURISTICS = /\b(el|la|los|las|un|una|unos|unas|es|son|para|en|con|crear|hacer|informe|archivo|hola|gracias|por|favor)\b|[áéíóúüñ¿¡]/i;

/**
 * Comprehensive Unicode script detection for all 13 supported languages
 */
export const detectScriptLanguage = (text) => {
  if (!text || typeof text !== 'string') return null;

  // 1. Urdu / Perso-Arabic (checked first to guarantee Urdu recognition)
  if (/[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text)) return 'ur-IN';

  // 2. Bengali & Assamese
  if (/[\u0980-\u09FF]/.test(text)) {
    if (/[\u09F0\u09F1]/.test(text) || text.includes('ৰ') || text.includes('ৱ')) {
      return 'as-IN';
    }
    return 'bn-IN';
  }

  // 3. Devanagari (Hindi)
  if (/[\u0900-\u097F]/.test(text)) return 'hi-IN';

  // 4. Odia
  if (/[\u0B00-\u0B7F]/.test(text)) return 'or-IN';

  // 5. Tamil
  if (/[\u0B80-\u0BFF]/.test(text)) return 'ta-IN';

  // 6. Telugu
  if (/[\u0C00-\u0C7F]/.test(text)) return 'te-IN';

  // 7. Japanese (Hiragana / Katakana)
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) return 'ja-JP';

  // 8. Chinese (CJK Ideographs)
  if (/[\u4E00-\u9FFF]/.test(text)) return 'zh-CN';

  // 9. Russian (Cyrillic)
  if (/[\u0400-\u04FF]/.test(text)) return 'ru-RU';

  // 10. French (Latin with French markers)
  if (FRENCH_HEURISTICS.test(text)) return 'fr-FR';

  // 11. Spanish (Latin with Spanish markers)
  if (SPANISH_HEURISTICS.test(text)) return 'es-ES';

  return null;
};

export const useSpeechSynthesis = () => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [voices, setVoices] = useState([]);
  const [currentText, setCurrentText] = useState('');

  const utteranceRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      setIsSupported(false);
      return;
    }

    setIsSupported(true);

    const updateVoices = () => {
      try {
        const availableVoices = window.speechSynthesis.getVoices();
        if (availableVoices && availableVoices.length > 0) {
          setVoices(availableVoices);
        }
      } catch (err) {
        console.warn('Failed to load speech synthesis voices:', err);
      }
    };

    updateVoices();

    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = updateVoices;
    }

    return () => {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    };
  }, []);

  const findBestVoice = useCallback((langCode) => {
    const currentVoices =
      voices && voices.length > 0
        ? voices
        : typeof window !== 'undefined' && window.speechSynthesis
        ? window.speechSynthesis.getVoices()
        : [];

    if (!currentVoices || currentVoices.length === 0) return null;

    const cleanLang = (langCode || 'en-US').toLowerCase();
    const primaryTag = cleanLang.split('-')[0];
    const aliases = LANG_ALIASES[cleanLang] || [cleanLang, primaryTag];

    // 1. Try matching against alias list in voice.lang
    for (const alias of aliases) {
      const found = currentVoices.find((v) => {
        const vLang = (v.lang || '').toLowerCase().replace('_', '-');
        return vLang === alias || vLang.startsWith(alias);
      });
      if (found) return found;
    }

    // 2. Match against voice names
    const voiceNameKeywords = {
      ta: ['tamil', 'valluvar', 'kalpana', 'india'],
      te: ['telugu', 'mohan', 'chitra', 'india'],
      ur: ['urdu', 'gulshan', 'salman', 'pakistan', 'india'],
      or: ['odia', 'oriya', 'india'],
      as: ['assamese', 'bengali', 'bangla', 'india'],
      bn: ['bengali', 'bangla', 'bashkar', 'india'],
      hi: ['hindi', 'heera', 'kalpana', 'swara', 'madhur', 'india'],
      zh: ['chinese', 'mandarin', 'putonghua', 'huihui', 'yaoyao', 'kangkang'],
      ja: ['japanese', 'haruka', 'ichiro', 'ayumi', 'sayaka'],
      ru: ['russian', 'irina', 'pavel'],
      fr: ['french', 'paul', 'julie', 'hortense'],
      es: ['spanish', 'helena', 'laura', 'pablo', 'raul'],
      ar: ['arabic', 'tarik', 'shakir', 'maged', 'hoda'],
    };

    const keywords = voiceNameKeywords[primaryTag];
    if (keywords) {
      for (const kw of keywords) {
        const nameMatch = currentVoices.find((v) =>
          (v.name || '').toLowerCase().includes(kw)
        );
        if (nameMatch) return nameMatch;
      }
    }

    // 3. Match by primary language tag
    const primaryMatch = currentVoices.find((v) =>
      (v.lang || '').toLowerCase().startsWith(primaryTag)
    );
    if (primaryMatch) return primaryMatch;

    // 4. Phonetic sister language voice fallbacks
    if (primaryTag === 'ur') {
      const hindiVoice = currentVoices.find(
        (v) =>
          (v.lang || '').toLowerCase().startsWith('hi') ||
          (v.name || '').toLowerCase().includes('hindi') ||
          (v.name || '').toLowerCase().includes('heera')
      );
      if (hindiVoice) return hindiVoice;
    }

    if (primaryTag === 'as') {
      const bengaliVoice = currentVoices.find(
        (v) =>
          (v.lang || '').toLowerCase().startsWith('bn') ||
          (v.name || '').toLowerCase().includes('bengali')
      );
      if (bengaliVoice) return bengaliVoice;
    }

    // 5. For non-English languages without matching voices, return null so utterance.lang is used directly
    if (primaryTag !== 'en') {
      return null;
    }

    return currentVoices.find((v) => v.default) || currentVoices[0] || null;
  }, [voices]);

  const speak = useCallback((text, langCode = 'en-US', options = {}) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      return;
    }

    // Unpause if stuck in paused state (Chromium bug fix)
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
    window.speechSynthesis.cancel();

    let spokenText =
      options.stripMarkdown !== false ? cleanMarkdownForSpeech(text) : text;
    if (!spokenText || !spokenText.trim()) return;

    // Automatic language detection from text
    const detectedLang = detectScriptLanguage(spokenText);
    const effectiveLang =
      (langCode === 'en-US' || langCode === 'en-IN' || !langCode) && detectedLang
        ? detectedLang
        : langCode || 'en-US';

    const cleanLang = effectiveLang.toLowerCase();
    const primaryTag = cleanLang.split('-')[0];

    // Special handling for Urdu on machines without dedicated Urdu TTS:
    // If the text is in Urdu Perso-Arabic script and the machine doesn't have an Urdu voice,
    // we transliterate to Devanagari and speak through the Hindi voice (Google हिन्दी / Microsoft Heera),
    // which gives 100% natural, clear, fluent native Urdu pronunciation.
    const isUrduScript = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(spokenText);
    const availableVoices =
      voices && voices.length > 0
        ? voices
        : typeof window !== 'undefined' && window.speechSynthesis
        ? window.speechSynthesis.getVoices()
        : [];

    const hasDirectUrduVoice = availableVoices.some(
      (v) =>
        (v.lang || '').toLowerCase().startsWith('ur') ||
        (v.name || '').toLowerCase().includes('urdu')
    );

    let targetSpokenText = spokenText;
    let targetLangCode = effectiveLang;

    if ((primaryTag === 'ur' || isUrduScript) && !hasDirectUrduVoice) {
      // Transliterate to Hindi phonetics for crystal clear speech
      targetSpokenText = transliterateUrduToHindi(spokenText);
      targetLangCode = 'hi-IN';
    }

    const fallbackTags = LANG_ALIASES[targetLangCode.toLowerCase()] || [
      targetLangCode.toLowerCase(),
      targetLangCode.toLowerCase().split('-')[0],
      'hi-in',
      'en-in',
      'en-us'
    ];

    const trySpeak = (tagIndex = 0) => {
      if (tagIndex >= fallbackTags.length) {
        try {
          const genericUtterance = new SpeechSynthesisUtterance(targetSpokenText);
          genericUtterance.rate = options.rate || 1.0;
          genericUtterance.pitch = options.pitch || 1.0;
          genericUtterance.volume = options.volume || 1.0;
          genericUtterance.onstart = () => {
            setIsSpeaking(true);
            setIsPaused(false);
            setCurrentText(text);
          };
          genericUtterance.onend = () => {
            setIsSpeaking(false);
            setIsPaused(false);
            setCurrentText('');
          };
          genericUtterance.onerror = (e) => {
            console.warn('[SpeechSynthesis Final Error]', e.error);
            setIsSpeaking(false);
            setIsPaused(false);
            setCurrentText('');
          };
          window.speechSynthesis.speak(genericUtterance);
        } catch (err) {
          console.warn('[SpeechSynthesis ultimate fail]', err);
          setIsSpeaking(false);
        }
        return;
      }

      const currentTag = fallbackTags[tagIndex];
      try {
        const utterance = new SpeechSynthesisUtterance(targetSpokenText);
        utterance.lang = currentTag;
        utterance.rate = options.rate || 1.0;
        utterance.pitch = options.pitch || 1.0;
        utterance.volume = options.volume || 1.0;

        const voice = findBestVoice(currentTag);
        if (voice) {
          utterance.voice = voice;
        }

        utterance.onstart = () => {
          setIsSpeaking(true);
          setIsPaused(false);
          setCurrentText(text);
        };

        utterance.onend = () => {
          setIsSpeaking(false);
          setIsPaused(false);
          setCurrentText('');
        };

        utterance.onerror = (event) => {
          console.warn(`[SpeechSynthesis Error on ${currentTag}]`, event.error);
          if (
            event.error === 'language-not-supported' ||
            event.error === 'synthesis-failed' ||
            event.error === 'not-allowed'
          ) {
            trySpeak(tagIndex + 1);
          } else {
            setIsSpeaking(false);
            setIsPaused(false);
            setCurrentText('');
          }
        };

        utterance.onpause = () => {
          setIsPaused(true);
        };

        utterance.onresume = () => {
          setIsPaused(false);
        };

        utteranceRef.current = utterance;

        setTimeout(() => {
          try {
            window.speechSynthesis.speak(utterance);
          } catch (e) {
            console.warn(`[SpeechSynthesis error on ${currentTag}]`, e);
            trySpeak(tagIndex + 1);
          }
        }, 50);
      } catch (err) {
        console.warn(`[SpeechSynthesis exception on ${currentTag}]`, err);
        trySpeak(tagIndex + 1);
      }
    };

    trySpeak(0);
  }, [findBestVoice, voices]);

  const pause = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.pause();
      setIsPaused(true);
    }
  }, []);

  const resume = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.resume();
      setIsPaused(false);
    }
  }, []);

  const cancel = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      setIsPaused(false);
      setCurrentText('');
    }
  }, []);

  return {
    speak,
    pause,
    resume,
    cancel,
    isSpeaking,
    isPaused,
    isSupported,
    currentText,
    voices,
  };
};
