/**
 * Instant answers typed in the command bar: arithmetic and unit conversions. No eval, no network.
 */

export type Answer =
  | { kind: 'calc'; expression: string; value: number }
  | { kind: 'convert'; value: number; from: string; to: string; result: number };

const FUNCS: Record<string, (x: number) => number> = {
  sqrt: Math.sqrt,
  abs: Math.abs,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  ln: Math.log,
  log: Math.log10,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  exp: Math.exp,
};
const CONSTS: Record<string, number> = { pi: Math.PI, π: Math.PI, e: Math.E };

type Tok = { t: 'num'; v: number } | { t: 'op'; v: string } | { t: 'id'; v: string };

function lex(src: string): Tok[] | null {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i] ?? '';
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    const num = /^(\d+(?:[.,]\d+)?|[.,]\d+)(?:e[+-]?\d+)?/i.exec(src.slice(i));
    if (num) {
      out.push({ t: 'num', v: Number(num[0].replace(',', '.')) });
      i += num[0].length;
      continue;
    }
    const id = /^[a-zπ]+/i.exec(src.slice(i));
    if (id) {
      out.push({ t: 'id', v: id[0].toLowerCase() });
      i += id[0].length;
      continue;
    }
    const op = c === '×' || c === '·' ? '*' : c === '÷' ? '/' : c === '−' ? '-' : c;
    if (src.startsWith('**', i)) {
      out.push({ t: 'op', v: '^' });
      i += 2;
      continue;
    }
    if (!'+-*/^%()'.includes(op)) return null;
    out.push({ t: 'op', v: op });
    i++;
  }
  return out;
}

/** Recursive descent: expr := term (('+'|'-') term)*, term := unary (('*'|'/'|'%') unary)*, … */
function parse(toks: Tok[]): { value: number; ops: number } | null {
  let p = 0;
  let ops = 0;
  const peek = (): Tok | undefined => toks[p];
  const isOp = (v: string): boolean => {
    const t = peek();
    return t?.t === 'op' && t.v === v;
  };
  const expr = (): number | null => {
    let left = term();
    while (left !== null && (isOp('+') || isOp('-'))) {
      const op = (toks[p++] as { v: string }).v;
      ops++;
      const right = term();
      if (right === null) return null;
      left = op === '+' ? left + right : left - right;
    }
    return left;
  };
  const term = (): number | null => {
    let left = unary();
    while (
      left !== null &&
      (isOp('*') || isOp('/') || (isOp('%') && toks[p + 1]?.t !== undefined && toks[p + 1]?.t !== 'op'))
    ) {
      const op = (toks[p++] as { v: string }).v;
      ops++;
      const right = unary();
      if (right === null) return null;
      left = op === '*' ? left * right : op === '/' ? left / right : left % right;
    }
    return left;
  };
  const unary = (): number | null => {
    if (isOp('-')) {
      p++;
      const v = unary();
      return v === null ? null : -v;
    }
    if (isOp('+')) {
      p++;
      return unary();
    }
    return power();
  };
  const power = (): number | null => {
    const base = postfix();
    if (base === null) return null;
    if (isOp('^')) {
      p++;
      ops++;
      const exp = unary();
      return exp === null ? null : base ** exp;
    }
    return base;
  };
  const postfix = (): number | null => {
    let v = primary();
    // "20%" alone or before an operator / closing paren is a percentage.
    while (v !== null && isOp('%') && (toks[p + 1] === undefined || toks[p + 1]?.t === 'op')) {
      p++;
      ops++;
      v = v / 100;
    }
    return v;
  };
  const primary = (): number | null => {
    const t = peek();
    if (!t) return null;
    if (t.t === 'num') {
      p++;
      return t.v;
    }
    if (t.t === 'op' && t.v === '(') {
      p++;
      const v = expr();
      if (v === null || !isOp(')')) return null;
      p++;
      return v;
    }
    if (t.t === 'id') {
      const fn = FUNCS[t.v];
      if (fn) {
        p++;
        ops++;
        const arg = isOp('(') ? primary() : unary();
        return arg === null ? null : fn(arg);
      }
      const c = CONSTS[t.v];
      if (c !== undefined) {
        p++;
        return c;
      }
    }
    return null;
  };
  const value = expr();
  if (value === null || p !== toks.length) return null;
  return { value, ops };
}

/** Evaluates an arithmetic expression; null unless it parses fully and has at least one operation. */
export function evaluate(input: string): number | null {
  const src = input.trim().replace(/^=\s*/, '').replace(/\s*=$/, '');
  if (!src || src.length > 200 || !/[\d)π]/.test(src)) return null;
  // Dates and phone-like numbers are searches, not subtractions.
  if (/^\d{4}-\d{1,2}(-\d{1,2})?$/.test(src) || /^\+?\d[\d -]{7,}$/.test(src)) return null;
  const toks = lex(src);
  if (!toks?.length) return null;
  const r = parse(toks);
  if (!r || (r.ops === 0 && !input.trim().startsWith('='))) return null;
  return Number.isFinite(r.value) ? r.value : null;
}

