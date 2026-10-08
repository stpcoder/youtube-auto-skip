import { urlPattern } from './cosmetic-filter-parser.mjs';

// Compile URL-specific popup filters as local data, never remote executable code.
// Unknown modifiers are recorded, not silently stripped into broader rules.
export function parsePopupRule(line) {
  const exception = line.startsWith('@@');
  const raw = exception ? line.slice(2) : line;
  if (!raw || /^[!\[]/.test(raw) || raw.includes('#')) return null;
  const split = raw.lastIndexOf('$');
  const pattern = split < 0 ? raw : raw.slice(0, split);
  const options = split < 0 ? [] : raw.slice(split + 1).split(',');
  if (!options.includes('popup') && !(exception && options.length === 0)) return null;
  const unsupported = reason => ({ unsupported: reason, rule: line });
  if (options.some(o => o !== 'popup' && o !== 'match-case' && !o.startsWith('domain='))) return unsupported('unsupported popup modifier');
  if (!pattern || options.filter(o => o.startsWith('domain=')).length > 1) return unsupported('invalid popup rule');
  const domains = (options.find(o => o.startsWith('domain='))?.slice(7) || '').split('|').filter(Boolean).map(d => d.toLowerCase());
  if (domains.some(d => !/^~?(?:[a-z0-9_-]+\.)*[a-z0-9_-]+$/.test(d))) return unsupported('unsupported popup domain syntax');
  try {
    const regex = urlPattern(pattern), flags = options.includes('match-case') ? '' : 'i';
    new RegExp(regex, flags);
    return { regex, flags, domains, exception };
  } catch(e) { return unsupported(String(e.message || e)); }
}
