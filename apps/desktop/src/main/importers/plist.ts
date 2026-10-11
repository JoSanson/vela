export type PlistValue = string | number | boolean | PlistValue[] | { [key: string]: PlistValue };

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-z]+);/g, (m, body: string) => {
    if (body.startsWith('#x')) return String.fromCodePoint(parseInt(body.slice(2), 16));
    if (body.startsWith('#')) return String.fromCodePoint(parseInt(body.slice(1), 10));
    return ENTITIES[body] ?? m;
  });
}

const TAG = /<(\/?)([a-zA-Z]+)(?:\s[^>]*)?(\/?)>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>/g;

interface Token {
  name: string;
  close: boolean;
  selfClose: boolean;
  text: string;
}

/** Tokenises an XML plist (`plutil -convert xml1` output) into element tokens plus their inner text. */
function tokenize(xml: string): Token[] {
  const out: Token[] = [];
  let last = 0;
  for (const m of xml.matchAll(TAG)) {
    const name = m[2];
    if (name === undefined) continue;
    const prev = out[out.length - 1];
    if (prev && !prev.close && !prev.selfClose) prev.text = xml.slice(last, m.index);
    out.push({ name, close: m[1] === '/', selfClose: m[3] === '/', text: '' });
    last = m.index + m[0].length;
  }
  return out;
}

/**
 * Minimal XML property-list reader: dict, array, string, integer, real, true, false, date (kept as its
 * ISO string) and data (kept base64). `plutil -convert json` refuses plists holding dates or data, and
 * Safari's Bookmarks.plist has both, so the XML form is the one that always converts.
 */
export function parsePlistXml(xml: string): PlistValue {
  const tokens = tokenize(xml);
  let i = 0;
  const next = (): Token => {
    const t = tokens[i++];
    if (!t) throw new Error('plist: unexpected end');
    return t;
  };
  const read = (t: Token): PlistValue => {
    switch (t.name) {
      case 'dict': {
        const obj: Record<string, PlistValue> = {};
        if (t.selfClose) return obj;
        for (;;) {
          const k = next();
          if (k.close && k.name === 'dict') return obj;
          if (k.name !== 'key') throw new Error('plist: expected <key>');
          if (!k.selfClose) next();
          obj[decodeEntities(k.text)] = read(next());
        }
      }
      case 'array': {
        const arr: PlistValue[] = [];
        if (t.selfClose) return arr;
        for (;;) {
          const v = next();
          if (v.close && v.name === 'array') return arr;
          arr.push(read(v));
        }
      }
      case 'string':
      case 'date':
      case 'data': {
        if (t.selfClose) return '';
        next();
        return t.name === 'data' ? t.text.replace(/\s+/g, '') : decodeEntities(t.text);
      }
      case 'integer':
      case 'real': {
        if (t.selfClose) return 0;
        next();
        return Number(t.text.trim());
      }
      case 'true':
        if (!t.selfClose) next();
        return true;
      case 'false':
        if (!t.selfClose) next();
        return false;
      default:
        throw new Error(`plist: unexpected <${t.name}>`);
    }
  };
  for (;;) {
    const t = next();
    if (t.name === 'plist' && !t.close) continue;
    return read(t);
  }
}
