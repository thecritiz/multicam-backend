// Room access control via server-minted, self-authenticating codes.
//
// A room code is `<slug>-<sig>` where sig = first 12 hex chars of
// HMAC-SHA256(slug, ROOM_SECRET). The signaling server admits a join only if
// the signature verifies, so a room can't be joined — or squatted — by
// guessing or typing a name; only codes this server issued are valid, and
// forging one means breaking the HMAC. Sharing a room is sharing its code
// (via link), exactly the capability model Meet/Jitsi use, but enforced
// server-side rather than trusting the client.
//
// Stateless by design (no rooms table): survives restarts and mirrors
// drover's stream-key auth. ROOM_SECRET falls back to JWT_SECRET so a single
// configured secret protects both sessions and rooms; the dev fallback warns
// loudly at boot.
import crypto from "crypto";

const ROOM_SECRET = process.env.ROOM_SECRET || process.env.JWT_SECRET || "dev-secret-change-me";
export const usingDevRoomSecret = !process.env.ROOM_SECRET && !process.env.JWT_SECRET;

// Ambiguous characters (0/O, 1/l/I) left out so codes are safe to read aloud
// and retype off a screen.
const SLUG_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
const SLUG_LEN = 8;
const SIG_LEN = 12;
const CODE_RE = /^[a-z0-9]{8}-[a-f0-9]{12}$/;

function sign(slug) {
  return crypto.createHmac("sha256", ROOM_SECRET).update(slug).digest("hex").slice(0, SIG_LEN);
}

export function mintRoomCode() {
  const bytes = crypto.randomBytes(SLUG_LEN);
  let slug = "";
  // 256 % 32 === 0, so the modulo is unbiased across the 32-char alphabet.
  for (let i = 0; i < SLUG_LEN; i++) slug += SLUG_ALPHABET[bytes[i] % SLUG_ALPHABET.length];
  return `${slug}-${sign(slug)}`;
}

export function verifyRoomCode(code) {
  if (typeof code !== "string" || !CODE_RE.test(code)) return false;
  const [slug, sig] = code.split("-");
  const expected = sign(slug);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
