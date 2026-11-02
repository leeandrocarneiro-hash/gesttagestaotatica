import { getCookie, setCookie, deleteCookie } from "@tanstack/react-start/server";
import { TABS, TAB_NAMES } from "./sheets-config";

const GATEWAY = "https://connector-gateway.lovable.dev/google_sheets/v4";
const COOKIE = "gestta_session";
const LOGIN_TAB = "Logins";
const LOGIN_HEADER = ["Empresa", "Login", "Senha", "Link da planilha", "Ativo (SIM/NAO)"];

function gwHeaders() {
  const a = process.env["LOVABLE_API_KEY"];
  const b = process.env["GOOGLE_SHEETS_API_KEY"];
  if (!a || !b) throw new Error("Conexão com Google Sheets não configurada");
  return { Authorization: `Bearer ${a}`, "X-Connection-Api-Key": b, "Content-Type": "application/json" };
}

export async function gw(path: string, init?: RequestInit) {
  const r = await fetch(`${GATEWAY}${path}`, { ...init, headers: gwHeaders() });
  if (!r.ok) {
    const t = await r.text();
    console.error(`Sheets ${r.status}: ${t}`);
    throw new Error(`Erro na planilha [${r.status}]`);
  }
  return r.json();
}

function centralId() {
  const id = process.env["GESTTA_CENTRAL_SPREADSHEET_ID"];
  if (!id) throw new Error("Planilha de logins não configurada");
  return id;
}

async function secretKey() {
  const raw = process.env["GESTTA_SESSION_SECRET"] || `gestta:${process.env["LOVABLE_API_KEY"]}`;
  return crypto.subtle.importKey("raw", new TextEncoder().encode(raw), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function sign(payload: string) {
  return b64(await crypto.subtle.sign("HMAC", await secretKey(), new TextEncoder().encode(payload)));
}

export function extractSheetId(link: string) {
  const m = link.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]{20,})/) || link.trim().match(/^([a-zA-Z0-9-_]{30,})$/);
  return m ? m[1] : null;
}

/** Garante a aba "Logins" na planilha central e devolve as linhas. */
async function readLogins(): Promise<string[][]> {
  const id = centralId();
  const meta = await gw(`/spreadsheets/${id}?fields=sheets.properties.title`);
  const has = meta.sheets?.some((s: { properties: { title: string } }) => s.properties.title === LOGIN_TAB);
  if (!has) {
    await gw(`/spreadsheets/${id}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: [{ addSheet: { properties: { title: LOGIN_TAB } } }] }) });
    await gw(`/spreadsheets/${id}/values/${LOGIN_TAB}!A1:E1?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ values: [LOGIN_HEADER] }) });
    return [];
  }
  const j = await gw(`/spreadsheets/${id}/values/${LOGIN_TAB}!A2:E`);
  return ((j.values ?? []) as unknown[][]).map((r) => r.map((c) => String(c ?? "").trim()));
}

export type Session = { empresa: string; login: string; spreadsheetId: string | null };

function findUser(rows: string[][], login: string) {
  const i = rows.findIndex((r) => r[1] && r[1].toLowerCase() === login.toLowerCase());
  if (i < 0) return null;
  const r = rows[i];
  if ((r[4] || "SIM").toUpperCase().startsWith("N")) return null;
  return { rowNumber: i + 2, empresa: r[0] || r[1], login: r[1], senha: r[2] || "", spreadsheetId: extractSheetId(r[3] || "") };
}

export async function login(loginName: string, senha: string) {
  const u = findUser(await readLogins(), loginName);
  if (!u || !u.senha || u.senha !== senha) throw new Error("Login ou senha incorretos");
  const payload = `${u.login}|${Date.now() + 1000 * 60 * 60 * 24 * 7}`;
  setCookie(COOKIE, `${btoa(unescape(encodeURIComponent(payload)))}.${await sign(payload)}`, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7,
  });
  return { ok: true, needsSheet: !u.spreadsheetId };
}

export function logout() {
  deleteCookie(COOKIE, { path: "/" });
}

async function sessionLogin(): Promise<string | null> {
  const c = getCookie(COOKIE);
  if (!c) return null;
  const [p, sig] = c.split(".");
  if (!p || !sig) return null;
  let payload: string;
  try { payload = decodeURIComponent(escape(atob(p))); } catch { return null; }
  if ((await sign(payload)) !== sig) return null;
  const [name, exp] = payload.split("|");
  if (!name || Number(exp) < Date.now()) return null;
  return name;
}

/** Sessão atual, sempre conferida contra a planilha de logins (bloqueio/mudança de link vale na hora). */
export async function currentSession(): Promise<Session | null> {
  const name = await sessionLogin();
  if (!name) return null;
  const u = findUser(await readLogins(), name);
  if (!u) return null;
  return { empresa: u.empresa, login: u.login, spreadsheetId: u.spreadsheetId };
}

export async function requireCompanySheet(): Promise<string> {
  const s = await currentSession();
  if (!s) throw new Error("Sessão expirada. Entre novamente.");
  if (!s.spreadsheetId) throw new Error("Informe o link da planilha da empresa.");
  return s.spreadsheetId;
}

const HEADERS: Record<string, string[]> = {
  Servicos: ["ID", ...TABS.Servicos.fields.map((f) => f.label)],
  Materiais: [...TABS.Materiais.fields.map((f) => f.label), "Total"],
};

export async function saveCompanySheet(link: string) {
  const name = await sessionLogin();
  if (!name) throw new Error("Sessão expirada. Entre novamente.");
  const id = extractSheetId(link);
  if (!id) throw new Error("Link inválido. Cole o link completo da planilha Google.");
  let meta;
  try {
    meta = await gw(`/spreadsheets/${id}?fields=sheets.properties.title`);
  } catch {
    throw new Error("Não consegui abrir essa planilha. Compartilhe-a como Editor com a conta Google do sistema e tente de novo.");
  }
  const existing = new Set((meta.sheets ?? []).map((s: { properties: { title: string } }) => s.properties.title));
  const missing = TAB_NAMES.filter((t) => !existing.has(t));
  if (missing.length) {
    await gw(`/spreadsheets/${id}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests: missing.map((t) => ({ addSheet: { properties: { title: t } } })) }) });
    await gw(`/spreadsheets/${id}/values:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({
        valueInputOption: "RAW",
        data: missing.map((t) => ({ range: `${t}!A1`, values: [HEADERS[t] ?? TABS[t].fields.map((f) => f.label)] })),
      }),
    });
  }
  const rows = await readLogins();
  const u = findUser(rows, name);
  if (!u) throw new Error("Usuário não encontrado");
  await gw(`/spreadsheets/${centralId()}/values/${LOGIN_TAB}!D${u.rowNumber}?valueInputOption=RAW`, {
    method: "PUT",
    body: JSON.stringify({ values: [[`https://docs.google.com/spreadsheets/d/${id}/edit`]] }),
  });
  return { ok: true };
}
