/**
 * Strip contact details before text leaves our server for a third-party model.
 * The model doesn't need them to estimate a job, so it never sees them.
 */
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// US-style phone numbers: (845) 555-0123, 845.555.0123, +1 845 555 0123, 8455550123
const PHONE = /(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b/g;

export function redact(text: string): { text: string; redactions: number } {
  let redactions = 0;
  const out = text
    .replace(EMAIL, () => (redactions++, "[email]"))
    .replace(PHONE, () => (redactions++, "[phone]"));
  return { text: out, redactions };
}
