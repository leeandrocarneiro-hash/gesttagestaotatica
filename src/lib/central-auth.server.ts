import { getCookie, setCookie, deleteCookie } from "@tanstack/react-start/server";
import { TAB_NAMES, TABS } from "./sheets-config";

const GATEWAY = "https://connector-gateway.lovable.dev/google_sheets/v4";
const COOKIE = "gestta_central_session";
const encoder = new TextEncoder();

type Role = "general_admin" | "company_admin" | "employee";
type User = { id: string; nome: string; email: string; password: string; papel: Role; empresaId: string; ativo: string; permissoes: string };

function config() {
  const apiKey = process.env["LOVABLE_API_KEY"];
  const connectionKey = process.env["GOOGLE_SHEETS_API_KEY"];
  const spreadsheetId = process.env["GESTTA_CENTRAL_SPREADSHEET_ID"];
  if (!apiKey || ! connectionKey || !spreadsheetId) throw new Error("Conexão da planilha central não configurada no servidor.");
  return { apiKey, connectionKey, spreadsheetId };
}
async function request(path: string, init?: RequestInit) {
  const c = config();
  const response = await fetch(`${GATEWAY}/spreadsheets/${c.spreadsheetId}${path}`, {
    ...init, headers: { Authorization: `Bearer ${c.apiKey}`, "X-Connection-Api-Key": c.connectionKey, "Content-Type": "application/json" },
  });
  if (!response.ok) {
    const detail = await response.text();
    console.error("Central Sheets request failed", response.status, detail);
    throw new Error("Falha ao acessar os cadastros centrais do GESTTA.");
  }
  return response.json();
}
async function users(): Promise<User[]> {
  const result = await request("/values/Usuarios!A2:J");
  return ((result.values ?? []) as unknown[][]).map((r) => ({
    id: String(r[0] ?? ""), nome: String(r[1] ?? ""), email: String(r[2] ?? "").trim().toLowerCase(),
    password: String(r[3] ?? ""), papel: String(r[4] ?? "") as Role, empresaId: String(r[5] ?? ""),
    ativo: String(r[6] ?? ""), permissoes: String(r[7] ?? "{}"),
  }));
}
async function companies(): Promise<string[][]> {
  const result = await request("/values/Empresas!A2:K");
  return ((result.values ?? []) as unknown[][]).map((r) => r.map((v) => String(v ?? "")));
}
async function append(tab: string, range: string, values: (string | number)[]) {
  await request(`/values/${tab}!${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: "POST", body: JSON.stringify({ values: [values] }) });
}
async function audit(actor: User, action: string, details: Record<string, unknown>, empresaId = actor.empresaId) {
  await append("Auditoria", "A1:F1", [crypto.randomUUID(), actor.id, empresaId, action, JSON.stringify(details), new Date().toISOString()]);
}
async function secretKey() {
  const secret = process.env["GESTTA_SESSION_SECRET"];
  if (!secret || encoder.encode(secret).length < 32) throw new Error("GESTTA_SESSION_SECRET deve ter pelo menos 32 bytes aleatórios.");
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
  if (!user || user.ativo.toUpperCase() !== "SIM" || user.password !== password) throw new Error("E-mail ou senha incorretos.");
  if (requiredRole && user.papel !== requiredRole) throw new Error("Esta área é exclusiva do administrador geral.");
  if (rejectGeneralAdmin && user.papel === "general_admin") throw new Error("Use o acesso do administrador geral.");
  if (user.papel !== "general_admin") {
    const company = (await companies()).find((r) => r[0] === user.empresaId);
    if (!company || company[6].toUpperCase() !== "ATIVA") throw new Error("Acesso da empresa indisponível. Entre em contato com o administrador.");
  }
  await setSession(user.id);
  const userRows = await request("/values/Usuarios!A2:J");
  const userIndex = ((userRows.values ?? []) as unknown[][]).findIndex((row) => String(row[0] ?? "") === user.id);
  if (userIndex >= 0) {
    await request(`/values/Usuarios!J${userIndex + 2}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ values: [[new Date().toISOString()]] }) });
  }
  const companyRows = user.papel === "general_admin" ? [] : await companies();
  return { ok: true, role: user.papel, needsSheet: user.papel !== "general_admin" && !companyRows.some((r) => r[0] === user.empresaId && r[7]) };
}
export async function currentCentralUser(): Promise<User | null> {
  const cookie = getCookie(COOKIE);
  if (!cookie) return null;
  const [encoded, sig] = cookie.split(".");
  if (!encoded || !sig) return null;
  try {
    const payload = decodeURIComponent(escape(atob(encoded)));
    const normalizedSignature = sig.replace(/-/g, "+").replace(/_/g, "/");
    const signatureBytes = Uint8Array.from(
      atob(normalizedSignature + "=".repeat((4 - (normalizedSignature.length % 4)) % 4)),
      (character) => character.charCodeAt(0),
    );
    const validSignature = await crypto.subtle.verify("HMAC", await secretKey(), signatureBytes, encoder.encode(payload));
    if (!validSignature) return null;
    const session = JSON.parse(payload) as { sub: string; exp: number };
    if (!session.sub || session.exp < Date.now()) return null;
    const user = (await users()).find((u) => u.id === session.sub && u.ativo.toUpperCase() === "SIM");
    if (!user) return null;
    if (user.papel !== "general_admin") {
      const company = (await companies()).find((r) => r[0] === user.empresaId);
      if (!company || company[6].toUpperCase() !== "ATIVA") return null;
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
  const row = (await companies()).find((company) => company[0] === user.empresaId);
  return row?.[2] || row?.[1] || user.empresaId;
}
export async function requireCurrentCompanySheet(): Promise<string> {
  const user = await currentCentralUser();
  if (!user || user.papel === "general_admin") throw new Error("Entre com uma conta de empresa para acessar os dados.");
  const row = (await companies()).find((company) => company[0] === user.empresaId);
  if (!row || row[6].toUpperCase() !== "ATIVA") throw new Error("A empresa está bloqueada ou não está disponível.");
  if (!row[7]) throw new Error("Vincule a planilha da empresa para continuar.");
  return row[7];
}
export async function saveCurrentCompanySheet(link: string) {
  const user = await currentCentralUser();
  if (!user || user.papel !== "company_admin") throw new Error("Somente o administrador da empresa pode vincular ou trocar a planilha.");
  const companyRows = await companies();
  const companyIndex = companyRows.findIndex((row) => row[0] === user.empresaId);
  if (companyIndex < 0 || companyRows[companyIndex][6].toUpperCase() !== "ATIVA") throw new Error("Empresa não encontrada ou bloqueada.");
  const spreadsheetId = extractSpreadsheetId(link);
  if (!spreadsheetId) throw new Error("Link inválido. Cole o endereço completo de uma planilha Google.");
  const centralSpreadsheetId = config().spreadsheetId;
  if (spreadsheetId === centralSpreadsheetId) throw new Error("A planilha central não pode ser usada como planilha operacional.");
  if (companyRows.some((row, index) => index !== companyIndex && row[7] === spreadsheetId)) throw new Error("Essa planilha já está vinculada a outra empresa.");
  let metadata: { sheets?: { properties: { title: string } }[] };
  try {
    metadata = await fetch(`${GATEWAY}/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`, {
      headers: { Authorization: `Bearer ${config().apiKey}`, "X-Connection-Api-Key": config().connectionKey },
    }).then(async (response) => {
      if (!response.ok) throw new Error("unavailable");
      return response.json();
    });
  } catch {
    throw new Error("Não consegui acessar essa planilha. Compartilhe-a com a conta Google conectada ao GESTTA com permissão de Editor.");
  }
  const existing = new Set((metadata.sheets ?? []).map((sheet) => sheet.properties.title));
  const missing = TAB_NAMES.filter((tab) => !existing.has(tab));
  if (missing.length) {
    const addResponse = await fetch(GATEWAY + "/spreadsheets/" + spreadsheetId + ":batchUpdate", {
      method: "POST",
      headers: { Authorization: "Bearer " + config().apiKey, "X-Connection-Api-Key": config().connectionKey, "Content-Type": "application/json" },
      body: JSON.stringify({ requests: missing.map((title) => ({ addSheet: { properties: { title } } })) }),
    });
    if (!addResponse.ok) throw new Error("Não foi possível criar as abas necessárias na planilha.");
  }
  const ranges = TAB_NAMES.map((tab) => "ranges=" + encodeURIComponent(tab + "!A1:Z1")).join("&");
  const headerResponse = await fetch(GATEWAY + "/spreadsheets/" + spreadsheetId + "/values:batchGet?" + ranges, {
    headers: { Authorization: "Bearer " + config().apiKey, "X-Connection-Api-Key": config().connectionKey },
  });
  if (!headerResponse.ok) throw new Error("Não foi possível verificar os cabeçalhos das abas.");
  const headerData = await headerResponse.json();

  // A primeira conexão deve receber uma planilha operacional vazia.
  // Nunca vincule um arquivo que já contenha lançamentos, para evitar misturar dados.
  const dataRanges = TAB_NAMES.map((tab) => "ranges=" + encodeURIComponent(tab + "!A2:Z")).join("&");
  const dataResponse = await fetch(GATEWAY + "/spreadsheets/" + spreadsheetId + "/values:batchGet?" + dataRanges, {
    headers: { Authorization: "Bearer " + config().apiKey, "X-Connection-Api-Key": config().connectionKey },
  });
  if (!dataResponse.ok) throw new Error("Não foi possível verificar se a planilha está vazia.");
  const dataCheck = await dataResponse.json();
  const hasExistingData = (dataCheck.valueRanges ?? []).some((range: { values?: unknown[][] }) =>
    (range.values ?? []).some((row) => row.some((value) => String(value ?? "").trim() !== "")),
  );
  if (hasExistingData) {
    throw new Error("A planilha escolhida já contém informações. Crie uma planilha Google nova e vazia para conectar ao GESTTA.");
  }

  const headerUpdates = TAB_NAMES.flatMap((tab, index) => {
    const current = (headerData.valueRanges?.[index]?.values?.[0] ?? []) as unknown[];
    const expected = companySheetHeaders(tab);
    const normalized = current.map((value) => String(value ?? "").trim());
    if (normalized.some((value) => value !== "")) {
      const matches = normalized.length === expected.length && expected.every((value, column) => normalized[column] === value);
      if (!matches) throw new Error("A aba " + tab + " já possui cabeçalhos diferentes do padrão GESTTA. Nenhum dado foi sobrescrito; ajuste os cabeçalhos antes de vincular.");
      return [];
    }
    return [{ range: tab + "!A1", values: [expected] }];
  });
  if (headerUpdates.length) {
    const writeResponse = await fetch(GATEWAY + "/spreadsheets/" + spreadsheetId + "/values:batchUpdate", {
      method: "POST",
      headers: { Authorization: "Bearer " + config().apiKey, "X-Connection-Api-Key": config().connectionKey, "Content-Type": "application/json" },
      body: JSON.stringify({ valueInputOption: "RAW", data: headerUpdates }),
    });
    if (!writeResponse.ok) throw new Error("Não foi possível preparar os cabeçalhos das abas.");
  }
  await request(`/values/Empresas!H${companyIndex + 2}?valueInputOption=RAW`, {
    method: "PUT", body: JSON.stringify({ values: [[spreadsheetId]] }),
  });
  try { await audit(user, "link_company_spreadsheet", { spreadsheetId }, user.empresaId); }
  catch (error) { console.error("Planilha vinculada, mas auditoria falhou.", error); }
  return { ok: true };
}


type AccessRequest = { id: string; razaoSocial: string; nomeFantasia: string; cnpj: string; nome: string; usuario: string; senha: string; email: string; telefone: string; status: string; criadoEm: string };
async function accessRequests(): Promise<AccessRequest[]> {
  const result = await request("/values/Solicitacoes!A2:M");
  return ((result.values ?? []) as unknown[][]).map((r) => ({
    id: String(r[0] ?? ""), razaoSocial: String(r[1] ?? ""), nomeFantasia: String(r[2] ?? ""),
    cnpj: String(r[3] ?? ""), nome: String(r[4] ?? ""), usuario: String(r[5] ?? "").trim().toLowerCase(),
    senha: String(r[6] ?? ""), email: String(r[7] ?? "").trim().toLowerCase(), telefone: String(r[8] ?? ""),
    status: String(r[9] ?? ""), criadoEm: String(r[10] ?? ""),
  }));
}
export async function submitAccessRequest(input: { razaoSocial: string; nomeFantasia: string; cnpj: string; nome: string; usuario: string; senha: string; email: string; telefone: string }) {
  const all = await accessRequests();
  const username = input.usuario.trim().toLowerCase();
  if (all.some((r) => r.usuario === username && r.status.toUpperCase() === "PENDENTE")) throw new Error("Já existe uma solicitação pendente para esse usuário.");
  if ((await users()).some((u) => u.email === username)) throw new Error("Esse usuário já está cadastrado.");
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await append("Solicitacoes", "A1:M1", [id, input.razaoSocial.trim(), input.nomeFantasia.trim(), input.cnpj.replace(/\\D/g, ""), input.nome.trim(), username, input.senha, input.email.trim().toLowerCase(), input.telefone.trim(), "PENDENTE", now, "", ""]);
  return { ok: true, id };
}
export async function listAccessRequests() {
  await requireGeneralAdmin();
  return (await accessRequests()).filter((r) => r.status.toUpperCase() === "PENDENTE").map(({ senha, ...r }) => r);
}
export async function approveAccessRequest(requestId: string) {
  const actor = await requireGeneralAdmin();
  const rows = await accessRequests();
  const item = rows.find((r) => r.id === requestId);
  if (!item || item.status.toUpperCase() !== "PENDENTE") throw new Error("Solicitação não encontrada ou já analisada.");
  const allCompanies = await companies();
  const allUsers = await users();
  if (allCompanies.some((r) => item.cnpj && String(r[3] ?? "").replace(/\\D/g, "") === item.cnpj)) throw new Error("Já existe uma empresa cadastrada com esse CNPJ.");
  if (allUsers.some((u) => u.email === item.usuario)) throw new Error("Esse usuário já foi cadastrado.");
  const now = new Date().toISOString();
  const companyId = crypto.randomUUID(), userId = crypto.randomUUID();
  await append("Empresas", "A1:K1", [companyId, item.razaoSocial, item.nomeFantasia, item.cnpj, item.email, item.telefone, "ATIVA", "", now, now, actor.email]);
  await append("Usuarios", "A1:J1", [userId, item.nome, item.usuario, item.senha, "company_admin", companyId, "SIM", "{}", now, ""]);
  const latest = await accessRequests();
  const index = latest.findIndex((r) => r.id === requestId);
  if (index < 0) throw new Error("Não foi possível localizar a solicitação após criar a conta.");
  await request(`/values/Solicitacoes!J${index + 2}:M${index + 2}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ values: [["APROVADA", now, actor.email, companyId]] }) });
  await audit(actor, "approve_access_request", { requestId, companyId, userId }, companyId);
  return { ok: true, companyId, userId };
}
\nexport async function requireGeneralAdmin() {
  const user = await currentCentralUser();
  if (!user || user.papel !== "general_admin") throw new Error("Acesso restrito ao administrador geral.");
  return user;
}
export async function createCompanyAndAdmin(input: { razaoSocial: string; nomeFantasia: string; cnpj: string; emailContato: string; telefone: string; nomeAdmin: string; emailAdmin: string; senhaAdmin: string }) {
  const actor = await requireGeneralAdmin();
  const allCompanies = await companies();
  const allUsers = await users();
  const normalizedCnpj = input.cnpj.replace(/\D/g, "");
  const normalizedEmail = input.emailAdmin.trim().toLowerCase();
  if (allCompanies.some((r) => normalizedCnpj && String(r[3] ?? "").replace(/\D/g, "") === normalizedCnpj)) throw new Error("Já existe uma empresa cadastrada com esse CNPJ.");
  if (allUsers.some((u) => u.email === normalizedEmail)) throw new Error("Já existe um usuário com esse e-mail.");
  const now = new Date().toISOString();
  const companyId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  
  // A empresa nasce pendente: falha ao gravar o administrador nunca libera um cadastro incompleto.
  await append("Empresas", "A1:K1", [companyId, input.razaoSocial.trim(), input.nomeFantasia.trim(), normalizedCnpj, input.emailContato.trim().toLowerCase(), input.telefone.trim(), "PENDENTE", "", now, "", actor.email]);
  await append("Usuarios", "A1:K1", [userId, input.nomeAdmin.trim(), normalizedEmail, input.senhaAdmin, "company_admin", companyId, "SIM", "{}", now, ""]);
  const refreshedCompanies = await companies();
  const companyIndex = refreshedCompanies.findIndex((row) => row[0] === companyId);
  if (companyIndex < 0) throw new Error("Cadastro criado parcialmente: empresa pendente de reconciliação. Não tente cadastrar novamente; confira a aba Empresas.");
  await request(`/values/Empresas!J${companyIndex + 2}:K${companyIndex + 2}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ values: [[now, actor.email]] }) });
  await request(`/values/Empresas!G${companyIndex + 2}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ values: [["ATIVA"]] }) });
  try { await audit(actor, "create_company_and_admin", { companyId, userId, razaoSocial: input.razaoSocial }, companyId); }
  catch (error) { console.error("Empresa criada, mas o registro de auditoria falhou.", error); }
  return { ok: true, companyId, userId };
}
export async function setCompanyStatus(companyId: string, status: "ATIVA" | "BLOQUEADA") {
  const actor = await requireGeneralAdmin();
  const rows = await companies();
  const index = rows.findIndex((r) => r[0] === companyId);
  if (index < 0) throw new Error("Empresa não encontrada.");
  await request(`/values/Empresas!G${index + 2}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ values: [[status]] }) });
  await audit(actor, status === "ATIVA" ? "reactivate_company" : "block_company", { companyId, status }, companyId);
  return { ok: true };
}
export async function listCompanies() {
  await requireGeneralAdmin();
  return (await companies()).map((r) => ({ id: r[0], razaoSocial: r[1], nomeFantasia: r[2], cnpj: r[3], emailContato: r[4], telefone: r[5], status: r[6], spreadsheetLinked: Boolean(r[7]) }));
}
