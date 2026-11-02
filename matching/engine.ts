import { ItemRecord, ScoreBreakdown } from '../db/repository.ts';

// Comprehensive stopwords: connectors and generic words that carry little item-identifying value
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'in', 'on', 'at', 'with', 'by', 'for', 'of', 'to',
  'my', 'is', 'it', 'was', 'near', 'beside', 'around', 'about', 'from', 'some', 'has',
  'had', 'have', 'been', 'this', 'that', 'there', 'here', 'please', 'help', 'lost',
  'found', 'item', 'anyone', 'contact', 'yesterday', 'today', 'morning', 'evening',
  'left', 'behind', 'somewhere', 'around', 'very', 'really', 'got', 'losted'
]);

// Adjectives and descriptors that should not be mistaken for the primary object noun
const ADJECTIVE_MODIFIERS = new Set([
  'black', 'blue', 'red', 'green', 'yellow', 'white', 'grey', 'gray', 'brown', 'purple',
  'orange', 'silver', 'golden', 'gold', 'metallic', 'matte', 'dark', 'light', 'small',
  'large', 'big', 'mini', 'leather', 'plastic', 'metal', 'wooden', 'cotton', 'denim',
  'nylon', 'rubber', 'old', 'new', 'used', 'clean', 'simple', 'branded', 'casual', 'formal'
]);

// Controlled Primary Object Taxonomy: Distinguishes fundamentally different physical objects
const PRIMARY_OBJECTS: Record<string, string> = {
  // Wallets (Pocket bills/cards carriers)
  wallet: 'wallet',
  billfold: 'wallet',
  pocketbook: 'wallet',

  // Handbags & Purses (Distinct larger carrying bags)
  handbag: 'handbag',
  purse: 'handbag',
  clutch: 'handbag',
  shoulderbag: 'handbag',
  tote: 'handbag',

  // Backpacks & School Bags
  backpack: 'backpack',
  rucksack: 'backpack',
  knapsack: 'backpack',
  schoolbag: 'backpack',
  bookbag: 'backpack',
  bag: 'bag',
  duffel: 'bag',

  // Mobile / Smart Phones
  phone: 'phone',
  mobile: 'phone',
  smartphone: 'phone',
  iphone: 'phone',
  cellphone: 'phone',
  handset: 'phone',

  // Computers & Laptops
  laptop: 'laptop',
  notebook: 'laptop',
  macbook: 'laptop',
  chromebook: 'laptop',

  // Tablets
  tablet: 'tablet',
  ipad: 'tablet',

  // Keys
  keys: 'keys',
  key: 'keys',
  keychain: 'keys',
  keyring: 'keys',

  // Audio Accessories
  earphones: 'audio',
  earbuds: 'audio',
  headphones: 'audio',
  airpods: 'audio',
  headset: 'audio',

  // Timepieces
  watch: 'watch',
  smartwatch: 'watch',
  timepiece: 'watch',
  wristwatch: 'watch',

  // Eyewear
  glasses: 'glasses',
  spectacles: 'glasses',
  sunglasses: 'glasses',
  shades: 'glasses',
  eyewear: 'glasses',

  // Cards & Identification
  id: 'card',
  card: 'card',
  license: 'card',
  pass: 'card',

  // Paperwork & Passports
  passport: 'document',
  document: 'document',
  documents: 'document',
  certificate: 'document',
  file: 'document',

  // Bottles & Drinkware
  bottle: 'bottle',
  flask: 'bottle',
  thermos: 'bottle',
  sipper: 'bottle',
  tumbler: 'bottle',

  // Umbrellas
  umbrella: 'umbrella',
  parasol: 'umbrella',

  // Footwear
  shoes: 'shoes',
  sneakers: 'shoes',
  footwear: 'shoes',
  boots: 'shoes',
  sandals: 'shoes',

  // Outerwear & Clothing
  jacket: 'clothing',
  hoodie: 'clothing',
  coat: 'clothing',
  sweater: 'clothing',
  shirt: 'clothing',
  cap: 'hat',
  hat: 'hat',
};

// Set of recognized canonical object types for robust conflict detection
const CANONICAL_OBJECT_TYPES = new Set(Object.values(PRIMARY_OBJECTS));

