import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GATEWAY = "https://connector-gateway.lovable.dev/google_sheets/v4";

const HEADERS = {
  Empresas: ["id", "razao_social", "nome_fantasia", "cnpj", "email_contato", "telefone", "status", "spreadsheet_id", "criado_em", "aprovado_em", "aprovado_por"],
  Solicitacoes: ["id", "empresa_id", "solicitante_nome", "email", "telefone", "status", "criado_em", "analisado_em", "analisado_por"],
  Usuarios: ["id", "nome", "email", "password_hash", "password_salt", "papel", "empresa_id", "ativo", "permissoes_json", "criado_em", "ultimo_acesso"],
  Auditoria: ["id", "usuario_id", "empresa_id", "acao", "detalhes_json", "criado_em"],
} as const;

function getConfig() {
  const apiKey = process.env["LOVABLE_API_KEY"];
  const connectionKey = process.env["GOOGLE_SHEETS_API_KEY"];
  const spreadsheetId = process.env["GESTTA_CENTRAL_SPREADSHEET_ID"];
  if (!apiKey || !connectionKey || !spreadsheetId) {
    throw new Error("Configure a conexão Google Sheets e GESTTA_CENTRAL_SPREADSHEET_ID no servidor.");
  }
  return { apiKey, connectionKey, spreadsheetId };
}
function requireSetupToken() {
  const setupToken = process.env["GESTTA_CENTRAL_SETUP_TOKEN"];
  if (!setupToken) throw new Error("Token temporário de configuração não está definido no servidor.");
  return setupToken;
}

async function sheetsRequest(url: string, init?: RequestInit) {
  const { apiKey, connectionKey } = getConfig();
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "X-Connection-Api-Key": connectionKey,
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    const detail = await response.text();
    console.error("Falha ao configurar planilha central:", response.status, detail);
    throw new Error(`Não foi possível configurar a planilha central (HTTP ${response.status}). Confira o acesso e os nomes das abas.`);
  }
  return response.json();
}

export const initializeCentralSpreadsheet = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ setupToken: z.string().min(1).max(300) }).parse(input))
  .handler(async ({ data }) => {
    const { spreadsheetId } = getConfig();
    if (data.setupToken !== requireSetupToken()) {
      throw new Error("Código de configuração inválido.");
    }

    const base = `${GATEWAY}/spreadsheets/${spreadsheetId}`;
    const ranges = Object.keys(HEADERS).map((tab) => `ranges=${encodeURIComponent(tab + "!A1:Z1")}`).join("&");
    const current = await sheetsRequest(`${base}/values:batchGet?${ranges}`);
    const tabs = Object.keys(HEADERS) as Array<keyof typeof HEADERS>;

    const results: Array<{ tab: string; status: "created" | "already_configured" }> = [];
    for (let index = 0; index < tabs.length; index += 1) {
      const tab = tabs[index];
      const expected = [...HEADERS[tab]];
      const existing = (current.valueRanges?.[index]?.values?.[0] ?? []) as unknown[];
      const normalized = existing.map((value) => String(value ?? "").trim());
      const isEmpty = normalized.every((value) => value === "");
      const matches = expected.length === normalized.length && expected.every((value, i) => value === normalized[i]);

      if (matches) {
        results.push({ tab, status: "already_configured" });
        continue;
      }
      if (!isEmpty) {
        throw new Error(`A aba "${tab}" já contém cabeçalhos ou dados diferentes. Nenhuma informação foi sobrescrita; confira essa aba manualmente.`);
      }

      await sheetsRequest(`${base}/values/${encodeURIComponent(tab + "!A1")}?valueInputOption=RAW`, {
        method: "PUT",
        body: JSON.stringify({ values: [expected] }),
      });
      results.push({ tab, status: "created" });
    }

    return { ok: true, results };
  });

import { hashPassword } from "./password.server";

export const bootstrapGeneralAdmin = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({
    setupToken: z.string().min(1).max(300),
    nome: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(200),
    senha: z.string().min(12).max(200),
  }).parse(input))
  .handler(async ({ data }) => {
    const config = getConfig();
    const setupToken = requireSetupToken();
    const expectedEmail = process.env["GESTTA_BOOTSTRAP_ADMIN_EMAIL"]?.trim().toLowerCase();
    if (!expectedEmail || data.email.toLowerCase() !== expectedEmail || data.setupToken !== setupToken) {
      throw new Error("Não foi possível autorizar a configuração do administrador.");
    }

    const base = `${GATEWAY}/spreadsheets/${config.spreadsheetId}`;
    const existing = await sheetsRequest(`${base}/values/Usuarios!A2:K`);
    const users = (existing.values ?? []) as unknown[][];
    if (users.some((row) => String(row[5] ?? "") === "general_admin")) {
      throw new Error("O administrador geral já foi configurado. O cadastro inicial está bloqueado.");
    }

    const credentials = await hashPassword(data.senha);
    const now = new Date().toISOString();
    const userId = crypto.randomUUID();
    const row = [
      userId, data.nome, data.email.toLowerCase(), credentials.passwordHash,
      credentials.passwordSalt, "general_admin", "", "SIM", "{}", now, "",
    ];
    await sheetsRequest(`${base}/values/Usuarios!A1:K1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
      method: "POST",
      body: JSON.stringify({ values: [row] }),
    });
    await sheetsRequest(`${base}/values/Auditoria!A1:F1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
      method: "POST",
      body: JSON.stringify({ values: [[crypto.randomUUID(), userId, "", "bootstrap_general_admin", JSON.stringify({ email: data.email.toLowerCase() }), now]] }),
    });
    return { ok: true };
  });
