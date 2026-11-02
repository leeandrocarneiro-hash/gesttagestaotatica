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
  const setupToken = process.env["GESTTA_CENTRAL_SETUP_TOKEN"];
  if (!apiKey || !connectionKey || !spreadsheetId || !setupToken) {
    throw new Error("Configure as variáveis de conexão Google Sheets, GESTTA_CENTRAL_SPREADSHEET_ID e GESTTA_CENTRAL_SETUP_TOKEN no servidor.");
  }
  return { apiKey, connectionKey, spreadsheetId, setupToken };
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
    const { spreadsheetId, setupToken } = getConfig();
    if (data.setupToken !== setupToken) {
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