interface Unit {
  dim: 'length' | 'mass' | 'volume' | 'temp' | 'speed' | 'data' | 'time' | 'area';
  /** Factor to the dimension's base unit (temperatures use `toBase`/`fromBase`). */
  f: number;
  sym: string;
}

const U = (dim: Unit['dim'], f: number, sym: string): Unit => ({ dim, f, sym });

const UNITS: Record<string, Unit> = {};
function def(unit: Unit, ...names: string[]): void {
  for (const n of [unit.sym, ...names]) UNITS[n.toLowerCase()] = unit;
}
def(
  U('length', 0.001, 'mm'),
  'millimeter',
  'millimeters',
  'millimetre',
  'millimetres',
  'millimètre',
  'millimètres',
);
def(
  U('length', 0.01, 'cm'),
  'centimeter',
  'centimeters',
  'centimetre',
  'centimetres',
  'centimètre',
  'centimètres',
);
def(U('length', 1, 'm'), 'meter', 'meters', 'metre', 'metres', 'mètre', 'mètres');
def(U('length', 1000, 'km'), 'kilometer', 'kilometers', 'kilometre', 'kilometres', 'kilomètre', 'kilomètres');
def(U('length', 0.0254, 'in'), 'inch', 'inches', '"', 'pouce', 'pouces');
def(U('length', 0.3048, 'ft'), 'foot', 'feet', "'", 'pied', 'pieds');
def(U('length', 0.9144, 'yd'), 'yard', 'yards');
def(U('length', 1609.344, 'mi'), 'mile', 'miles', 'mille', 'milles');
def(U('length', 1852, 'nmi'), 'nautical mile', 'nautical miles');
def(U('mass', 0.001, 'mg'), 'milligram', 'milligrams', 'milligramme', 'milligrammes');
def(U('mass', 1, 'g'), 'gram', 'grams', 'gramme', 'grammes', 'gr');
def(U('mass', 1000, 'kg'), 'kilogram', 'kilograms', 'kilogramme', 'kilogrammes', 'kilo', 'kilos');
def(U('mass', 1e6, 't'), 'tonne', 'tonnes', 'ton', 'tons');
def(U('mass', 28.349523125, 'oz'), 'ounce', 'ounces', 'once', 'onces');
def(U('mass', 453.59237, 'lb'), 'lbs', 'pound', 'pounds', 'livre', 'livres');
def(U('mass', 6350.29318, 'st'), 'stone', 'stones');
def(U('volume', 0.001, 'ml'), 'milliliter', 'milliliters', 'millilitre', 'millilitres');
def(U('volume', 0.01, 'cl'), 'centiliter', 'centilitre', 'centilitres');
def(U('volume', 1, 'l'), 'liter', 'liters', 'litre', 'litres');
def(U('volume', 3.785411784, 'gal'), 'gallon', 'gallons');
def(U('volume', 0.946352946, 'qt'), 'quart', 'quarts');
def(U('volume', 0.473176473, 'pt'), 'pint', 'pints', 'pinte', 'pintes');
def(U('volume', 0.2365882365, 'cup'), 'cups', 'tasse', 'tasses');
def(U('volume', 0.0295735295625, 'fl oz'), 'floz', 'fluid ounce', 'fluid ounces');
def(U('volume', 0.01478676478125, 'tbsp'), 'tablespoon', 'tablespoons');
def(U('volume', 0.00492892159375, 'tsp'), 'teaspoon', 'teaspoons');
def(U('temp', 1, '°C'), 'c', 'celsius', '°c', 'degc');
def(U('temp', 1, '°F'), 'f', 'fahrenheit', '°f', 'degf');
def(U('temp', 1, 'K'), 'k', 'kelvin', 'kelvins');
def(U('speed', 1 / 3.6, 'km/h'), 'kmh', 'kph', 'kmph');
def(U('speed', 1, 'm/s'), 'mps');
def(U('speed', 0.44704, 'mph'));
def(U('speed', 1852 / 3600, 'kn'), 'knot', 'knots', 'noeud', 'noeuds', 'nœud', 'nœuds');
def(U('data', 1, 'B'), 'byte', 'bytes', 'octet', 'octets', 'o');
def(U('data', 1e3, 'KB'), 'kilobyte', 'kilobytes', 'ko');
def(U('data', 1e6, 'MB'), 'megabyte', 'megabytes', 'mo');
def(U('data', 1e9, 'GB'), 'gigabyte', 'gigabytes', 'go');
def(U('data', 1e12, 'TB'), 'terabyte', 'terabytes', 'to');
def(U('data', 1024, 'KiB'));
def(U('data', 1024 ** 2, 'MiB'));
def(U('data', 1024 ** 3, 'GiB'));
def(U('data', 1024 ** 4, 'TiB'));
def(U('time', 0.001, 'ms'), 'millisecond', 'milliseconds', 'milliseconde', 'millisecondes');
def(U('time', 1, 's'), 'sec', 'second', 'seconds', 'seconde', 'secondes');
def(U('time', 60, 'min'), 'minute', 'minutes', 'mins');
def(U('time', 3600, 'h'), 'hr', 'hrs', 'hour', 'hours', 'heure', 'heures');
def(U('time', 86400, 'd'), 'day', 'days', 'jour', 'jours');
def(U('time', 604800, 'wk'), 'week', 'weeks', 'semaine', 'semaines');
def(U('time', 31557600, 'yr'), 'year', 'years', 'an', 'ans', 'année', 'années');
def(U('area', 1, 'm²'), 'm2', 'sqm');
def(U('area', 1e6, 'km²'), 'km2');
def(U('area', 0.09290304, 'ft²'), 'ft2', 'sqft');
def(U('area', 1e4, 'ha'), 'hectare', 'hectares');
def(U('area', 4046.8564224, 'acre'), 'acres');

