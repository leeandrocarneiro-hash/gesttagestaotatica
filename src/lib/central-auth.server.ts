import { getCookie, setCookie, deleteCookie } from "@tanstack/react-start/server";
import { verifyPassword, hashPassword } from "./password.server";

const GATEWAY = "https://connector-gateway.lovable.dev/google_sheets/v4";
const DEFAULT_SPREADSHEET_ID = "1inU8c_VuiHPTUePSvbEGGrQpDVlG3pYwG6j4gMJcsPk";
const COOKIE = "gestta_central_session";
const encoder = new TextEncoder();

export type Role = "general_admin" | "company_admin" | "employee";
export type CentralUser = {
  id: string;
  nome: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  papel: Role;
  empresaId: string;
  ativo: string;
  permissoes: string;
};

const BUSINESS_TABS = {
  Servicos: {
    headers: ["ID", "Data agendada", "Cliente", "Telefone", "Descrição do serviço", "Status", "Preço cobrado", "Observações"],
    rangeEnd: "J",
  },
  Atendimentos: {
    headers: ["Data", "Cliente", "Contato", "Canal", "Assunto", "Observações"],
    rangeEnd: "H",
  },
  Materiais: {
    headers: ["Data", "ID Serviço", "Material", "Fornecedor", "Quantidade", "Custo unitário", "Total"],
    rangeEnd: "I",
  },
  Recebimentos: {
    headers: ["Data", "ID Serviço", "Cliente", "Valor", "Forma de pagamento"],
    rangeEnd: "G",
  },
  Despesas: {
    headers: ["Data", "ID Serviço", "Categoria", "Descrição", "Valor"],
    rangeEnd: "G",
  },
} as const;

const SUPPORT_HEADERS: Record<string, string[]> = {
  Empresas: ["ID", "Razão social", "Nome fantasia", "CNPJ", "E-mail de contato", "Telefone", "Status", "Planilha compartilhada", "Criado em", "Atualizado em", "Criado por"],
  Usuarios: ["ID", "Nome", "E-mail", "Hash da senha", "Salt da senha", "Papel", "Empresa ID", "Ativo", "Permissões", "Criado em", "Último acesso"],
  Auditoria: ["ID", "Usuário ID", "Empresa ID", "Ação", "Detalhes", "Data"],
};

function config() {
  const apiKey = process.env["LOVABLE_API_KEY"];
  const connectionKey = process.env["GOOGLE_SHEETS_API_KEY"];
  const spreadsheetId = process.env["GESTTA_CENTRAL_SPREADSHEET_ID"] || DEFAULT_SPREADSHEET_ID;
  if (!apiKey || !connectionKey) {
    throw new Error("A conexão Google Sheets do GESTTA não está configurada no servidor. Configure LOVABLE_API_KEY e GOOGLE_SHEETS_API_KEY.");
  }
  return { apiKey, connectionKey, spreadsheetId };
}

function headers() {
  const c = config();
  return {
    Authorization: `Bearer ${c.apiKey}`,
    "X-Connection-Api-Key": c.connectionKey,
    "Content-Type": "application/json",
  };
}

