/**
 * Unified "Smart comment" flag detection for receipt lines.
 * Replaces separate meal/transport flaggers with one extensible system.
 */
export type SmartFlag = "MEAL" | "TRANSPORT";

export type SmartCommentResult = {
  flags: SmartFlag[];
  suggestionByFlag: Partial<Record<SmartFlag, string>>;
};

const MEAL_SUGGESTION = "Forslag: Catering til filmarbeidere og statister";

const GROCERY_BRANDS = [
  "kiwi", "rema 1000", "rema", "meny", "joker", "spar", "extra", "coop",
  "obs", "obs!", "bunnpris", "matkroken", "prix", "mega", "coop mega", "coop prix",
  "ica", "lidl", "normal", "europris", "grossist", "dagligvare",
];

const GAS_KIOSK = [
  "circle k", "shell", "esso", "7-eleven", "narvesen", "deli de luca",
  "yx", "st1", "best", "uno-x",
];

const FOOD_DRINK_KEYWORDS = [
  "mat", "kaffe", "lunch", "lunsj", "middag", "frokost", "catering",
  "baguette", "burger", "pizza", "sushi", "wrap", "snack", "brus", "cola",
  "vatten", "vann", "juice", "øl", "vin", "beer", "soda", "coffee", "tea",
  "dagligvarer", "matvarer", "restaurant", "kafé", "cafe", "café",
  "bakeri", "bakery", "kantine", "gatekjøkken", "drikke", "drikker",
  "mineralvann", "lunchpakke", "smørbrød", "salat", "suppe", "dessert",
  "frukt", "grønt", "melk", "ost", "brød", "kjøtt", "fisk", "vegetar",
  "food", "drink", "drinks", "eating", "eaten", "spise", "spis",
  "espresso", "cappuccino", "latte", "croissant", "bakery",
  "smoothie", "muffin", "bowl", "salad", "sandwich", "acai",
  "burrito", "taco", "salsa", "jarritos",
  "takeaway", "take away", "to go", "el camino",
];

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

/** Matches when term appears as substring (for brands/phrases like "rema 1000"). */
function containsAny(text: string, terms: string[]): boolean {
  const n = normalize(text);
  return terms.some((t) => n.includes(normalize(t)));
}

/** Matches only when term appears as a whole word (avoids "mat" in "automat", "vin" in "leveringsvindu"). */
function containsWord(text: string, terms: string[]): boolean {
  const n = normalize(text);
  return terms.some((t) => {
    const tNorm = normalize(t);
    if (!tNorm.length) return false;
    if (/\s/.test(tNorm)) return n.includes(tNorm);
    const escaped = tNorm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp("\\b" + escaped + "\\b").test(n);
  });
}

export function detectSmartComment(input: {
  vendor?: string;
  description?: string;
  extractedText?: string;
}): SmartCommentResult {
  const combined = [
    input.vendor ?? "",
    input.description ?? "",
    input.extractedText ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const flags: SmartFlag[] = [];
  const suggestionByFlag: Partial<Record<SmartFlag, string>> = {};

  if (!combined.trim()) {
    return { flags, suggestionByFlag };
  }

  const isGrocery = containsWord(combined, GROCERY_BRANDS);
  const isGasKiosk = containsWord(combined, GAS_KIOSK);
  const hasFoodKeyword = containsWord(combined, FOOD_DRINK_KEYWORDS);
  if (isGrocery || isGasKiosk || hasFoodKeyword) {
    flags.push("MEAL");
    suggestionByFlag.MEAL = MEAL_SUGGESTION;
  }

  return { flags, suggestionByFlag };
}

export function parseCommentFlags(json: string | null | undefined): SmartFlag[] {
  if (json == null || json === "") return [];
  try {
    const arr = JSON.parse(json) as unknown;
    return Array.isArray(arr) && arr.every((x) => x === "MEAL" || x === "TRANSPORT")
      ? (arr as SmartFlag[])
      : [];
  } catch {
    return [];
  }
}

export function stringifyCommentFlags(flags: SmartFlag[]): string {
  return JSON.stringify(flags);
}
