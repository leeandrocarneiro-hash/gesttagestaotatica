import { getCookie, setCookie, deleteCookie } from "@tanstack/react-start/server";
import { MASTER_SPREADSHEET_ID, sheets } from "./google.server";

const COOKIE = "gs_session";
const enc = new TextEncoder();

const b64u = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

export async function hashPassword(pw: string, saltB64?: string) {
  const salt = saltB64 ? fromB64u(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 100000 }, key, 256);
  return `pbkdf2$${b64u(salt)}$${b64u(bits)}`;
}

export async function verifyPassword(pw: string, stored: string) {
  const [, salt] = stored.split("$");
  if (!salt) return false;
  const h = await hashPassword(pw, salt);
  if (h.length !== stored.length) return false;
  let diff = 0;
  for (let i = 0; i < h.length; i++) diff |= h.charCodeAt(i) ^ stored.charCodeAt(i);
  return diff === 0;
}

async function hmac(data: string) {
  const secret = process.env["SESSION_SECRET"];
  if (!secret) throw new Error("SESSION_SECRET ausente");
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

export type Session = { cid: string; name: string; sid: string; exp: number };

export async function startSession(s: Omit<Session, "exp">) {
  const payload: Session = { ...s, exp: Date.now() + 30 * 86400_000 };
  const body = b64u(enc.encode(JSON.stringify(payload)));
  setCookie(COOKIE, `${body}.${await hmac(body)}`, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 30 * 86400 });
}

export function endSession() {
  deleteCookie(COOKIE, { path: "/" });
}

export async function readSession(): Promise<Session | null> {
  const c = getCookie(COOKIE);
  if (!c) return null;
  const [body, sig] = c.split(".");
  if (!body || !sig || (await hmac(body)) !== sig) return null;
  try {
    const s = JSON.parse(new TextDecoder().decode(fromB64u(body))) as Session;
    return s.exp > Date.now() ? s : null;
  } catch {
    return null;
  }
}

export async function requireSession() {
  const s = await readSession();
  if (!s) throw new Error("Sessão expirada. Entre novamente.");
  return s;
}

/** Rows of the master sheet: [ID, Empresa, Responsável, E-mail, Hash, ID Planilha, Criado em] */
export async function listCompanies(): Promise<string[][]> {
  const j = await sheets(`/spreadsheets/${MASTER_SPREADSHEET_ID}/values/Empresas!A2:G`);
  return ((j.values ?? []) as unknown[][]).map((r) => r.map((c) => String(c ?? "")));
}

export async function appendCompany(row: string[]) {
  await sheets(
    `/spreadsheets/${MASTER_SPREADSHEET_ID}/values/Empresas!A1:G1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: "POST", body: JSON.stringify({ values: [row] }) },
  );
}
