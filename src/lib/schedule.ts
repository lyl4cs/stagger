// Spreads sends out over time. The first goes at exactly `start`; each one after
// that is `gapMinutes` later plus up to a minute of random jitter, so 20 identical
// emails don't hit the same company's mail server in the same second.

export function sendTimes(
  start: Date,
  count: number,
  gapMinutes: number,
  random: () => number = Math.random,
): Date[] {
  const times: Date[] = [];
  for (let i = 0; i < count; i++) {
    const jitter = i === 0 ? 0 : Math.floor(random() * 60_000);
    times.push(new Date(start.getTime() + i * gapMinutes * 60_000 + jitter));
  }
  return times;
}