/** Where "10 mi" alone goes: metric ↔ imperial. */
const DEFAULT_TARGET: Record<string, string> = {
  km: 'mi',
  mi: 'km',
  m: 'ft',
  ft: 'm',
  cm: 'in',
  in: 'cm',
  yd: 'm',
  kg: 'lb',
  lb: 'kg',
  g: 'oz',
  oz: 'g',
  st: 'kg',
  l: 'gal',
  gal: 'l',
  ml: 'fl oz',
  'fl oz': 'ml',
  cup: 'ml',
  '°C': '°F',
  '°F': '°C',
  K: '°C',
  'km/h': 'mph',
  mph: 'km/h',
  'm²': 'ft²',
  'ft²': 'm²',
  ha: 'acre',
  acre: 'ha',
};

function toBase(u: Unit, v: number): number {
  if (u.dim !== 'temp') return v * u.f;
  if (u.sym === '°F') return ((v - 32) * 5) / 9;
  if (u.sym === 'K') return v - 273.15;
  return v;
}

function fromBase(u: Unit, v: number): number {
  if (u.dim !== 'temp') return v / u.f;
  if (u.sym === '°F') return (v * 9) / 5 + 32;
  if (u.sym === 'K') return v + 273.15;
  return v;
}

const UNIT_PART = String.raw`(°?[a-zA-Zµ²'"°/ éèœ]+?|[a-zA-Z]+[²2]|km\/h|m\/s)`;
const CONVERT_RE = new RegExp(
  String.raw`^\s*(-?\d+(?:[.,]\d+)?)\s*${UNIT_PART}(?:(?:\s+(?:to|in|into|en|vers)\s+|\s*(?:->|→|=)\s*)${UNIT_PART})?\s*$`,
  'i',
);

function lookupUnit(name: string): Unit | undefined {
  const n = name.trim().toLowerCase();
  return UNITS[n] ?? UNITS[n.replace(/s$/, '')];
}

export function convert(input: string): Extract<Answer, { kind: 'convert' }> | null {
  const m = CONVERT_RE.exec(input);
  if (!m?.[1] || !m[2]) return null;
  const value = Number(m[1].replace(',', '.'));
  const from = lookupUnit(m[2]);
  if (!from) return null;
  let to: Unit | undefined;
  if (m[3]) {
    to = lookupUnit(m[3]);
  } else {
    // A bare "10 m" / "5 s" is far more often a search than a conversion request.
    if (m[2].trim().length < 2 && from.dim !== 'temp') return null;
    const target = DEFAULT_TARGET[from.sym];
    to = target ? Object.values(UNITS).find((u) => u.sym === target) : undefined;
  }
  if (to?.dim !== from.dim || to === from) return null;
  return { kind: 'convert', value, from: from.sym, to: to.sym, result: fromBase(to, toBase(from, value)) };
}

/** The instant answer for this input, if any. */
export function instantAnswer(input: string): Answer | null {
  const conv = convert(input);
  if (conv) return conv;
  const value = evaluate(input);
  return value === null ? null : { kind: 'calc', expression: input.trim(), value };
}

/** Rounds away float noise: 0.1 + 0.2 → 0.3, keeps 10 significant digits. */
export function roundAnswer(v: number): number {
  if (v === 0 || !Number.isFinite(v)) return v;
  return Number(v.toPrecision(10));
}
