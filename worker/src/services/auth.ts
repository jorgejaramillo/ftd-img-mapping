const PBKDF2_ITERATIONS = 100_000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

function bytesToHex(bytes: ArrayBuffer | Uint8Array): string {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function derivePasswordHash(password: string, salt: Uint8Array): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  return bytesToHex(bits);
}

export interface PasswordHash {
  hash: string;
  salt: string;
}

export async function hashPassword(password: string): Promise<PasswordHash> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePasswordHash(password, salt);
  return { hash, salt: bytesToHex(salt) };
}

export async function verifyPassword(password: string, storedHash: string, storedSalt: string): Promise<boolean> {
  const computed = await derivePasswordHash(password, hexToBytes(storedSalt));
  // Comparación en tiempo constante para no filtrar el hash vía timing attack.
  if (computed.length !== storedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) {
    diff |= computed.charCodeAt(i) ^ storedHash.charCodeAt(i);
  }
  return diff === 0;
}

export function generateSessionId(): string {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
}

export function sessionExpiryFromNow(): string {
  return new Date(Date.now() + SESSION_TTL_MS).toISOString();
}
