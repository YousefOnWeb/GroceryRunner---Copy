export const normalizeArabic = (text: string) => {
  if (!text) return '';
  return text
    // Remove Arabic diacritics (Tashkeel)
    .replace(/[\u0617-\u061A\u064B-\u0652]/g, '')
    // Normalize Alif forms
    .replace(/[أإآ]/g, 'ا')
    // Normalize Ta Marbuta to Ha
    .replace(/ة/g, 'ه')
    // Normalize Alef Maksura to Ya
    .replace(/ى/g, 'ي')
    // Remove extra spaces
    .trim()
    .replace(/\s+/g, ' ')
    // Convert to lowercase (for English characters mixed in)
    .toLowerCase();
};

// Groups of characters that are often typed by mistake due to keyboard proximity or phonetic similarity
const CONFUSION_GROUPS = [
  new Set(['ق', 'ف']),
  new Set(['غ', 'ع']),
  new Set(['خ', 'ح', 'ج']),
  new Set(['ش', 'س']),
  new Set(['ص', 'ض']),
  new Set(['ر', 'ز', 'و']),
  new Set(['ط', 'ك']),
  new Set(['م', 'ن']),
  new Set(['ت', 'ن', 'ب', 'ي']),
  new Set(['ذ', 'ز', 'ظ']),
  new Set(['ث', 'س', 'ص']),
  new Set(['ت', 'ط']),
  new Set(['ك', 'ق']),
  new Set(['د', 'ض']),
  new Set(['ح', 'ه']),
  new Set(['ء', 'ئ', 'ؤ']), // Hamza variations
];

const getSubstitutionCost = (charA: string, charB: string) => {
  if (charA === charB) return 0;
  
  // If they are in the same confusion group, the penalty is lower (0.4 instead of 1)
  for (const group of CONFUSION_GROUPS) {
    if (group.has(charA) && group.has(charB)) {
      return 0.4;
    }
  }
  return 1;
};

// Custom Levenshtein distance with weighted substitutions
export const weightedEditDistance = (source: string, target: string) => {
  if (source.length === 0) return target.length;
  if (target.length === 0) return source.length;

  const matrix = Array(source.length + 1).fill(null).map(() => Array(target.length + 1).fill(0));

  for (let i = 0; i <= source.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= target.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= source.length; i++) {
    for (let j = 1; j <= target.length; j++) {
      const charA = source[i - 1];
      const charB = target[j - 1];
      
      const cost = getSubstitutionCost(charA, charB);

      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );

      // Transposition (swapping adjacent characters)
      if (i > 1 && j > 1 && source[i - 1] === target[j - 2] && source[i - 2] === target[j - 1]) {
        matrix[i][j] = Math.min(matrix[i][j], matrix[i - 2][j - 2] + 0.5); // transposition cost 0.5
      }
    }
  }

  return matrix[source.length][target.length];
};

// Massive Arabic/Egyptian grocery corpus to make text correction highly reliable
export const COMMON_GROCERY_CORPUS = [
  // Fruits & Vegetables (Standard + Egyptian)
  'طماطم', 'قوطة', 'بندورة', 'خيار', 'بطاطس', 'بطاطا', 'بصل', 'توم', 'ثوم', 'فلفل', 'رومي', 'حامي', 'شطة',
  'لمون', 'ليمون', 'جزر', 'فاصوليا', 'بسلة', 'كوسة', 'بتنجان', 'باذنجان', 'ملوخية', 'بامية', 'باميه', 'قلقاس',
  'سبانخ', 'كرنب', 'قرنبيط', 'خس', 'جرجير', 'بقدونس', 'شبت', 'كزبرة', 'نعناع',
  'بطيخ', 'شمام', 'كنتالوب', 'مانجا', 'مانجو', 'موز', 'تفاح', 'برتقال', 'يوستفندي', 'يوسفي', 'جوافة',
  'رمان', 'فراولة', 'خوخ', 'مشمش', 'برقوق', 'عنب', 'بلح', 'تمر', 'تين',

  // Bakery & Carbs
  'عيش', 'خبز', 'رغيف', 'بلدي', 'فينو', 'شامي', 'توست', 'مكرونة', 'معكرونة', 'رز', 'ارز', 'أرز',
  'دقيق', 'طحين', 'شعرية', 'لسان عصفور', 'بقسماط', 'عجينة', 'خميرة',

  // Dairy
  'لبن', 'حليب', 'زبادي', 'رايب', 'جبنة', 'جبن', 'رومي', 'بيضا', 'براميلي', 'قريش', 'نستو', 'مثلثات',
  'شيدر', 'فلامنك', 'موتزاريلا', 'قشطة', 'زبدة', 'سمنة',

  // Proteins
  'لحمة', 'لحم', 'مفروم', 'بفتيك', 'كباب', 'فراخ', 'دجاج', 'بانيه', 'اوراك', 'صدور', 'كبدة', 'قوانص',
  'سمك', 'بلطي', 'بوري', 'جمبري', 'تونة', 'سردين', 'بيض', 'كرتونة بيض', 'لانشون', 'بسطرمة', 'سجق', 'سوسيس',

  // Pantry & Groceries
  'زيت', 'درة', 'ذرة', 'عباد', 'كريستال', 'عافية', 'زيتون', 'سكر', 'ملح', 'شاي', 'عروسة', 'ليبتون',
  'قهوة', 'بن', 'نسكافيه', 'صلصة', 'كاتشب', 'مايونيز', 'مسطردة', 'خل', 'طحينة', 'حلاوة', 'مربى', 'عسل',
  'فول', 'حمص', 'عدس', 'لوبيا', 'فاصوليا بيضا', 'فشار', 'مرقة', 'دجاج', 'بهارات', 'كمون', 'فلفل اسود',
  'ورق لورا', 'حبهان', 'قرفة',

  // Cleaning & Household
  'صابون', 'بريل', 'فيبا', 'اوكسي', 'اريال', 'برسيل', 'تايد', 'داوني', 'كلور', 'كلوروكس', 'سلك',
  'ليفة', 'سبونجة', 'ديتول', 'مناديل', 'فاين', 'بامبرز', 'حفاضات', 'معجون', 'اسنان', 'فرشاة',
  'شامبو', 'بلسم', 'شاور', 'صابونة', 'اكياس', 'زبالة', 'قمامة',

  // Snacks & Drinks
  'شيبسي', 'كرانشي', 'دوريتوس', 'بيبسي', 'كوكاكولا', 'سفن', 'سبرايت', 'ميراندا', 'فانتا', 'عصير',
  'جهينة', 'لمار', 'بسكوت', 'شوكولاتة', 'كيكة', 'لبان', 'ملبس', 'شيبس', 'مياه', 'ميه', 'معدنية'
];

