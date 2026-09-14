// Room access control via server-minted, self-authenticating codes.
//
// A room code is `<slug>-<exp>-<sig>`:
//   slug — 8 random chars (the room identity)
//   exp  — expiry, base36 epoch seconds (24h out by default)
//   sig  — first 12 hex of HMAC-SHA256("<slug>.<exp>", ROOM_SECRET)
//
// The signaling server admits a join only if the signature verifies AND the
// expiry is still in the future, so a room can't be joined by guessing/typing
// a name (no valid HMAC) or by reusing an old invite (expired). The expiry is
// inside the signed payload, so it can't be tampered with. Stateless by
// design (no rooms table) — survives restarts and mirrors drover's stream-key
// auth. ROOM_SECRET falls back to JWT_SECRET so one configured secret protects
// both sessions and rooms; the dev fallback warns loudly at boot.
import crypto from "crypto";

const ROOM_SECRET = process.env.ROOM_SECRET || process.env.JWT_SECRET || "dev-secret-change-me";
export const usingDevRoomSecret = !process.env.ROOM_SECRET && !process.env.JWT_SECRET;

const TTL_MS = (Number(process.env.ROOM_TTL_HOURS) || 24) * 60 * 60 * 1000;

// Ambiguous characters (0/O, 1/l/I) left out so codes are safe to read aloud.
const SLUG_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
const SLUG_LEN = 8;
const SIG_LEN = 12;
const CODE_RE = /^[a-z0-9]{8}-[0-9a-z]{1,12}-[a-f0-9]{12}$/;

function sign(payload) {
  return crypto.createHmac("sha256", ROOM_SECRET).update(payload).digest("hex").slice(0, SIG_LEN);
}

export function mintRoomCode() {
  const bytes = crypto.randomBytes(SLUG_LEN);
  let slug = "";
  // 256 % 32 === 0, so the modulo is unbiased across the 32-char alphabet.
  for (let i = 0; i < SLUG_LEN; i++) slug += SLUG_ALPHABET[bytes[i] % SLUG_ALPHABET.length];
  const exp = Math.floor((Date.now() + TTL_MS) / 1000).toString(36);
  return `${slug}-${exp}-${sign(`${slug}.${exp}`)}`;
}

// Returns { ok } or { ok:false, reason:"bad"|"expired" } so the caller can
// tell "wrong/forged code" from "valid but expired" for a clearer message.
export function verifyRoomCode(code) {
  if (typeof code !== "string" || !CODE_RE.test(code)) return { ok: false, reason: "bad" };
  const [slug, exp, sig] = code.split("-");
  const expected = sign(`${slug}.${exp}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  // Verify the signature before trusting exp — exp is only meaningful once we
  // know the payload wasn't forged.
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: "bad" };
  const expMs = parseInt(exp, 36) * 1000;
  if (!Number.isFinite(expMs) || Date.now() > expMs) return { ok: false, reason: "expired" };
  return { ok: true };
}
