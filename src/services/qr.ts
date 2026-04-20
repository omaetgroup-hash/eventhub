// ─── QR ticket payload service ────────────────────────────────────────────────
//
// Generates and validates QR ticket payloads without requiring a server round-trip.
// The payload encodes ticket metadata + a checksum so scanners can verify offline.
//
// Payload format: EVTHB.v1.{b64url(json)}.{checksum8}
// Fallback short format for display: EVTHB-{eventCode}-{ticketCode}-{check4}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QrTicketData {
  /** Schema version — bump when format changes */
  v: 1;
  ticketId: string;
  orderId: string;
  eventId: string;
  tierId: string;
  holderName: string;
  /** Unix timestamp ms */
  issuedAt: number;
}

export interface QrDecodeResult {
  valid: boolean;
  data?: QrTicketData;
  error?: 'invalid_format' | 'invalid_checksum' | 'expired' | 'unknown';
}

// ─── Checksum ─────────────────────────────────────────────────────────────────
// FNV-1a 32-bit. Fast, good distribution, no crypto dependencies.

function fnv1a32(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

function checksum(data: string, secret = ''): string {
  return fnv1a32(data + secret).toString(16).padStart(8, '0').toUpperCase();
}

function shortChecksum(data: string, secret = ''): string {
  return checksum(data, secret).slice(0, 4);
}

// ─── Base64url helpers ────────────────────────────────────────────────────────

function b64urlEncode(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function b64urlDecode(str: string): string {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4;
  return atob(pad ? padded + '='.repeat(4 - pad) : padded);
}

// ─── Encode ───────────────────────────────────────────────────────────────────

export function encodeQrPayload(data: Omit<QrTicketData, 'v'>, secret?: string): string {
  const payload: QrTicketData = { v: 1, ...data };
  const json = JSON.stringify(payload);
  const encoded = b64urlEncode(json);
  const cs = checksum(encoded, secret);
  return `EVTHB.v1.${encoded}.${cs}`;
}

/**
 * Short human-readable payload for display or legacy scanners.
 * Not self-verifiable offline — requires a DB lookup by ticketId.
 */
export function encodeShortPayload(
  eventId: string,
  ticketId: string,
  secret?: string,
): string {
  const evCode = eventId.split('_').pop()?.toUpperCase() ?? 'EVT';
  const tkCode = ticketId.split('_').pop()?.toUpperCase() ?? 'TKT';
  const cs = shortChecksum(`${evCode}${tkCode}`, secret);
  return `EVTHB-${evCode}-${tkCode}-${cs}`;
}

// ─── Decode ───────────────────────────────────────────────────────────────────

export function decodeQrPayload(payload: string, secret?: string): QrDecodeResult {
  try {
    // Full format: EVTHB.v1.{encoded}.{checksum}
    if (payload.startsWith('EVTHB.')) {
      const parts = payload.split('.');
      if (parts.length !== 4 || parts[0] !== 'EVTHB' || parts[1] !== 'v1') {
        return { valid: false, error: 'invalid_format' };
      }
      const [, , encoded, cs] = parts;
      const expectedCs = checksum(encoded, secret);
      if (cs !== expectedCs) {
        return { valid: false, error: 'invalid_checksum' };
      }
      const data = JSON.parse(b64urlDecode(encoded)) as QrTicketData;
      return { valid: true, data };
    }

    // Short format: EVTHB-{evCode}-{tkCode}-{check4}
    // Caller must do DB lookup — we just validate the checksum structure
    if (payload.startsWith('EVTHB-')) {
      const parts = payload.split('-');
      if (parts.length !== 4) return { valid: false, error: 'invalid_format' };
      const [, evCode, tkCode, cs] = parts;
      const expectedCs = shortChecksum(`${evCode}${tkCode}`, secret);
      if (cs !== expectedCs) return { valid: false, error: 'invalid_checksum' };
      // Short payload is valid structurally — caller resolves ticketId from DB
      return { valid: true };
    }

    return { valid: false, error: 'invalid_format' };
  } catch {
    return { valid: false, error: 'unknown' };
  }
}

/**
 * Quick check for use in check-in scanner — just structural, no DB needed.
 * Returns true if the payload is well-formed and checksum passes.
 */
export function isQrPayloadValid(payload: string, secret?: string): boolean {
  return decodeQrPayload(payload, secret).valid;
}

/**
 * Extract the ticket ID from a short payload (for DB lookup).
 * Returns null if format doesn't match or checksum fails.
 */
export function ticketIdFromShortPayload(payload: string, secret?: string): string | null {
  if (!payload.startsWith('EVTHB-')) return null;
  const parts = payload.split('-');
  if (parts.length !== 4) return null;
  const [, evCode, tkCode, cs] = parts;
  if (cs !== shortChecksum(`${evCode}${tkCode}`, secret)) return null;
  // tkCode is the suffix of the ticket ID — caller must do a suffix lookup
  return tkCode;
}
