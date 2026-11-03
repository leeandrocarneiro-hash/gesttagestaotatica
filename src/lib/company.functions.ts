import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { extractSpreadsheetId } from "./tenant.server";

export const linkCompanySpreadsheet = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ accessToken: z.string().min(20), spreadsheetUrl: z.string().url().max(1000) }).parse(d))
  .handler(async ({ data }) => {
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
    if (!url || !key || !serviceKey) throw new Error("Supabase não configurado no servidor.");
    const auth = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await auth.auth.getUser(data.accessToken);
    if (authError || !authData.user) throw new Error("Sessão inválida. Entre novamente.");
    const spreadsheetId = extractSpreadsheetId(data.spreadsheetUrl);
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: company, error: readError } = await admin.from("companies").select("id,spreadsheet_id").eq("owner_user_id", authData.user.id).single();
    if (readError || !company) throw new Error("Empresa não encontrada.");
    if (company.spreadsheet_id) throw new Error("Esta empresa já possui uma planilha vinculada. Solicite suporte para alterá-la.");
    const { error } = await admin.from("companies").update({ spreadsheet_id: spreadsheetId }).eq("id", company.id).is("spreadsheet_id", null);
    if (error) throw new Error("Não foi possível vincular a planilha. Verifique as permissões e tente novamente.");
    return { ok: true };
  });
