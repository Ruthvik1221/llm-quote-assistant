import { z } from "zod";

export const SERVICES = ["junk_removal", "moving", "cleaning"] as const;

/**
 * What the LLM is allowed to return. It extracts facts; it never prices.
 * Anything outside this shape is rejected before it can reach a customer.
 */
export const Extraction = z.discriminatedUnion("inScope", [
  z.object({
    inScope: z.literal(true),
    service: z.enum(SERVICES),
    volumeCubicYards: z.number().min(0).max(60),
    stairFlights: z.number().int().min(0).max(10),
    heavyItems: z.array(z.enum(["piano", "safe", "hot_tub", "appliance", "other"])).max(20),
    hazardous: z.boolean(),
    summary: z.string().max(300),
  }),
  z.object({
    inScope: z.literal(false),
    reason: z.string().max(300),
  }),
]);
export type Extraction = z.infer<typeof Extraction>;
export type JobFacts = Extract<Extraction, { inScope: true }>;

export const QuoteRequest = z.object({
  message: z.string().min(5).max(4000),
});