// Known brands for contradiction detection & bonus matching
const KNOWN_BRANDS = [
  'apple', 'samsung', 'dell', 'hp', 'lenovo', 'asus', 'acer', 'sony', 'bose',
  'nike', 'adidas', 'puma', 'reebok', 'under armour',
  'wildcraft', 'american tourister', 'skybags', 'fastrack', 'fossil', 'casio',
  'titan', 'rolex', 'timex', 'boat', 'oneplus', 'xiaomi', 'realme', 'oppo', 'vivo'
];

// Known materials
const KNOWN_MATERIALS = [
  'leather', 'metal', 'plastic', 'canvas', 'fabric', 'denim', 'nylon', 'rubber', 'wood', 'glass'
];

// Distinctive identifying features
const DISTINCTIVE_FEATURES = [
  'star sticker', 'sticker', 'college id', 'student id', 'driving licence', 'driving license',
  'bank card', 'credit card', 'debit card', 'silver logo', 'gold logo', 'cracked screen',
  'scratched', 'engraved', 'initials', 'silver emblem', 'broken strap', 'yellow ribbon'
];

export function tokenize(text: string): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 1 && !STOP_WORDS.has(word));
}

// Nuanced color grouping: Avoids overbroad assumptions (e.g. dark != black, teal != blue)
interface ColorDescriptor {
  family: string;
  isNuance?: boolean;
  modifier?: boolean;
}

const COLOR_MAP: Record<string, ColorDescriptor> = {
  black: { family: 'black' },
  charcoal: { family: 'black', isNuance: true },
  ebony: { family: 'black' },
  jet: { family: 'black' },

  blue: { family: 'blue' },
  navy: { family: 'blue', isNuance: true },
  indigo: { family: 'blue', isNuance: true },
  azure: { family: 'blue', isNuance: true },
  sky: { family: 'blue', isNuance: true },

  // Distinct shades that must NOT be treated as identical to plain blue
  teal: { family: 'teal' },
  cyan: { family: 'cyan' },

  red: { family: 'red' },
  crimson: { family: 'red', isNuance: true },
  scarlet: { family: 'red', isNuance: true },
  ruby: { family: 'red', isNuance: true },
  maroon: { family: 'maroon' }, // Distinct dark red
  burgundy: { family: 'maroon', isNuance: true },

  silver: { family: 'silver' },
  grey: { family: 'silver' },
  gray: { family: 'silver' },
  metallic: { family: 'silver' },
  steel: { family: 'silver' },
  chrome: { family: 'silver' },

  white: { family: 'white' },
  ivory: { family: 'white', isNuance: true },
  cream: { family: 'white', isNuance: true },
  offwhite: { family: 'white', isNuance: true },

  brown: { family: 'brown' },
  tan: { family: 'brown', isNuance: true },
  khaki: { family: 'brown', isNuance: true },
  beige: { family: 'brown', isNuance: true },
  coffee: { family: 'brown', isNuance: true },
  chocolate: { family: 'brown', isNuance: true },

  green: { family: 'green' },
  olive: { family: 'green', isNuance: true },
  mint: { family: 'green', isNuance: true },
  emerald: { family: 'green', isNuance: true },
  lime: { family: 'green', isNuance: true },
  forest: { family: 'green', isNuance: true },

  yellow: { family: 'yellow' },
  amber: { family: 'yellow', isNuance: true },

  // Gold is distinct metallic
  gold: { family: 'gold' },
  golden: { family: 'gold' },

  purple: { family: 'purple' },
  violet: { family: 'purple', isNuance: true },
  lavender: { family: 'purple', isNuance: true },
  magenta: { family: 'purple', isNuance: true },

  orange: { family: 'orange' },
  peach: { family: 'orange', isNuance: true },
  coral: { family: 'orange', isNuance: true },
  rust: { family: 'orange', isNuance: true },

  pink: { family: 'pink' },
  rose: { family: 'pink', isNuance: true },

  // Modifiers
  dark: { family: 'modifier_dark', modifier: true },
  light: { family: 'modifier_light', modifier: true },
};

