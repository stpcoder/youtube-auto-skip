// Independently implemented ABP cosmetic exceptions, compiled as local DATA.
// Unknown options are not discarded: doing so would broaden an exception.
const modes = new Map([
  ['generichide', 'generic'], ['ghide', 'generic'],
  ['specifichide', 'specific'], ['shide', 'specific'],
  ['elemhide', 'all'], ['ehide', 'all'],
]);
const separator = '(?:[^A-Za-z0-9_%.-]|$)';
export function urlPattern(pattern) {
  if (pattern.startsWith('/') && pattern.endsWith('/')) throw Error('regular-expression exception');
  let prefix = '', suffix = '';
  if (pattern.startsWith('||')) {
    prefix = '^https?://(?:[a-z0-9_-]+\\.)*';
    pattern = pattern.slice(2);
  } else if (pattern.startsWith('|')) {
    prefix = '^'; pattern = pattern.slice(1);
  }
  if (pattern.endsWith('|')) { suffix = '$'; pattern = pattern.slice(0, -1); }
  let body = '';
  for (const ch of pattern) {
    if (ch === '*') body += '.*';
    else if (ch === '^') body += separator;
    else body += /[\\^$.*+?()[\]{}|]/.test(ch) ? '\\' + ch : ch;
  }
  return prefix + body + suffix;
}
export function parseCosmeticException(line) {
  if (!line.startsWith('@@')) return null;
  const split = line.lastIndexOf('$');
  if (split < 2) return null;
  const options = line.slice(split + 1).split(',');
  const hideModes = options.filter(o => modes.has(o)).map(o => modes.get(o));
  if (!hideModes.length) return null;
  const unsupported = reason => ({ unsupported: reason, rule: line });
  if (options.some(o => !modes.has(o) && !o.startsWith('domain=') && o !== 'match-case')) return unsupported('unsupported option');
  if (options.filter(o => o.startsWith('domain=')).length > 1) return unsupported('multiple domain options');
  const domainOption = options.find(o => o.startsWith('domain='));
  const domains = domainOption ? domainOption.slice(7).split('|').map(d => d.toLowerCase()) : [];
  if (domains.some(d => !/^~?(?:[a-z0-9_-]+\.)*[a-z0-9_-]+$/.test(d))) return unsupported('unsupported domain syntax');
  try {
    const regex = urlPattern(line.slice(2, split));
    const flags = options.includes('match-case') ? '' : 'i';
    new RegExp(regex, flags);
    return { regex, flags, domains, modes: [...new Set(hideModes)] };
  } catch (e) { return unsupported(String(e.message || e)); }
}