// Common Arabic/Egyptian names for person suggestions
export const COMMON_NAMES_CORPUS = [
  'محمد', 'احمد', 'أحمد', 'محمود', 'علي', 'حسن', 'حسين', 'مصطفى', 'إبراهيم', 'ابراهيم', 'يوسف', 'عمر',
  'عبدالله', 'عبدالرحمن', 'خالد', 'طارق', 'عمرو', 'هشام', 'كريم', 'رامي', 'شادي', 'وليد', 'هاني', 'تامر',
  'اشرف', 'سيد', 'سمير', 'عادل', 'سالم', 'سعيد', 'زياد', 'ياسين', 'سيف', 'مروان', 'مازن', 'أمير', 'امير',
  'فاطمة', 'مريم', 'عائشة', 'خديجة', 'زينب', 'سارة', 'ندى', 'منى', 'هدى', 'ياسمين', 'سلمى', 'مي', 'مها',
  'ريهام', 'دينا', 'شيماء', 'هبة', 'نهى', 'سمر', 'عبير', 'سحر', 'أمل', 'رشا', 'داليا', 'نورة', 'ام', 'أبو', 'ابو'
];

/**
 * Finds the best suggestion for an input string based on a provided corpus.
 * Returns null if no good suggestion is found.
 */
export const findSmartSuggestion = (input: string, corpus: string[], threshold = 1.5) => {
  if (!input || input.trim().length < 3) return null; // Don't suggest for very short inputs

  const normalizedInput = normalizeArabic(input);
  
  let bestMatch = null;
  let minDistance = Infinity;

  // We loop through the corpus
  for (const word of corpus) {
    const normalizedWord = normalizeArabic(word);
    
    // Exact match after normalization means we don't need to suggest a correction
    // (e.g. they typed "رغيف", it normalizes to "رغيف", corpus has "رغيف")
    // OR they typed "احمد", normalizes to "احمد", corpus has "أحمد" which normalizes to "احمد".
    // In these cases, it's virtually the same word, no need to annoy the user with a suggestion 
    // unless the formatting is significantly different and preferred.
    if (normalizedInput === normalizedWord) {
      if (input !== word && input.length >= 3) {
         // If they type احمد but corpus has أحمد, maybe suggest the proper one, but it's optional.
         // Let's just return null to not be annoying about Alifs unless requested.
         return null; 
      }
      return null;
    }

    const distance = weightedEditDistance(normalizedInput, normalizedWord);
    
    // To prevent matching completely different short words, distance should scale with length
    // e.g., max allowed distance = 1.5 for a 4 letter word.
    const maxAllowedDistance = Math.min(threshold, Math.max(1, normalizedInput.length * 0.35));

    if (distance <= maxAllowedDistance && distance < minDistance) {
      minDistance = distance;
      bestMatch = word;
    }
  }

  // Only suggest if the suggestion is actually different from the original input
  if (bestMatch && bestMatch !== input) {
    return bestMatch;
  }

  return null;
};
