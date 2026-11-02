import { centralLogin, centralLogout, currentCentralUser, currentCompanyLabel, requireCurrentCompanySheet, saveCurrentCompanySheet } from "./central-auth.server";

export type Session = { empresa: string; login: string; papel: "company_admin" | "employee"; spreadsheetId: string | null };

export async function login(loginName: string, senha: string) {
  const result = await centralLogin(loginName, senha, undefined, true);
  if (result.role === "general_admin") throw new Error("Use o acesso do administrador geral.");
  return { ok: true, needsSheet: result.needsSheet };
}

export async function logout() {
  await centralLogout();
}

export async function currentSession(): Promise<Session | null> {
  const user = await currentCentralUser();
  if (!user || user.papel === "general_admin") return null;
  let spreadsheetId: string | null = null;
  try {
    spreadsheetId = await requireCurrentCompanySheet();
  } catch {
    // A conta pode entrar antes de vincular sua planilha.
  }
  return { empresa: await currentCompanyLabel(), login: user.email, papel: user.papel as "company_admin" | "employee", spreadsheetId };
}

export async function requireCompanySheet(): Promise<string> {
  return requireCurrentCompanySheet();
}

export async function saveCompanySheet(link: string) {
  return saveCurrentCompanySheet(link);
}
