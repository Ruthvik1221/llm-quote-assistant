import type { JobFacts } from "./schema.js";

/** All money is integer cents. Rates are example values, not anyone's real price list. */
export const RATES = {
  junk_removal: { base: 9_900, perCubicYard: 3_500 },
  moving: { base: 15_000, perCubicYard: 4_500 },
  cleaning: { base: 12_000, perCubicYard: 1_000 },
  perStairFlight: 2_500,
  heavyItem: { piano: 25_000, safe: 20_000, hot_tub: 30_000, appliance: 5_000, other: 4_000 },
  /** Quotes are a range; on-site volume often differs from the customer's description. */
  rangeSpread: 0.15,
} as const;

export interface LineItem {
  label: string;
  cents: number;
}
export interface Quote {
  lines: LineItem[];
  lowCents: number;
  highCents: number;
}

const roundTo5Dollars = (cents: number) => Math.round(cents / 500) * 500;

export function priceJob(job: JobFacts): Quote {
  const svc = RATES[job.service];
  const lines: LineItem[] = [
    { label: "Base fee", cents: svc.base },
    { label: `Volume (${job.volumeCubicYards} cu yd)`, cents: Math.round(job.volumeCubicYards * svc.perCubicYard) },
  ];
  if (job.stairFlights > 0) lines.push({ label: `Stairs (${job.stairFlights} flight(s))`, cents: job.stairFlights * RATES.perStairFlight });
  for (const item of job.heavyItems) lines.push({ label: `Heavy item: ${item.replace("_", " ")}`, cents: RATES.heavyItem[item] });

  const total = lines.reduce((s, l) => s + l.cents, 0);
  return {
    lines,
    lowCents: roundTo5Dollars(total * (1 - RATES.rangeSpread)),
    highCents: roundTo5Dollars(total * (1 + RATES.rangeSpread)),
  };
}