async function request(path: string, init?: RequestInit): Promise<any> {
  const c = config();
  const response = await fetch(`${GATEWAY}/spreadsheets/${c.spreadsheetId}${path}`, {
    ...init,
    headers: { ...headers(), ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    const detail = await response.text();
    console.error("GESTTA Google Sheets request failed", response.status, detail);
    throw new Error("Não foi possível acessar a planilha compartilhada do GESTTA.");
  }
  if (response.status === 204) return {};
  return response.json();
}

async function readRange(range: string): Promise<string[][]> {
  const result = await request(`/values/${encodeURIComponent(range)}`);
  return ((result.values ?? []) as unknown[][]).map((row) => row.map((value) => String(value ?? "")));
}

async function writeRange(range: string, values: (string | number)[][]) {
  return request(`/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
    method: "PUT",
    body: JSON.stringify({ values }),
  });
}

async function append(tab: string, values: (string | number)[]) {
  return request(`/values/${encodeURIComponent(tab + "!A1:Z1")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: "POST",
    body: JSON.stringify({ values: [values] }),
  });
}

function columnName(index: number): string {
  let value = index + 1;
  let output = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    output = String.fromCharCode(65 + remainder) + output;
    value = Math.floor((value - 1) / 26);
  }
  return output;
}

async function sheetMetadata(): Promise<{ title: string; sheetId: number }[]> {
  const data = await request("?fields=sheets.properties.sheetId,sheets.properties.title");
  return (data.sheets ?? []).map((sheet: any) => ({
    title: String(sheet.properties?.title ?? ""),
    sheetId: Number(sheet.properties?.sheetId ?? -1),
  }));
}

/**
 * Adds only the GESTTA support tabs and two technical columns at the END
 * of operational tabs. Existing business columns and the Resumo tab are kept.
 */
export async function ensureSharedSchema() {
  const metadata = await sheetMetadata();
  const existing = new Set(metadata.map((sheet) => sheet.title));
  const required = [...Object.keys(SUPPORT_HEADERS), ...Object.keys(BUSINESS_TABS)];
  const missing = required.filter((title) => !existing.has(title));
  if (missing.length) {
    const result = await request(":batchUpdate", {
      method: "POST",
      body: JSON.stringify({
        requests: missing.map((title) => ({ addSheet: { properties: { title } } })),
      }),
    });
    void result;
  }

  for (const [tab, expected] of Object.entries(SUPPORT_HEADERS)) {
    const values = await readRange(`${tab}!A1:K1`);
    const current = values[0] ?? [];
    if (!current.length || current.every((value) => !value)) {
      await writeRange(`${tab}!A1:K1`, [expected]);
    } else if (expected.some((value, index) => current[index] !== value)) {
      throw new Error(`A aba ${tab} já existe com cabeçalhos diferentes. Nenhum dado foi sobrescrito.`);
    }
  }

  for (const [tab, schema] of Object.entries(BUSINESS_TABS)) {
    const values = await readRange(`${tab}!A1:Z1`);
    const current = values[0] ?? [];
    if (schema.headers.some((value, index) => current[index] !== value)) {
      throw new Error(`Os cabeçalhos da aba ${tab} não correspondem ao padrão atual. Nenhum lançamento foi alterado.`);
    }
    const idColumn = schema.headers.length;
    const companyColumn = idColumn + 1;
    const idHeader = current[idColumn] ?? "";
    const companyHeader = current[companyColumn] ?? "";
    if (idHeader && idHeader !== "GESTTA_ID") {
      throw new Error(`A coluna ${columnName(idColumn)} da aba ${tab} já contém outro cabeçalho. Não vou sobrescrever essa coluna.`);
    }
    if (companyHeader && companyHeader !== "Empresa ID") {
      throw new Error(`A coluna ${columnName(companyColumn)} da aba ${tab} já contém outro cabeçalho. Não vou sobrescrever essa coluna.`);
    }
    if (idHeader !== "GESTTA_ID" || companyHeader !== "Empresa ID") {
      await writeRange(`${tab}!${columnName(idColumn)}1:${columnName(companyColumn)}1`, [["GESTTA_ID", "Empresa ID"]]);
    }
  }
}

async function users(): Promise<CentralUser[]> {
  const rows = await readRange("Usuarios!A2:K");
  return rows.map((row) => ({
    id: row[0] ?? "",
    nome: row[1] ?? "",
    email: (row[2] ?? "").toLowerCase(),
    passwordHash: row[3] ?? "",
    passwordSalt: row[4] ?? "",
    papel: (row[5] ?? "") as Role,
    empresaId: row[6] ?? "",
    ativo: row[7] ?? "",
    permissoes: row[8] ?? "{}",
  })).filter((user) => user.id);
}

async function companies(): Promise<string[][]> {
  return readRange("Empresas!A2:K");
}

async function audit(actor: CentralUser, action: string, details: Record<string, unknown>, empresaId = actor.empresaId) {
  await append("Auditoria", [crypto.randomUUID(), actor.id, empresaId, action, JSON.stringify(details), new Date().toISOString()]);
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function sessionSecretKey() {
  const secret = process.env["GESTTA_SESSION_SECRET"];
  if (!secret || encoder.encode(secret).length < 32) {
    throw new Error("GESTTA_SESSION_SECRET deve ter pelo menos 32 caracteres aleatórios.");
  }
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function setSession(userId: string) {
  const payload = JSON.stringify({ sub: userId, exp: Date.now() + 8 * 60 * 60 * 1000 });
  const signature = await crypto.subtle.sign("HMAC", await sessionSecretKey(), encoder.encode(payload));
  const token = encodeBase64Url(encoder.encode(payload));
  const signed = encodeBase64Url(new Uint8Array(signature));
  setCookie(COOKIE, `${token}.${signed}`, {
    httpOnly: true,
    secure: process.env["NODE_ENV"] !== "development",
    sameSite: "lax",
    path: "/",
    maxAge: 8 * 60 * 60,
  });
}

export async function centralLogout() {
  deleteCookie(COOKIE, { path: "/" });
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function currentCentralUser(): Promise<CentralUser | null> {
  const cookie = getCookie(COOKIE);
  if (!cookie) return null;
  const [encoded, signature] = cookie.split(".");
  if (!encoded || !signature) return null;
  try {
    const payloadBytes = decodeBase64Url(encoded);
    const payload = new TextDecoder().decode(payloadBytes);
    const valid = await crypto.subtle.verify(
      "HMAC",
      await sessionSecretKey(),
      decodeBase64Url(signature),
      encoder.encode(payload),
    );
    if (!valid) return null;
    const session = JSON.parse(payload) as { sub: string; exp: number };
    if (!session.sub || session.exp < Date.now()) return null;
    const user = (await users()).find((item) => item.id === session.sub && item.ativo.toUpperCase() === "SIM");
    if (!user) return null;
    if (user.papel !== "general_admin") {
      const company = (await companies()).find((row) => row[0] === user.empresaId);
      if (!company || (company[6] ?? "").toUpperCase() !== "ATIVA") return null;
    }
    return user;
  } catch {
    return null;
  }
}

export async function centralLogin(email: string, password: string) {
  const user = (await users()).find((item) => item.email === email.trim().toLowerCase());
  if (!user || user.ativo.toUpperCase() !== "SIM" || !(await verifyPassword(password, user.passwordHash, user.passwordSalt))) {
    throw new Error("E-mail ou senha incorretos.");
  }
  if (user.papel !== "general_admin") {
    const company = (await companies()).find((row) => row[0] === user.empresaId);
    if (!company || (company[6] ?? "").toUpperCase() !== "ATIVA") {
      throw new Error("O acesso desta empresa está bloqueado. Entre em contato com o administrador do GESTTA.");
    }
  }
  await setSession(user.id);
  return { ok: true, role: user.papel };
}

export async function hasInitialSetup(): Promise<boolean> {
  return (await users()).length === 0;
}

/** First registration creates the global administrator and adopts legacy rows for the first company. */
export async function registerInitialAdministrator(input: {
  companyName: string;
  displayName: string;
  email: string;
  password: string;
}) {
  await ensureSharedSchema();
  if ((await users()).length > 0) throw new Error("A configuração inicial já foi concluída. Solicite a criação de acessos ao administrador geral.");
  const companyId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const now = new Date().toISOString();
  const email = input.email.trim().toLowerCase();
  const credentials = await hashPassword(input.password);

  await append("Empresas", [
    companyId, input.companyName.trim(), input.companyName.trim(), "", email, "", "ATIVA",
    config().spreadsheetId, now, now, "configuração inicial",
  ]);
  await append("Usuarios", [
    userId, input.displayName.trim(), email, credentials.passwordHash, credentials.passwordSalt,
    "general_admin", companyId, "SIM", "{}", now, "",
  ]);

  await migrateLegacyRows(companyId);
  await setSession(userId);
  return { ok: true };
}

/** Assigns only currently unassigned historical rows to the first company. */
async function migrateLegacyRows(companyId: string) {
  const ranges = Object.entries(BUSINESS_TABS).map(([tab, schema]) => `ranges=${encodeURIComponent(tab + "!A2:" + schema.rangeEnd)}`).join("&");
  const data = await request(`/values:batchGet?${ranges}`);
  const updates: { range: string; values: string[][] }[] = [];

  Object.entries(BUSINESS_TABS).forEach(([tab, schema], index) => {
    const rows = (data.valueRanges?.[index]?.values ?? []) as unknown[][];
    const idCol = schema.headers.length;
    const companyCol = idCol + 1;
    rows.forEach((rawRow, rowIndex) => {
      const row = rawRow.map((value) => String(value ?? ""));
      if (!row.slice(0, schema.headers.length).some((value) => value !== "")) return;
      const existingId = row[idCol] ?? "";
      const existingCompany = row[companyCol] ?? "";
      if (existingCompany && existingCompany !== companyId) return;
      if (existingId && existingCompany) return;
      const technicalId = existingId || crypto.randomUUID();
      const sheetRow = rowIndex + 2;
      updates.push({
        range: `${tab}!${columnName(idCol)}${sheetRow}:${columnName(companyCol)}${sheetRow}`,
        values: [[technicalId, companyId]],
      });
    });
  });

  if (updates.length) {
    await request("/values:batchUpdate", {
      method: "POST",
      body: JSON.stringify({ valueInputOption: "RAW", data: updates }),
    });
  }
}

export async function currentCompanyLabel(): Promise<string> {
  const user = await currentCentralUser();
  if (!user) return "";
  const row = (await companies()).find((company) => company[0] === user.empresaId);
  return row?.[2] || row?.[1] || "Minha empresa";
}

export async function requireCurrentCompanySheet(): Promise<{ spreadsheetId: string; companyId: string }> {
  const user = await currentCentralUser();
  if (!user || !user.empresaId) throw new Error("Sua sessão expirou. Entre novamente.");
  if (user.papel !== "general_admin") {
    const row = (await companies()).find((company) => company[0] === user.empresaId);
    if (!row || (row[6] ?? "").toUpperCase() !== "ATIVA") {
      throw new Error("A empresa está bloqueada ou não está disponível.");
    }
  }
  return { spreadsheetId: config().spreadsheetId, companyId: user.empresaId };
}

export async function requireGeneralAdmin(): Promise<CentralUser> {
  const user = await currentCentralUser();
  if (!user || user.papel !== "general_admin") throw new Error("Acesso restrito ao administrador geral.");
  return user;
}

export async function createCompanyAndAdmin(input: {
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  emailContato: string;
  telefone: string;
  nomeAdmin: string;
  emailAdmin: string;
  senhaAdmin: string;
}) {
  const actor = await requireGeneralAdmin();
  const allCompanies = await companies();
  const allUsers = await users();
  const normalizedCnpj = input.cnpj.replace(/\D/g, "");
  const normalizedEmail = input.emailAdmin.trim().toLowerCase();
  if (allCompanies.some((row) => normalizedCnpj && String(row[3] ?? "").replace(/\D/g, "") === normalizedCnpj)) {
    throw new Error("Já existe uma empresa cadastrada com esse CNPJ.");
  }
  if (allUsers.some((user) => user.email === normalizedEmail)) throw new Error("Já existe um usuário com esse e-mail.");

  const now = new Date().toISOString();
  const companyId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const credentials = await hashPassword(input.senhaAdmin);

  await append("Empresas", [
    companyId, input.razaoSocial.trim(), input.nomeFantasia.trim(), normalizedCnpj,
    input.emailContato.trim().toLowerCase(), input.telefone.trim(), "ATIVA",
    config().spreadsheetId, now, now, actor.email,
  ]);
  await append("Usuarios", [
    userId, input.nomeAdmin.trim(), normalizedEmail, credentials.passwordHash, credentials.passwordSalt,
    "company_admin", companyId, "SIM", "{}", now, "",
  ]);
  try {
    await audit(actor, "create_company_and_admin", { companyId, userId, razaoSocial: input.razaoSocial }, companyId);
  } catch (error) {
    console.error("Empresa criada, mas a auditoria falhou.", error);
  }
  return { ok: true, companyId, userId };
}

export async function setCompanyStatus(companyId: string, status: "ATIVA" | "BLOQUEADA") {
  const actor = await requireGeneralAdmin();
  const rows = await companies();
  const index = rows.findIndex((row) => row[0] === companyId);
  if (index < 0) throw new Error("Empresa não encontrada.");
  await writeRange(`Empresas!G${index + 2}`, [[status]]);
  await writeRange(`Empresas!J${index + 2}`, [[new Date().toISOString()]]);
  await audit(actor, status === "ATIVA" ? "reactivate_company" : "block_company", { companyId, status }, companyId);
  return { ok: true };
}

export async function listCompanies() {
  await requireGeneralAdmin();
  return (await companies()).map((row) => ({
    id: row[0] ?? "",
    razaoSocial: row[1] ?? "",
    nomeFantasia: row[2] ?? "",
    cnpj: row[3] ?? "",
    emailContato: row[4] ?? "",
    telefone: row[5] ?? "",
    status: row[6] ?? "ATIVA",
  }));
}
