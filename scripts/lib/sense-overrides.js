export function selectSenseSource(candidates, senseIndex, override) {
  const source = candidates?.[(senseIndex ?? 1) - 1];

  if (source) {
    return source;
  }

  return override ? candidates?.[0] ?? null : null;
}
