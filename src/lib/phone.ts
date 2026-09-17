/**
 * src/lib/phone.ts
 *
 * Kenyan phone number normalization.
 *
 * Numbers in this app have always been stored as whatever staff typed —
 * Teacher.phone tends to be "+254712345678", Parent.phone tends to be
 * "0712345678" (both are free-text fields, never validated to one shape).
 * An exact-match lookup against that data silently fails for whichever
 * format doesn't happen to match what the user just typed — which is why
 * parents in particular could never reset their password by phone: the
 * forgot-password page tells them to type "254712345678" while their
 * stored Parent.phone is "0712345678".
 *
 * This is the one place that decides what "the same phone number" means.
 */

/** Strip everything but digits and a leading +. */
function digitsAndPlus(raw: string): string {
  return raw.replace(/[^\d+]/g, "");
}

/**
 * Canonical E.164 form for a Kenyan mobile number, e.g. "+254712345678".
 * Accepts "0712345678", "712345678", "254712345678", "+254712345678" (with
 * or without spaces/dashes). Returns null if the input doesn't reduce to a
 * plausible Kenyan mobile number (Safaricom/Airtel/Telkom ranges: 07xx/01xx
 * after the country code, i.e. leading digit 1 or 7).
 */
export function toE164Kenya(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = digitsAndPlus(raw.trim());
  if (!s) return null;

  if (s.startsWith("+254"))      s = s.slice(1);
  else if (s.startsWith("254"))  { /* already in the right shape */ }
  else if (s.startsWith("0"))    s = `254${s.slice(1)}`;
  else if (/^[17]\d{8}$/.test(s)) s = `254${s}`;
  else return null;

  return /^254[17]\d{8}$/.test(s) ? `+${s}` : null;
}

/**
 * Every plausible stored variant of one logical number, for a
 * `WHERE phone IN (...)` lookup against historically inconsistent data.
 * For a valid Kenyan number this covers "+254712345678", "254712345678"
 * and "0712345678" — the shapes actually present in the database — plus
 * whatever the caller typed verbatim, in case it isn't Kenyan at all (an
 * "external" messaging recipient, for instance).
 */
export function phoneLookupVariants(raw: string | null | undefined): string[] {
  const trimmed = raw?.trim();
  const e164 = toE164Kenya(raw);
  const variants = new Set<string>();
  if (trimmed) variants.add(trimmed);
  if (e164) {
    variants.add(e164);              // +254712345678
    variants.add(e164.slice(1));     // 254712345678
    variants.add(`0${e164.slice(4)}`); // 0712345678
  }
  return [...variants];
}

/**
 * Best-effort normalization for dispatch and storage: E.164 when the number
 * looks Kenyan, otherwise the original value with whitespace stripped so a
 * non-Kenyan or malformed number is still passed through rather than
 * dropped.
 */
export function normalizePhoneForDispatch(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const stripped = raw.replace(/\s+/g, "").trim();
  return toE164Kenya(raw) ?? (stripped || null);
}
