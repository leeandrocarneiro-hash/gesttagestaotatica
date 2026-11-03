import { createClient } from "@supabase/supabase-js";

export async function getTenantSpreadsheetId(accessToken: string): Promise<string> {
  if (!accessToken || accessToken.split(".").length !== 3) throw new Error("Faça login para continuar.");
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key || !serviceKey) throw new Error("Supabase não configurado no servidor.");
  const auth = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: authError } = await auth.auth.getUser(accessToken);
  if (authError || !userData.user) throw new Error("Sessão inválida. Entre novamente.");
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: company, error } = await admin.from("companies").select("spreadsheet_id").eq("owner_user_id", userData.user.id).single();
  if (error || !company) throw new Error("Cadastro da empresa não encontrado.");
  if (!company.spreadsheet_id) throw new Error("Vincule a planilha Google da sua empresa para começar.");
  return company.spreadsheet_id;
}

export function extractSpreadsheetId(input: string): string {
  const value = input.trim();
  const match = value.match(/docs\\.google\\.com\\/spreadsheets\\/d\\/([a-zA-Z0-9_-]+)/);
  if (!match) throw new Error("Informe o link de uma planilha válida do Google Sheets.");
  return match[1];
}
