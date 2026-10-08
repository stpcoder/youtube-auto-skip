// Keep every exception and domain condition. Dropping unsupported conditions
// would broaden a rule and can break video or normal navigation.
export function safariNetworkRules(rules) {
  const types = ['sub_frame','stylesheet','script','image','font','xmlhttprequest','ping','media','websocket','other'];
  return rules.flatMap(rule => {
    const copy = structuredClone(rule), c = copy.condition;
    if (copy.action.type === 'allowAllRequests') {
      c.resourceTypes = ['main_frame'];
    } else if (copy.action.type === 'block') {
      c.resourceTypes = (c.resourceTypes || types).filter(t => types.includes(t) && !c.excludedResourceTypes?.includes(t));
      delete c.excludedResourceTypes;
      if (!c.resourceTypes.length) return [];
    }
    return [copy];
  });
}