export function parseColors(colorStr: string): { families: Set<string>; exact: Set<string>; hasDarkMod: boolean; hasLightMod: boolean } {
  if (!colorStr) return { families: new Set(), exact: new Set(), hasDarkMod: false, hasLightMod: false };
  const tokens = tokenize(colorStr);
  const families = new Set<string>();
  const exact = new Set<string>();
  let hasDarkMod = false;
  let hasLightMod = false;

  for (const t of tokens) {
    exact.add(t);
    const mapped = COLOR_MAP[t];
    if (mapped) {
      if (mapped.modifier) {
        if (t === 'dark') hasDarkMod = true;
        if (t === 'light') hasLightMod = true;
      } else {
        families.add(mapped.family);
      }
    } else {
      families.add(t);
    }
  }

  return { families, exact, hasDarkMod, hasLightMod };
}

/**
 * Extracts the primary physical object noun from item name and description
 */
function extractPrimaryObject(name: string, description = ''): { objectType: string | null; nounTokens: string[] } {
  const nameTokens = tokenize(name);
  const descTokens = tokenize(description);

  // 1. Check direct name matches in primary object dictionary
  for (const t of nameTokens) {
    if (PRIMARY_OBJECTS[t]) {
      return { objectType: PRIMARY_OBJECTS[t], nounTokens: [t] };
    }
  }

  // 2. Check compound items (e.g. "mobile phone", "water bottle", "backpack")
  const combined = name.toLowerCase();
  for (const [term, canonical] of Object.entries(PRIMARY_OBJECTS)) {
    if (combined.includes(term)) {
      return { objectType: canonical, nounTokens: [term] };
    }
  }

  // 3. Check description as secondary fallback
  for (const t of descTokens.slice(0, 5)) {
    if (PRIMARY_OBJECTS[t]) {
      return { objectType: PRIMARY_OBJECTS[t], nounTokens: [t] };
    }
  }

  // 4. Return non-modifier noun if any
  const fallbackNouns = nameTokens.filter(t => !ADJECTIVE_MODIFIERS.has(t));
  return { objectType: fallbackNouns[0] || null, nounTokens: fallbackNouns };
}

/**
 * Extracts brands from text
 */
function extractBrand(text: string): string | null {
  const lower = text.toLowerCase();
  for (const b of KNOWN_BRANDS) {
    if (new RegExp(`\\b${b}\\b`, 'i').test(lower)) {
      return b;
    }
  }
  return null;
}

/**
 * Extracts materials from text
 */
function extractMaterial(text: string): string | null {
  const lower = text.toLowerCase();
  for (const m of KNOWN_MATERIALS) {
    if (new RegExp(`\\b${m}\\b`, 'i').test(lower)) {
      return m;
    }
  }
  return null;
}

/**
 * Extracts distinctive markings / stickers from text
 */
function extractDistinctiveFeatures(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  for (const feat of DISTINCTIVE_FEATURES) {
    if (lower.includes(feat)) {
      found.push(feat);
    }
  }
  return found;
}

/**
 * Member 2 Smart Matching Algorithm:
 * Evaluates 6 weighted criteria (Total: 100%):
 * 1. Item Name (20%)
 * 2. Category (15%)
 * 3. Colour (15%)
 * 4. Description (20%)
 * 5. Location (20%)
 * 6. Date & Time (10%)
 */
