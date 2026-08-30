import re

# Comprehensive Unicode script patterns for all 13 supported languages
SCRIPT_PATTERNS = {
    'hindi': re.compile(r'[\u0900-\u097F]'),                                # Devanagari script
    'bengali': re.compile(r'[\u0980-\u09FF]'),                              # Bengali / Assamese script
    'odia': re.compile(r'[\u0B00-\u0B7F]'),                                 # Odia script
    'urdu': re.compile(r'[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]'), # Perso-Arabic script
    'tamil': re.compile(r'[\u0B80-\u0BFF]'),                                # Tamil script
    'telugu': re.compile(r'[\u0C00-\u0C7F]'),                               # Telugu script
    'japanese': re.compile(r'[\u3040-\u309F\u30A0-\u30FF]'),                # Hiragana & Katakana
    'chinese': re.compile(r'[\u4E00-\u9FFF]'),                              # CJK Ideographs
    'russian': re.compile(r'[\u0400-\u04FF]'),                              # Cyrillic script
}

# Latin-script language heuristics for French and Spanish
FRENCH_MARKERS = re.compile(r'\b(le|la|les|un|une|des|est|sont|pour|dans|avec|créer|faire|rapport|fichier|bonjour|merci)\b', re.IGNORECASE)
SPANISH_MARKERS = re.compile(r'\b(el|la|los|las|un|una|unos|unas|es|son|para|en|con|crear|hacer|informe|archivo|hola|gracias)\b', re.IGNORECASE)

LANGUAGE_NAMES = {
    'hindi': 'Hindi (हिन्दी)',
    'bengali': 'Bengali (বাংলা)',
    'odia': 'Odia (ଓଡ଼ିଆ)',
    'urdu': 'Urdu (اردو)',
    'tamil': 'Tamil (தமிழ்)',
    'telugu': 'Telugu (తెలుగు)',
    'assamese': 'Assamese (অসমীয়া)',
    'chinese': 'Chinese (中文)',
    'japanese': 'Japanese (日本語)',
    'french': 'French (Français)',
    'spanish': 'Spanish (Español)',
    'russian': 'Russian (Русский)',
    'english': 'English',
}

def detect_language(text: str) -> str:
    """
    Detects if the input text contains Indic, CJK, Cyrillic, or Latin-based languages.
    Returns one of the 13 supported language keys.
    """
    if not text or not isinstance(text, str):
        return 'english'

    counts = {}
    for lang, pattern in SCRIPT_PATTERNS.items():
        matches = pattern.findall(text)
        if matches:
            counts[lang] = len(matches)

    if counts:
        dominant_lang = max(counts, key=counts.get)
        # Check for Japanese mixed with Kanji
        if dominant_lang == 'chinese' and SCRIPT_PATTERNS['japanese'].search(text):
            return 'japanese'
        # Check for Assamese distinctive characters within Bengali script
        if dominant_lang == 'bengali' and ('ৰ' in text or 'ৱ' in text):
            return 'assamese'
        return dominant_lang

    # Latin text heuristics
    if FRENCH_MARKERS.search(text):
        return 'french'
    if SPANISH_MARKERS.search(text):
        return 'spanish'

    return 'english'


def enhance_system_instruction(base_instruction: str, problem_statement: str) -> str:
    """
    Enriches the base system instruction with multilingual directives tailored for
    NVIDIA Nemotron / LLMs across all 13 supported languages.
    """
    detected_lang = detect_language(problem_statement)
    lang_display = LANGUAGE_NAMES.get(detected_lang, 'English')

    multilingual_directive = (
        f"\n\nMULTILINGUAL INTERACTION DIRECTIVE:\n"
        f"- Target Prompt Language Detected: {lang_display}.\n"
        f"- You fully support multilingual interaction, with deep fluency in 13 languages:\n"
        f"  * Indic: English, Hindi (हिन्दी), Bengali (বাংলা), Odia (ଓଡ଼ିଆ), Urdu (اردو), Tamil (தமிழ்), Telugu (తెలుగు), Assamese (অসমীয়া).\n"
        f"  * Global: Chinese (中文), Japanese (日本語), French (Français), Spanish (Español), Russian (Русский).\n"
        f"- If the user's prompt or task is in any of these languages, understand the intent, entities, and requirements accurately.\n"
        f"- Formulate tool arguments accurately (translating search queries or file names to English/ASCII where appropriate for system tools).\n"
        f"- Deliver your final natural-language response in the SAME language used by the user ({lang_display}), while preserving code blocks, technical syntax, and terminal commands clearly in standard format.\n"
        f"- If the user switches languages or uses Romanized Indic text (Hinglish, Benglish, etc.), adapt naturally and respond with clarity.\n"
    )

    return base_instruction + multilingual_directive
