const ITERATIONS = 310_000;
const KEY_LENGTH = 256;
const HASH_ALGORITHM = "SHA-256";
const encoder = new TextEncoder();

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - (normalized.length % 4)) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function derive(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: HASH_ALGORITHM, salt, iterations: ITERATIONS },
    material,
    KEY_LENGTH,
  );
  return new Uint8Array(bits);
}

/**
 * Produces a PBKDF2-SHA256 password hash with a cryptographically random,
 * per-user 16-byte salt. Store only the returned hash and salt.
 */
export async function hashPassword(password: string): Promise<{ passwordHash: string; passwordSalt: string }> {
  if (password.length < 12 || password.length > 200) {
    throw new Error("A senha deve ter entre 12 e 200 caracteres.");
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt);
  return { passwordHash: encodeBase64Url(hash), passwordSalt: encodeBase64Url(salt) };
}

/** Verifies a stored PBKDF2 hash without comparing secrets as ordinary strings. */
export async function verifyPassword(password: string, passwordHash: string, passwordSalt: string): Promise<boolean> {
  try {
    if (!password || password.length > 200 || !passwordHash || !passwordSalt) return false;
    const expected = decodeBase64Url(passwordHash);
    const salt = decodeBase64Url(passwordSalt);
    if (expected.length !== KEY_LENGTH / 8 || salt.length !== 16) return false;
    const actual = await derive(password, salt);
    let difference = 0;
    for (let index = 0; index < expected.length; index += 1) difference |= expected[index] ^ actual[index];
    return difference === 0;
  } catch {
    return false;
  }
}
