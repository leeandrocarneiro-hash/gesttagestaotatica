import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";

const ACCESS_COOKIE = "gestta_sb_access";
const REFRESH_COOKIE = "gestta_sb_refresh";
const GATEWAY = "https://connector-gateway.lovable.dev/google_sheets/v4";

function supabaseConfig() {
  const url = process.env["SUPABASE_URL"] || process.env["VITE_SUPABASE_URL"];
  const anon = process.env["SUPABASE_ANON_KEY"] || process.env["VITE_SUPABASE_ANON_KEY"];
  if (!url || !anon) throw new Error("Configure SUPABASE_URL e SUPABASE_ANON_KEY no ambiente do servidor.");
  return { url: url.replace(/\/$/, ""), anon };
}

async function supabase(path: string, token?: string, init?: RequestInit) {
  const { url, anon } = supabaseConfig();
  const response = await fetch(url + path, {
    ...init,
    headers: {
      apikey: anon,
      Authorization: `Bearer ${token || anon}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body.msg || body.message || body.error_description || body.error || "Falha na autenticação.";
    throw new Error(String(message));
  }
  return body;
}

function setAuthCookies(access: string, refresh: string, expiresIn = 3600) {
  const options = { httpOnly: true, secure: process.env["NODE_ENV"] === "production", sameSite: "lax" as const, path: "/", maxAge: Math.max(60, Math.min(expiresIn, 60 * 60 * 24 * 7)) };
  setCookie(ACCESS_COOKIE, access, options);
  setCookie(REFRESH_COOKIE, refresh, { ...options, maxAge: 60 * 60 * 24 * 30 });
}

export async function logout() {
  const token = getCookie(ACCESS_COOKIE);
  if (token) {
    try { await supabase("/auth/v1/logout", token, { method: "POST" }); } catch { /* clear local session regardless */ }
  }
  deleteCookie(ACCESS_COOKIE, { path: "/" });
  deleteCookie(REFRESH_COOKIE, { path: "/" });
}

async function currentUser() {
  const token = getCookie(ACCESS_COOKIE);
  if (!token) return null;
  try {
    return await supabase("/auth/v1/user", token) as { id: string; email?: string };
  } catch {
    const refresh = getCookie(REFRESH_COOKIE);
    if (!refresh) return null;
    try {
      const renewed = await supabase("/auth/v1/token?grant_type=refresh_token", undefined, { method: "POST", body: JSON.stringify({ refresh_token: refresh }) });
      if (!renewed.access_token || !renewed.refresh_token) return null;
      setAuthCookies(renewed.access_token, renewed.refresh_token, renewed.expires_in);
      return renewed.user as { id: string; email?: string };
    } catch { return null; }
  }
}

async function companyForUser(userId: string, token: string) {
  const rows = await supabase(`/rest/v1/profiles?user_id=eq.${encodeURIComponent(userId)}&select=company_id,role,display_name`, token) as Array<{ company_id: string; role: string; display_name: string | null }>;
  const profile = rows[0];
  if (!profile) throw new Error("Perfil da empresa não encontrado. Entre em contato com o suporte.");
  const companies = await supabase(`/rest/v1/companies?id=eq.${encodeURIComponent(profile.company_id)}&select=id,name,spreadsheet_id,status`, token) as Array<{ id: string; name: string; spreadsheet_id: string | null; status: string }>;
  const company = companies[0];
  if (!company || company.status !== "active") throw new Error("A empresa está suspensa ou indisponível.");
  return { profile, company };
}

export type Session = { empresa: string; login: string; papel: "company_admin" | "employee"; spreadsheetId: string | null };

export async function login(loginName: string, senha: string) {
  const email = loginName.trim().toLowerCase();
  const result = await supabase("/auth/v1/token?grant_type=password", undefined, {
    method: "POST", body: JSON.stringify({ email, password: senha }),
  });
  if (!result.access_token || !result.refresh_token) throw new Error("Não foi possível iniciar a sessão.");
  setAuthCookies(result.access_token, result.refresh_token, result.expires_in);
  const { company } = await companyForUser(result.user.id, result.access_token);
  return { ok: true, needsSheet: !company.spreadsheet_id };
}

export async function registerCompany(input: { companyName: string; email: string; password: string; displayName: string }) {
  const result = await supabase("/auth/v1/signup", undefined, {
    method: "POST",
    body: JSON.stringify({
      email: input.email.trim().toLowerCase(),
      password: input.password,
      data: { company_name: input.companyName.trim(), display_name: input.displayName.trim() },
    }),
  });
  if (result.access_token && result.refresh_token) {
    setAuthCookies(result.access_token, result.refresh_token, result.expires_in);
    return { ok: true, needsEmailConfirmation: false };
  }
  return { ok: true, needsEmailConfirmation: true };
}

export async function currentSession(): Promise<Session | null> {
  const token = getCookie(ACCESS_COOKIE);
  const user = await currentUser();
  if (!token || !user) return null;
  const activeToken = getCookie(ACCESS_COOKIE);
  if (!activeToken) return null;
  const { profile, company } = await companyForUser(user.id, activeToken);
  return {
    empresa: company.name,
    login: user.email || "",
    papel: profile.role === "general_admin" ? "company_admin" : profile.role as "company_admin" | "employee",
    spreadsheetId: company.spreadsheet_id,
  };
}

export async function requireCompanySheet(): Promise<string> {
  const token = getCookie(ACCESS_COOKIE);
  const user = await currentUser();
  const activeToken = getCookie(ACCESS_COOKIE);
  if (!token || !user || !activeToken) throw new Error("Faça login para acessar os dados.");
  const { company } = await companyForUser(user.id, activeToken);
  if (!company.spreadsheet_id) throw new Error("Vincule a planilha da empresa para continuar.");
  return company.spreadsheet_id;
}

export async function saveCompanySheet(link: string) {
  const token = getCookie(ACCESS_COOKIE);
  const user = await currentUser();
  const activeToken = getCookie(ACCESS_COOKIE);
  if (!token || !user || !activeToken) throw new Error("Faça login novamente.");
  const { profile, company } = await companyForUser(user.id, activeToken);
  if (profile.role !== "company_admin") throw new Error("Somente o administrador da empresa pode vincular a planilha.");
  const match = link.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/) || link.trim().match(/^([a-zA-Z0-9_-]{30,})$/);
  const spreadsheetId = match?.[1];
  if (!spreadsheetId) throw new Error("Link inválido. Cole o endereço completo de uma planilha Google.");
  const gatewayToken = process.env["LOVABLE_API_KEY"];
  const connectionKey = process.env["GOOGLE_SHEETS_API_KEY"];
  if (!gatewayToken || !connectionKey) throw new Error("A integração Google Sheets ainda não está configurada no servidor.");
  const check = await fetch(`${GATEWAY}/spreadsheets/${spreadsheetId}?fields=spreadsheetId,sheets.properties.title`, {
    headers: { Authorization: `Bearer ${gatewayToken}`, "X-Connection-Api-Key": connectionKey },
  });
  if (!check.ok) throw new Error("Não consegui acessar essa planilha. Compartilhe-a com a conta Google conectada ao GESTTA com permissão de Editor.");
  const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY precisa ser configurada no servidor para concluir o vínculo seguro.");
  const { url } = supabaseConfig();
  const update = await fetch(`${url}/rest/v1/companies?id=eq.${encodeURIComponent(company.id)}&owner_user_id=eq.${encodeURIComponent(user.id)}`, {
    method: "PATCH",
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ spreadsheet_id: spreadsheetId, updated_at: new Date().toISOString() }),
  });
  if (!update.ok) throw new Error("A planilha foi validada, mas não foi possível salvar o vínculo. Confira a configuração do Supabase.");
  return { ok: true };
}