export function calculateMatchScore(
  lost: ItemRecord,
  found: ItemRecord
): { score: number; breakdown: ScoreBreakdown; contradictions?: string[] } | null {
  // 1. Must compare LOST reports against FOUND reports only
  if (!lost || !found) return null;
  if (lost.reportType !== 'LOST' || found.reportType !== 'FOUND') return null;

  // 2. Avoid matching reports submitted by the same user (no self-matching)
  if (lost.userId && found.userId && lost.userId === found.userId) return null;

  // 3. Ignore CLOSED or RECLAIMED reports (only OPEN reports are eligible)
  if (lost.status !== 'OPEN' || found.status !== 'OPEN') return null;

  const contradictions: string[] = [];

  // ==========================================
  // CRITERION 1: Item Name (20 points)
  // ==========================================
  const lostNameTrim = (lost.itemName || '').trim().toLowerCase();
  const foundNameTrim = (found.itemName || '').trim().toLowerCase();
  const lostNameTokens = tokenize(lostNameTrim);
  const foundNameTokens = tokenize(foundNameTrim);

  const lostObj = extractPrimaryObject(lost.itemName || '', lost.description || '');
  const foundObj = extractPrimaryObject(found.itemName || '', found.description || '');

  let nameScore = 0;
  let nameNote = 'Different item names';
  let isObjectContradiction = false;

  if (!lostNameTrim || !foundNameTrim) {
    // Missing information: neutral partial credit
    nameScore = 8;
    nameNote = 'Item name not specified in one or both reports (neutral baseline)';
  } else if (lostNameTrim === foundNameTrim) {
    nameScore = 20;
    nameNote = 'Exact name match';
  } else if (lostObj.objectType && foundObj.objectType && lostObj.objectType === foundObj.objectType) {
    // Primary object matches (e.g. "Smartphone" vs "Mobile Phone", "Wallet" vs "Leather Wallet")
    const sharedTokens = lostNameTokens.filter(t => foundNameTokens.includes(t));
    if (sharedTokens.length >= Math.min(lostNameTokens.length, foundNameTokens.length)) {
      nameScore = 20;
      nameNote = `Direct item match: "${lostObj.objectType}"`;
    } else {
      nameScore = 18;
      nameNote = `Equivalent item category: "${lostObj.objectType}"`;
    }
  } else if (
    lostObj.objectType &&
    foundObj.objectType &&
    lostObj.objectType !== foundObj.objectType &&
    (CANONICAL_OBJECT_TYPES.has(lostObj.objectType) || CANONICAL_OBJECT_TYPES.has(foundObj.objectType))
  ) {
    // FUNDAMENTAL OBJECT CONFLICT: (e.g. Wallet vs Handbag, Shoes vs Wallet, Laptop vs Headphones, Phone vs Bottle)
    nameScore = 0;
    nameNote = `Contradiction: Different physical objects ("${lostObj.objectType}" vs "${foundObj.objectType}")`;
    contradictions.push(`Object identity conflict: ${lostObj.objectType} vs ${foundObj.objectType}`);
    isObjectContradiction = true;
  } else if (lostNameTrim.includes(foundNameTrim) || foundNameTrim.includes(lostNameTrim)) {
    nameScore = 16;
    nameNote = 'Sub-name phrasing match';
  } else {
    // Check shared tokens
    const sharedTokens = lostNameTokens.filter(t => foundNameTokens.includes(t));
    if (sharedTokens.length > 0) {
      nameScore = 2;
      nameNote = `Different items sharing descriptor ("${sharedTokens.join(', ')}")`;
    } else {
      nameScore = 0;
      nameNote = 'Different item types';
    }
  }

  // ==========================================
  // CRITERION 2: Category (15 points)
  // ==========================================
  const lostCat = (lost.category || '').trim().toLowerCase();
  const foundCat = (found.category || '').trim().toLowerCase();
  let categoryScore = 0;
  let categoryNote = 'Different categories';

  if (!lostCat || !foundCat) {
    // Missing information: neutral baseline
    categoryScore = 6;
    categoryNote = 'Category not specified (neutral baseline)';
  } else if (lostCat === foundCat) {
    categoryScore = 15;
    categoryNote = `Identical category: ${lost.category}`;
  } else if (lostCat === 'other' || foundCat === 'other') {
    categoryScore = 7;
    categoryNote = 'Partial match with general category';
  } else {
    categoryScore = 0;
    categoryNote = `Mismatch: ${lost.category} vs ${found.category}`;
  }

  // ==========================================
  // CRITERION 3: Colour Palette (15 points)
  // ==========================================
  const lostColorTrim = (lost.color || '').trim().toLowerCase();
  const foundColorTrim = (found.color || '').trim().toLowerCase();
  let colorScore = 0;
  let colorNote = 'Distinct colours';

  if (!lostColorTrim || !foundColorTrim) {
    // Missing information: neutral baseline (not penalized as a mismatch)
    colorScore = 7;
    colorNote = 'Colour not specified in report (neutral baseline)';
  } else if (lostColorTrim === foundColorTrim) {
    colorScore = 15;
    colorNote = `Exact colour match: ${lost.color}`;
  } else {
    const lostC = parseColors(lostColorTrim);
    const foundC = parseColors(foundColorTrim);

    const sharedFamilies = Array.from(lostC.families).filter(f => foundC.families.has(f));
    const sharedExact = Array.from(lostC.exact).filter(e => foundC.exact.has(e));

    if (sharedExact.length > 0) {
      colorScore = 15;
      colorNote = `Matching exact colour: ${sharedExact.join(', ')}`;
    } else if (sharedFamilies.length > 0) {
      colorScore = 14;
      colorNote = `Matching colour family: ${sharedFamilies.join(', ')}`;
    } else if (
      (lostC.families.has('teal') && foundC.families.has('blue')) ||
      (lostC.families.has('blue') && foundC.families.has('teal')) ||
      (lostC.families.has('cyan') && foundC.families.has('blue')) ||
      (lostC.families.has('blue') && foundC.families.has('cyan')) ||
      (lostC.families.has('gold') && foundC.families.has('yellow')) ||
      (lostC.families.has('yellow') && foundC.families.has('gold')) ||
      (lostC.families.has('maroon') && foundC.families.has('red')) ||
      (lostC.families.has('red') && foundC.families.has('maroon'))
    ) {
      // Nuanced shade similarity
      colorScore = 8;
      colorNote = `Related shade/tone match (${lost.color} vs ${found.color})`;
    } else {
      // True colour contradiction (e.g. Red vs Blue, Black vs White)
      colorScore = 0;
      colorNote = `Colour conflict: ${lost.color} vs ${found.color}`;
      contradictions.push(`Colour conflict: ${lost.color} vs ${found.color}`);
    }
  }

  // ==========================================
  // CRITERION 4: Description (20 points)
  // ==========================================
  const lostDescTrim = (lost.description || '').trim();
  const foundDescTrim = (found.description || '').trim();
  const lostDescTokens = tokenize(lostDescTrim);
  const foundDescTokens = tokenize(foundDescTrim);

  let descScore = 0;
  let descNote = 'No common descriptive details';

  if (!lostDescTrim || !foundDescTrim) {
    // Missing description: neutral baseline
    descScore = 6;
    descNote = 'Description omitted in report (neutral baseline)';
  } else {
    // 1. Brand extraction & comparison
    const lostBrand = extractBrand(lostDescTrim);
    const foundBrand = extractBrand(foundDescTrim);
    let brandBonus = 0;
    let brandConflict = false;

    if (lostBrand && foundBrand) {
      if (lostBrand === foundBrand) {
        brandBonus = 6;
      } else {
        brandConflict = true;
        contradictions.push(`Brand conflict: ${lostBrand} vs ${foundBrand}`);
      }
    }

    // 2. Material extraction & comparison
    const lostMat = extractMaterial(lostDescTrim);
    const foundMat = extractMaterial(foundDescTrim);
    let materialConflict = false;

    if (lostMat && foundMat && lostMat !== foundMat) {
      materialConflict = true;
      contradictions.push(`Material difference: ${lostMat} vs ${foundMat}`);
    }

    // 3. Distinctive features & markings (e.g. star sticker, college id, logo)
    const lostFeats = extractDistinctiveFeatures(lostDescTrim);
    const foundFeats = extractDistinctiveFeatures(foundDescTrim);
    const sharedFeats = lostFeats.filter(f => foundFeats.includes(f));

    // 4. Token overlap
    const sharedTokens = Array.from(new Set(lostDescTokens.filter(t => foundDescTokens.includes(t))));

    if (brandConflict) {
      descScore = Math.min(5, sharedTokens.length * 2);
      descNote = `Brand conflict (${lostBrand} vs ${foundBrand})`;
    } else if (sharedFeats.length > 0) {
      // High-confidence match on distinctive marking
      descScore = Math.min(20, 16 + sharedFeats.length * 2);
      descNote = `Unique distinguishing feature matched: "${sharedFeats.join(', ')}"`;
    } else if (sharedTokens.length > 0) {
      if (sharedTokens.length === 1) {
        descScore = Math.min(20, 6 + brandBonus);
        descNote = `1 shared detail: "${sharedTokens[0]}"${brandBonus ? ` (${lostBrand} brand)` : ''}`;
      } else if (sharedTokens.length === 2) {
        descScore = Math.min(20, 11 + brandBonus);
        descNote = `2 shared details: ${sharedTokens.join(', ')}`;
      } else if (sharedTokens.length === 3) {
        descScore = Math.min(20, 15 + brandBonus);
        descNote = `Multiple details matched: ${sharedTokens.join(', ')}`;
      } else {
        const ratio = sharedTokens.length / Math.min(lostDescTokens.length, foundDescTokens.length);
        descScore = Math.min(20, Math.max(16, Math.round(ratio * 20) + brandBonus));
        descNote = `Strong description match: ${sharedTokens.slice(0, 5).join(', ')}`;
      }
      if (materialConflict) {
        descScore = Math.max(4, descScore - 4);
        descNote += ` (material difference: ${lostMat} vs ${foundMat})`;
      }
    } else {
      descScore = 0;
      descNote = 'No common descriptive keywords';
    }
  }

  // ==========================================
  // CRITERION 5: Location (20 points)
  // ==========================================
  const cleanLoc = (loc: string) =>
    (loc || '')
      .toLowerCase()
      .replace(/\b(near|at|in|on|by|beside|around|opposite|inside|outside|next|to|area|approx|floor|room)\b/gi, ' ')
      .trim();

  const lostLocTrim = (lost.location || '').trim().toLowerCase();
  const foundLocTrim = (found.location || '').trim().toLowerCase();
  const lostLocTokens = tokenize(cleanLoc(lost.location || ''));
  const foundLocTokens = tokenize(cleanLoc(found.location || ''));

  let locScore = 0;
  let locNote = 'Different locations';

  if (!lostLocTrim || !foundLocTrim) {
    // Missing location: neutral baseline
    locScore = 8;
    locNote = 'Location omitted in report (neutral baseline)';
  } else if (lostLocTrim === foundLocTrim) {
    locScore = 20;
    locNote = 'Exact same location';
  } else {
    const sharedLocTokens = Array.from(new Set(lostLocTokens.filter(t => foundLocTokens.includes(t))));

    if (sharedLocTokens.length > 0) {
      const minTokens = Math.max(1, Math.min(lostLocTokens.length, foundLocTokens.length));
      const overlap = sharedLocTokens.length / minTokens;
      locScore = Math.min(20, Math.max(12, Math.round(overlap * 20)));
      locNote = `Nearby area match: "${sharedLocTokens.join(', ')}"`;
    } else if (
      lostLocTrim.includes(foundLocTrim) ||
      foundLocTrim.includes(lostLocTrim)
    ) {
      locScore = 15;
      locNote = 'Vicinity / sub-area overlap';
    } else {
      locScore = 0;
      locNote = 'Different areas reported';
    }
  }

  // ==========================================
  // CRITERION 6: Date & Time (10 points)
  // ==========================================
  let dateScore = 0;
  let dateNote = 'Date unavailable or invalid';

  if (!lost.date || !found.date) {
    // Missing date: neutral baseline
    dateScore = 4;
    dateNote = 'Date not specified (neutral baseline)';
  } else {
    const lostDate = new Date(lost.date);
    const foundDate = new Date(found.date);

    if (isNaN(lostDate.getTime()) || isNaN(foundDate.getTime())) {
      dateScore = 0;
      dateNote = 'Invalid date format provided';
    } else {
      const msPerDay = 1000 * 60 * 60 * 24;
      const lostUtcDay = Math.floor(lostDate.getTime() / msPerDay);
      const foundUtcDay = Math.floor(foundDate.getTime() / msPerDay);
      const diffDays = Math.abs(foundUtcDay - lostUtcDay);

      if (diffDays === 0) {
        dateScore = 10;
        dateNote = 'Identical date of incident';
      } else if (diffDays <= 1) {
        dateScore = 9;
        dateNote = 'Within 24 hours (1 day)';
      } else if (diffDays <= 3) {
        dateScore = 8;
        dateNote = `Within ${diffDays} days`;
      } else if (diffDays <= 7) {
        dateScore = 5;
        dateNote = `Within 1 week (${diffDays} days)`;
      } else if (diffDays <= 14) {
        dateScore = 3;
        dateNote = `Within 2 weeks (${diffDays} days)`;
      } else {
        dateScore = 1;
        dateNote = `More than 2 weeks apart (${diffDays} days)`;
      }
    }
  }

  // ==========================================
  // CONTRADICTION & FALSE POSITIVE SHIELD
  // ==========================================
  const initialCriteriaSum = nameScore + categoryScore + colorScore + descScore + locScore + dateScore;
  let rawScore = initialCriteriaSum;

  // 1. Strict Object Identity Conflict Shield:
  // If the primary objects are fundamentally different (e.g. Wallet vs Handbag, Shoes vs Wallet),
  // they must NEVER pass the 40% matching threshold!
  if (isObjectContradiction) {
    rawScore = Math.min(22, Math.round(rawScore * 0.25));
  } else if (nameScore <= 2 && categoryScore === 0) {
    // Both name and category completely mismatch
    rawScore = Math.min(25, Math.round(rawScore * 0.35));
  }

  // 2. Multiple hard contradictions penalty
  if (contradictions.length >= 2) {
    rawScore = Math.max(0, rawScore - 12);
  }

  let totalScore = Math.min(100, Math.max(0, rawScore));

  // Ensure breakdown criteria sum exactly matches totalScore
  if (totalScore !== initialCriteriaSum) {
    if (initialCriteriaSum > 0) {
      const factor = totalScore / initialCriteriaSum;
      const scores = [
        Math.round(nameScore * factor),
        Math.round(categoryScore * factor),
        Math.round(colorScore * factor),
        Math.round(descScore * factor),
        Math.round(locScore * factor),
        Math.round(dateScore * factor),
      ];
      const sum = scores.reduce((a, b) => a + b, 0);
      const diff = totalScore - sum;
      if (diff !== 0) {
        let maxIdx = 0;
        for (let i = 1; i < scores.length; i++) {
          if (scores[i] > scores[maxIdx]) maxIdx = i;
        }
        scores[maxIdx] += diff;
      }
      nameScore = scores[0];
      categoryScore = scores[1];
      colorScore = scores[2];
      descScore = scores[3];
      locScore = scores[4];
      dateScore = scores[5];
    } else {
      nameScore = 0;
      categoryScore = 0;
      colorScore = 0;
      descScore = 0;
      locScore = 0;
      dateScore = 0;
    }
  }

  const breakdown: ScoreBreakdown = {
    name: { score: nameScore, max: 20, note: nameNote },
    category: { score: categoryScore, max: 15, note: categoryNote },
    color: { score: colorScore, max: 15, note: colorNote },
    description: { score: descScore, max: 20, note: descNote },
    location: { score: locScore, max: 20, note: locNote },
    date: { score: dateScore, max: 10, note: dateNote },
  };

  return {
    score: totalScore,
    breakdown,
    contradictions: contradictions.length > 0 ? contradictions : undefined,
  };
}

