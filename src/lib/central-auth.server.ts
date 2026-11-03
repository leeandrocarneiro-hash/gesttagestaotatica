import { getCookie, setCookie, deleteCookie } from "@tanstack/react-start/server";
import { verifyPassword, hashPassword } from "./password.server";
import { TAB_NAMES, TABS } from "./sheets-config";

const GATEWAY = "https://connector-gateway.lovable.dev/google_sheets/v4";
const COOKIE = "gestta_session";
const encoder = new TextEncoder();

type Role = "general_admin" | "company_admin" | "employee";
type User = { id: string; nome: string; email: string; passwordHash: string; passwordSalt: string; papel: Role; empresaId: string; ativo: string; permissoes: string };
type Company = { id: string; razaoSocial: string; nomeFantasia: string; cnpj: string; emailContato: string; telefone: string; status: string; spreadsheetId: string; criadoEm: string; atualizadoEm: string; origem: string };

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Configuração obrigatória ausente no servidor: ${name}`);
  return value;
}

async function d1<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const account = env("CLOUDFLARE_ACCOUNT_ID");
  const database = env("CLOUDFLARE_D1_DATABASE_ID");
  const token = env("CLOUDFLARE_API_TOKEN");
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ sql, params }),
  });
  const payload = await response.json() as { success?: boolean; errors?: { message?: string }[]; result?: { success?: boolean; results?: T[]; error?: string }[] };
  if (!response.ok || !payload.success || payload.result?.[0]?.success === false) {
    console.error("GESTTA D1 query failed", response.status, payload.errors ?? payload.result?.[0]?.error);
    throw new Error("Não foi possível acessar o cadastro seguro do GESTTA. Verifique a configuração do banco.");
  }
  return payload.result?.[0]?.results ?? [];
}

let schemaReady: Promise<void> | undefined;
async function ensureSchema() {
  if (!schemaReady) schemaReady = (async () => {
    await d1("CREATE TABLE IF NOT EXISTS companies (id TEXT PRIMARY KEY, razao_social TEXT NOT NULL, nome_fantasia TEXT NOT NULL, cnpj TEXT NOT NULL DEFAULT '', email_contato TEXT NOT NULL DEFAULT '', telefone TEXT NOT NULL DEFAULT '', status TEXT NOT NULL, spreadsheet_id TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, origem TEXT NOT NULL DEFAULT '')");
    await d1("CREATE UNIQUE INDEX IF NOT EXISTS companies_cnpj_unique ON companies(cnpj) WHERE cnpj <> ''");
    await d1("CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, nome TEXT NOT NULL, email TEXT NOT NULL COLLATE NOCASE UNIQUE, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, role TEXT NOT NULL, company_id TEXT NOT NULL DEFAULT '', active TEXT NOT NULL DEFAULT 'SIM', permissions TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, last_login TEXT NOT NULL DEFAULT '', FOREIGN KEY(company_id) REFERENCES companies(id))");
    await d1("CREATE INDEX IF NOT EXISTS users_company_idx ON users(company_id)");
    await d1("CREATE TABLE IF NOT EXISTS audit_log (id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, company_id TEXT NOT NULL, action TEXT NOT NULL, details TEXT NOT NULL, created_at TEXT NOT NULL)");
    await d1("CREATE TABLE IF NOT EXISTS app_migrations (name TEXT PRIMARY KEY, completed_at TEXT NOT NULL)");
  })().catch((error) => { schemaReady = undefined; throw error; });
  return schemaReady;
}

async function query<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  await ensureSchema();
  return d1<T>(sql, params);
}
async function users(): Promise<User[]> {
  const rows = await query<Record<string, unknown>>("SELECT id,nome,email,password_hash,password_salt,role,company_id,active,permissions FROM users");
  return rows.map((r) => ({ id: String(r.id), nome: String(r.nome), email: String(r.email).toLowerCase(), passwordHash: String(r.password_hash), passwordSalt: String(r.password_salt), papel: String(r.role) as Role, empresaId: String(r.company_id), ativo: String(r.active), permissoes: String(r.permissions) }));
}
async function companies(): Promise<Company[]> {
  const rows = await query<Record<string, unknown>>("SELECT * FROM companies");
  return rows.map((r) => ({ id: String(r.id), razaoSocial: String(r.razao_social), nomeFantasia: String(r.nome_fantasia), cnpj: String(r.cnpj), emailContato: String(r.email_contato), telefone: String(r.telefone), status: String(r.status), spreadsheetId: String(r.spreadsheet_id), criadoEm: String(r.created_at), atualizadoEm: String(r.updated_at), origem: String(r.origem) }));
}
async function audit(actor: User, action: string, details: Record<string, unknown>, companyId = actor.empresaId) {
  await query("INSERT INTO audit_log (id,actor_id,company_id,action,details,created_at) VALUES (?,?,?,?,?,?)", [crypto.randomUUID(), actor.id, companyId, action, JSON.stringify(details), new Date().toISOString()]);
}
async function secretKey() {
  const secret = env("GESTTA_SESSION_SECRET");
  if (encoder.encode(secret).length < 32) throw new Error("GESTTA_SESSION_SECRET deve ter pelo menos 32 bytes aleatórios.");
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
function b64(bytes: ArrayBuffer) { return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_"); }
async function signature(payload: string) { return b64(await crypto.subtle.sign("HMAC", await secretKey(), encoder.encode(payload))); }
async function setSession(userId: string) {
  const payload = JSON.stringify({ sub: userId, exp: Date.now() + 8 * 60 * 60 * 1000 });
  const token = btoa(unescape(encodeURIComponent(payload)));
  setCookie(COOKIE, `${token}.${await signature(payload)}`, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 8 * 60 * 60 });
}
export async function centralLogout() { deleteCookie(COOKIE, { path: "/" }); }
export async function centralLogin(email: string, password: string, requiredRole?: Role, rejectGeneralAdmin = false) {
  const user = (await users()).find((u) => u.email === email.trim().toLowerCase());
  if (!user || user.ativo.toUpperCase() !== "SIM" || !(await verifyPassword(password, user.passwordHash, user.passwordSalt))) throw new Error("E-mail ou senha incorretos.");
  if (requiredRole && user.papel !== requiredRole) throw new Error("Esta área é exclusiva do administrador geral.");
  if (rejectGeneralAdmin && user.papel === "general_admin") throw new Error("Use o acesso do administrador geral.");
  if (user.papel !== "general_admin") {
    const company = (await companies()).find((r) => r.id === user.empresaId);
    if (!company || company.status.toUpperCase() !== "ATIVA") throw new Error("Acesso da empresa indisponível. Entre em contato com o administrador.");
  }
  await setSession(user.id);
  await query("UPDATE users SET last_login=? WHERE id=?", [new Date().toISOString(), user.id]);
  const company = user.papel === "general_admin" ? undefined : (await companies()).find((r) => r.id === user.empresaId);
  return { ok: true, role: user.papel, needsSheet: user.papel !== "general_admin" && !company?.spreadsheetId };
}
export async function currentCentralUser(): Promise<User | null> {
  const cookie = getCookie(COOKIE);
  if (!cookie) return null;
  const [encoded, sig] = cookie.split(".");
  if (!encoded || !sig) return null;
  try {
    const payload = decodeURIComponent(escape(atob(encoded)));
    const normalized = sig.replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(normalized + "=".repeat((4 - normalized.length % 4) % 4)), (c) => c.charCodeAt(0));
    if (!(await crypto.subtle.verify("HMAC", await secretKey(), bytes, encoder.encode(payload)))) return null;
    const session = JSON.parse(payload) as { sub: string; exp: number };
    if (!session.sub || session.exp < Date.now()) return null;
    const user = (await users()).find((u) => u.id === session.sub && u.ativo.toUpperCase() === "SIM");
    if (!user) return null;
    if (user.papel !== "general_admin") {
      const company = (await companies()).find((r) => r.id === user.empresaId);
      if (!company || company.status.toUpperCase() !== "ATIVA") return null;
    }
    return user;
  } catch { return null; }
}
function extractSpreadsheetId(link: string) {
  const match = link.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/) || link.trim().match(/^([a-zA-Z0-9_-]{30,})$/);
  return match?.[1] ?? null;
}
function companySheetHeaders(tab: (typeof TAB_NAMES)[number]) {
  if (tab === "Servicos") return ["ID", ...TABS.Servicos.fields.map((field) => field.label)];
  if (tab === "Materiais") return [...TABS.Materiais.fields.map((field) => field.label), "Total"];
  return TABS[tab].fields.map((field) => field.label);
}
export async function currentCompanyLabel(): Promise<string> {
  const user = await currentCentralUser();
  if (!user || user.papel === "general_admin") return "";
  const row = (await companies()).find((company) => company.id === user.empresaId);
  return row?.nomeFantasia || row?.razaoSocial || user.empresaId;
}
export async function requireCurrentCompanySheet(): Promise<string> {
  const user = await currentCentralUser();
  if (!user || user.papel === "general_admin") throw new Error("Entre com uma conta de empresa para acessar os dados.");
  const row = (await companies()).find((company) => company.id === user.empresaId);
  if (!row || row.status.toUpperCase() !== "ATIVA") throw new Error("A empresa está bloqueada ou não está disponível.");
  if (!row.spreadsheetId) throw new Error("Vincule a planilha da empresa para continuar.");
  return row.spreadsheetId;
}
export async function saveCurrentCompanySheet(link: string) {
  const user = await currentCentralUser();
  if (!user || user.papel !== "company_admin") throw new Error("Somente o administrador da empresa pode vincular ou trocar a planilha.");
  const all = await companies();
  const company = all.find((row) => row.id === user.empresaId);
  if (!company || company.status.toUpperCase() !== "ATIVA") throw new Error("Empresa não encontrada ou bloqueada.");
  const spreadsheetId = extractSpreadsheetId(link);
  if (!spreadsheetId) throw new Error("Link inválido. Cole o endereço completo de uma planilha Google.");
  if (all.some((row) => row.id !== company.id && row.spreadsheetId === spreadsheetId)) throw new Error("Essa planilha já está vinculada a outra empresa.");
  const apiKey = env("LOVABLE_API_KEY"), connectionKey = env("GOOGLE_SHEETS_API_KEY");
  let metadata: { sheets?: { properties: { title: string } }[] };
  try {
    const response = await fetch(`${GATEWAY}/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`, { headers: { Authorization: `Bearer ${apiKey}`, "X-Connection-Api-Key": connectionKey } });
    if (!response.ok) throw new Error("unavailable");
    metadata = await response.json();
  } catch { throw new Error("Não consegui acessar essa planilha. Compartilhe-a com a conta Google conectada ao GESTTA com permissão de Editor."); }
  const existing = new Set((metadata.sheets ?? []).map((s) => s.properties.title));
  const missing = TAB_NAMES.filter((tab) => !existing.has(tab));
  if (missing.length) {
    const response = await fetch(`${GATEWAY}/spreadsheets/${spreadsheetId}:batchUpdate`, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "X-Connection-Api-Key": connectionKey, "Content-Type": "application/json" }, body: JSON.stringify({ requests: missing.map((title) => ({ addSheet: { properties: { title } } })) }) });
    if (!response.ok) throw new Error("Não foi possível criar as abas necessárias na planilha.");
  }
  const ranges = TAB_NAMES.map((tab) => "ranges=" + encodeURIComponent(tab + "!A1:Z1")).join("&");
  const headerResponse = await fetch(`${GATEWAY}/spreadsheets/${spreadsheetId}/values:batchGet?${ranges}`, { headers: { Authorization: `Bearer ${apiKey}`, "X-Connection-Api-Key": connectionKey } });
  if (!headerResponse.ok) throw new Error("Não foi possível verificar os cabeçalhos das abas.");
  const headerData = await headerResponse.json();
  const updates = TAB_NAMES.flatMap((tab, index) => {
    const current = (headerData.valueRanges?.[index]?.values?.[0] ?? []) as unknown[];
    const expected = companySheetHeaders(tab);
    const normalized = current.map((v) => String(v ?? "").trim());
    if (normalized.some(Boolean)) {
      if (normalized.length !== expected.length || !expected.every((v, i) => normalized[i] === v)) throw new Error("A aba " + tab + " já possui cabeçalhos diferentes do padrão GESTTA. Nenhum dado foi sobrescrito.");
      return [];
    }
    return [{ range: tab + "!A1", values: [expected] }];
  });
  if (updates.length) {
    const response = await fetch(`${GATEWAY}/spreadsheets/${spreadsheetId}/values:batchUpdate`, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "X-Connection-Api-Key": connectionKey, "Content-Type": "application/json" }, body: JSON.stringify({ valueInputOption: "RAW", data: updates }) });
    if (!response.ok) throw new Error("Não foi possível preparar os cabeçalhos das abas.");
  }
  await query("UPDATE companies SET spreadsheet_id=?,updated_at=? WHERE id=?", [spreadsheetId, new Date().toISOString(), company.id]);
  try { await audit(user, "link_company_spreadsheet", { spreadsheetId }, user.empresaId); } catch (error) { console.error("Planilha vinculada, mas auditoria falhou.", error); }
  return { ok: true };
}
async function createCompanySpreadsheet(companyName: string): Promise<string> {
  const apiKey = env("LOVABLE_API_KEY"), connectionKey = env("GOOGLE_SHEETS_API_KEY");
  const response = await fetch(GATEWAY + "/spreadsheets", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "X-Connection-Api-Key": connectionKey, "Content-Type": "application/json" }, body: JSON.stringify({ properties: { title: `GESTTA - ${companyName}` } }) });
  if (!response.ok) { console.error("Google Sheets create failed", response.status, await response.text()); throw new Error("A conexão Google do GESTTA não conseguiu criar uma planilha. Verifique as permissões do Google Drive/Sheets."); }
  const created = await response.json() as { spreadsheetId?: string };
  const id = created.spreadsheetId;
  if (!id) throw new Error("O Google não retornou um ID válido para a nova planilha.");
  const init = await fetch(`${GATEWAY}/spreadsheets/${id}:batchUpdate`, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "X-Connection-Api-Key": connectionKey, "Content-Type": "application/json" }, body: JSON.stringify({ requests: TAB_NAMES.map((tab) => ({ addSheet: { properties: { title: tab } } })) }) });
  if (!init.ok) throw new Error("A planilha foi criada, mas não foi possível inicializar as abas.");
  const data = TAB_NAMES.map((tab) => ({ range: `${tab}!A1`, values: [companySheetHeaders(tab)] }));
  const write = await fetch(`${GATEWAY}/spreadsheets/${id}/values:batchUpdate`, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "X-Connection-Api-Key": connectionKey, "Content-Type": "application/json" }, body: JSON.stringify({ valueInputOption: "RAW", data }) });
  if (!write.ok) throw new Error("A planilha foi criada, mas não foi possível preparar os cabeçalhos.");
  return id;
}
export async function registerCompanyAccount(input: { companyName: string; displayName: string; email: string; password: string }) {
  const email = input.email.trim().toLowerCase();
  if ((await users()).some((u) => u.email === email)) throw new Error("Não foi possível concluir o cadastro. Verifique os dados informados.");
  const companyId = crypto.randomUUID(), userId = crypto.randomUUID(), now = new Date().toISOString();
  const credentials = await hashPassword(input.password);
  const spreadsheetId = await createCompanySpreadsheet(input.companyName.trim());
  await query("INSERT INTO companies (id,razao_social,nome_fantasia,status,spreadsheet_id,created_at,updated_at,origem) VALUES (?,?,?,'ATIVA',?,?,?,'self-service')", [companyId, input.companyName.trim(), input.companyName.trim(), spreadsheetId, now, now]);
  try {
    await query("INSERT INTO users (id,nome,email,password_hash,password_salt,role,company_id,active,permissions,created_at) VALUES (?,?,?,?,?,'company_admin',?,'SIM','{}',?)", [userId, input.displayName.trim(), email, credentials.passwordHash, credentials.passwordSalt, companyId, now]);
  } catch (error) {
    await query("DELETE FROM companies WHERE id=?", [companyId]);
    throw error;
  }
  await setSession(userId);
  return { ok: true, companyId };
}
export async function requireGeneralAdmin() {
  const user = await currentCentralUser();
  if (!user || user.papel !== "general_admin") throw new Error("Acesso restrito ao administrador geral.");
  return user;
}
export async function createCompanyAndAdmin(input: { razaoSocial: string; nomeFantasia: string; cnpj: string; emailContato: string; telefone: string; nomeAdmin: string; emailAdmin: string; senhaAdmin: string }) {
  const actor = await requireGeneralAdmin();
  const allCompanies = await companies(), allUsers = await users();
  const cnpj = input.cnpj.replace(/\D/g, ""), email = input.emailAdmin.trim().toLowerCase();
  if (allCompanies.some((r) => cnpj && r.cnpj.replace(/\D/g, "") === cnpj)) throw new Error("Já existe uma empresa cadastrada com esse CNPJ.");
  if (allUsers.some((u) => u.email === email)) throw new Error("Já existe um usuário com esse e-mail.");
  const now = new Date().toISOString(), companyId = crypto.randomUUID(), userId = crypto.randomUUID();
  const credentials = await hashPassword(input.senhaAdmin);
  await query("INSERT INTO companies (id,razao_social,nome_fantasia,cnpj,email_contato,telefone,status,created_at,updated_at,origem) VALUES (?,?,?,?,?,?,'ATIVA',?,?,?)", [companyId, input.razaoSocial.trim(), input.nomeFantasia.trim(), cnpj, input.emailContato.trim().toLowerCase(), input.telefone.trim(), now, now, actor.email]);
  await query("INSERT INTO users (id,nome,email,password_hash,password_salt,role,company_id,active,permissions,created_at) VALUES (?,?,?,?,?,'company_admin',?,'SIM','{}',?)", [userId, input.nomeAdmin.trim(), email, credentials.passwordHash, credentials.passwordSalt, companyId, now]);
  try { await audit(actor, "create_company_and_admin", { companyId, userId, razaoSocial: input.razaoSocial }, companyId); } catch (error) { console.error("Empresa criada, mas auditoria falhou.", error); }
  return { ok: true, companyId, userId };
}
export async function setCompanyStatus(companyId: string, status: "ATIVA" | "BLOQUEADA") {
  const actor = await requireGeneralAdmin();
  const result = await query("UPDATE companies SET status=?,updated_at=? WHERE id=? RETURNING id", [status, new Date().toISOString(), companyId]);
  if (!result.length) throw new Error("Empresa não encontrada.");
  await audit(actor, status === "ATIVA" ? "reactivate_company" : "block_company", { companyId, status }, companyId);
  return { ok: true };
}
export async function listCompanies() {
  await requireGeneralAdmin();
  return (await companies()).map((r) => ({ id: r.id, razaoSocial: r.razaoSocial, nomeFantasia: r.nomeFantasia, cnpj: r.cnpj, emailContato: r.emailContato, telefone: r.telefone, status: r.status, spreadsheetLinked: Boolean(r.spreadsheetId) }));
}
