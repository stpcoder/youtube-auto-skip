// Only plain, unconditional host blocks are equivalent to requestDomains.
// Keep exceptions and every modifier/path rule in the maintained converter.
export function unconditionalHost(line) {
  const host = line.match(/^\|\|([a-z0-9.-]+)\^$/i)?.[1]?.toLowerCase();
  if (!host?.includes('.') || host.length > 253 || !host.split('.').every(label =>
    label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label))) return null;
  return host;
}

export function disabledUnconditionalHost(line) {
  return /\$badfilter$/i.test(line) ? unconditionalHost(line.slice(0, -10)) : null;
}

export function groupedHostRules(hosts, usedIds = new Set(), batchSize = 500) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) throw Error('Invalid domain batch size');
  const domains = [...new Set(hosts)].sort(), rules = [];
  let id = 900100;
  for (let offset = 0; offset < domains.length; offset += batchSize) {
    while (usedIds.has(id)) id++;
    if (id >= 1000000) throw Error('Host rule IDs overlap preference rules');
    usedIds.add(id);
    rules.push({ id: id++, priority: 1, action: { type: 'block' }, condition: {
      requestDomains: domains.slice(offset, offset + batchSize), excludedResourceTypes: ['main_frame'],
    } });
  }
  return rules;
}