export interface PotentialMatchCandidate {
  lostItem: ItemRecord;
  foundItem: ItemRecord;
  score: number;
  breakdown: ScoreBreakdown;
  contradictions?: string[];
}

/**
 * Filters and ranks potential matches between lost and found items.
 * Enforces:
 * - 40% minimum similarity threshold boundary
 * - Status exclusions (CLOSED / RECLAIMED excluded)
 * - Self-match prevention (same user excluded)
 * - Report type validation (LOST vs FOUND only)
 */
export function findPotentialMatches(
  lostItems: ItemRecord[],
  foundItems: ItemRecord[],
  minThreshold: number = 40
): PotentialMatchCandidate[] {
  const matches: PotentialMatchCandidate[] = [];

  for (const lost of lostItems) {
    if (lost.reportType !== 'LOST' || lost.status === 'CLOSED' || lost.status === 'RECLAIMED') continue;
    for (const found of foundItems) {
      if (found.reportType !== 'FOUND' || found.status === 'CLOSED' || found.status === 'RECLAIMED') continue;
      if (lost.userId === found.userId) continue;

      const result = calculateMatchScore(lost, found);
      if (result && result.score >= minThreshold) {
        matches.push({
          lostItem: lost,
          foundItem: found,
          score: result.score,
          breakdown: result.breakdown,
          contradictions: result.contradictions,
        });
      }
    }
  }

  return matches.sort((a, b) => b.score - a.score);
}

