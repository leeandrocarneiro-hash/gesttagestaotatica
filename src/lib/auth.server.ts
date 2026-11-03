import { centralLogin, centralLogout, currentCentralUser, currentCompanyLabel, requireCurrentCompanySheet } from "./central-auth.server";

export type Session = { empresa: string; login: string; papel: "company_admin"; spreadsheetId: string | null };

export async function login(loginName: string, senha: string) {
  const result = await centralLogin(loginName, senha);
  return { ok: true, needsSheet: result.needsSheet };
}
export async function logout() { await centralLogout(); }
export async function currentSession(): Promise<Session | null> {
  const company = await currentCentralUser();
  if (!company) return null;
  let spreadsheetId: string | null = null;
  try { spreadsheetId = await requireCurrentCompanySheet(); } catch { /* Cadastro pode estar sem planilha vinculada. */ }
  return { empresa: await currentCompanyLabel(), login: company.email, papel: "company_admin", spreadsheetId };
}
export async function requireCompanySheet() { return requireCurrentCompanySheet(); }
