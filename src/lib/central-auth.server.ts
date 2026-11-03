import { getCookie, setCookie, deleteCookie } from "@tanstack/react-start/server";
import { verifyPassword, hashPassword } from "./password.server";
import { TAB_NAMES, TABS } from "./sheets-config";

const GATEWAY = "https://connector-gateway.lovable.dev/google_sheets/v4";
const COOKIE = "gestta_central_session";
const encoder = new TextEncoder();
type Company = { id: string; name: string; cnpj: string; email: string; passwordHash: string; passwordSalt: string; status: string; spreadsheetId: string };
function config() {
  const apiKey = process.env["LOVABLE_API_KEY"];
  const connectionKey = process.env["GOOGLE_SHEETS_API_KEY"];
  const spreadsheetId = process.env["GESTTA_CENTRAL_SPREADSHEET_ID"];
  if (!apiKey || !connectionKey || !spreadsheetId) throw new Error("Conexão da planilha central não configurada no servidor.");
  return { apiKey, connectionKey, spreadsheetId };
}
async function request(path: string, init?: RequestInit) {
  const c = config();
  const response = await fetch(`${GATEWAY}/spreadsheets/${c.spreadsheetId}${path}`, { ...init, headers: { Authorization: `Bearer ${c.apiKey}`, "X-Connection-Api-Key": c.connectionKey, "Content-Type": "application/json" } });
  if (!response.ok) { console.error("Central Sheets request failed", response.status, await response.text()); throw new Error("Falha ao acessar a planilha central do GESTTA."); }
  return response.json();
}
async function companies(): Promise<Company[]> {
  const result = await request("/values/Empresas!A2:I");
  return ((result.values ?? []) as unknown[][]).map((r) => ({
    id: String(r[0] ?? ""), name: String(r[1] ?? ""), cnpj: String(r[2] ?? ""),
    email: String(r[3] ?? "").toLowerCase(), passwordHash: String(r[4] ?? ""),
    passwordSalt: String(r[5] ?? ""), status: String(r[6] ?? ""), spreadsheetId: String(r[7] ?? ""),
  }));
}
async function appendCompany(values: string[]) {
  await request("/values/Empresas!A1:I1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS", { method: "POST", body: JSON.stringify({ values: [values] }) });
}
async function secretKey() {
  const secret = process.env["GESTTA_SESSION_SECRET"];
  if (!secret || encoder.encode(secret).length < 32) throw new Error("GESTTA_SESSION_SECRET deve ter pelo menos 32 bytes aleatórios.");
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
function b64(bytes: ArrayBuffer) { return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_"); }
async function signature(payload: string) { return b64(await crypto.subtle.sign("HMAC", await secretKey(), encoder.encode(payload))); }
async function setSession(companyId: string) {
  const payload = JSON.stringify({ sub: companyId, exp: Date.now() + 8 * 60 * 60 * 1000 });
  const token = btoa(unescape(encodeURIComponent(payload)));
  setCookie(COOKIE, `${token}.${await signature(payload)}`, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 8 * 60 * 60 });
}
export async function centralLogout() { deleteCookie(COOKIE, { path: "/" }); }
export async function centralLogin(email: string, password: string) {
  const company = (await companies()).find((c) => c.email === email.trim().toLowerCase());
  if (!company || company.status.toUpperCase() !== "ATIVA" || !(await verifyPassword(password, company.passwordHash, company.passwordSalt))) throw new Error("E-mail ou senha incorretos.");
  await setSession(company.id);
  return { ok: true, role: "company_admin" as const, needsSheet: !company.spreadsheetId };
}
export async function currentCentralUser(): Promise<Company | null> {
  const cookie = getCookie(COOKIE);
  if (!cookie) return null;
  const [encoded, sig] = cookie.split(".");
  if (!encoded || !sig) return null;
  try {
    const payload = decodeURIComponent(escape(atob(encoded)));
    const normalized = sig.replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(normalized + "=".repeat((4 - normalized.length % 4) % 4)), c => c.charCodeAt(0));
    if (!await crypto.subtle.verify("HMAC", await secretKey(), bytes, encoder.encode(payload))) return null;
    const session = JSON.parse(payload) as { sub: string; exp: number };
    if (!session.sub || session.exp < Date.now()) return null;
    const company = (await companies()).find(c => c.id === session.sub && c.status.toUpperCase() === "ATIVA");
    return company ?? null;
  } catch { return null; }
}
export async function currentCompanyLabel() { return (await currentCentralUser())?.name ?? ""; }
export async function requireCurrentCompanySheet() {
  const company = await currentCentralUser();
  if (!company) throw new Error("Entre com sua conta de empresa para acessar os dados.");
  if (!company.spreadsheetId) throw new Error("A planilha da empresa ainda não está vinculada.");
  return company.spreadsheetId;
}
function companySheetHeaders(tab: (typeof TAB_NAMES)[number]) {
  if (tab === "Servicos") return ["ID", ...TABS.Servicos.fields.map(f => f.label)];
  if (tab === "Materiais") return [...TABS.Materiais.fields.map(f => f.label), "Total"];
  return TABS[tab].fields.map(f => f.label);
}
async function createCompanySpreadsheet(companyName: string) {
  const c = config();
  const response = await fetch(GATEWAY + "/spreadsheets", { method: "POST", headers: { Authorization: `Bearer ${c.apiKey}`, "X-Connection-Api-Key": c.connectionKey, "Content-Type": "application/json" }, body: JSON.stringify({ properties: { title: `GESTTA - ${companyName}` } }) });
  if (!response.ok) throw new Error("Não foi possível criar a planilha financeira da empresa.");
  const created = await response.json() as { spreadsheetId?: string };
  const id = created.spreadsheetId;
  if (!id || id === c.spreadsheetId) throw new Error("O Google não retornou um ID válido para a planilha.");
  const init = await fetch(`${GATEWAY}/spreadsheets/${id}:batchUpdate`, { method: "POST", headers: { Authorization: `Bearer ${c.apiKey}`, "X-Connection-Api-Key": c.connectionKey, "Content-Type": "application/json" }, body: JSON.stringify({ requests: TAB_NAMES.map(title => ({ addSheet: { properties: { title } } })) }) });
  if (!init.ok) throw new Error("A planilha foi criada, mas não foi possível preparar suas abas.");
  const data = TAB_NAMES.map(tab => ({ range: `${tab}!A1`, values: [companySheetHeaders(tab)] }));
  const headers = await fetch(`${GATEWAY}/spreadsheets/${id}/values:batchUpdate`, { method: "POST", headers: { Authorization: `Bearer ${c.apiKey}`, "X-Connection-Api-Key": c.connectionKey, "Content-Type": "application/json" }, body: JSON.stringify({ valueInputOption: "RAW", data }) });
  if (!headers.ok) throw new Error("A planilha foi criada, mas não foi possível configurar os cabeçalhos.");
  return id;
}
export async function registerCompanyAccount(input: { companyName: string; displayName: string; email: string; password: string }) {
  const email = input.email.trim().toLowerCase();
  if ((await companies()).some(c => c.email === email)) throw new Error("Este e-mail já possui uma conta no GESTTA.");
  const id = crypto.randomUUID();
  const credentials = await hashPassword(input.password);
  const spreadsheetId = await createCompanySpreadsheet(input.companyName.trim());
  await appendCompany([id, input.companyName.trim(), "", email, credentials.passwordHash, credentials.passwordSalt, "ATIVA", spreadsheetId, new Date().toISOString()]);
  await setSession(id);
  return { ok: true, companyId: id };
}
