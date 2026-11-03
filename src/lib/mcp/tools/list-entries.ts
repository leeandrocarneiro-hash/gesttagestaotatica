import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { TAB_NAMES, TABS, type TabName } from "../../sheets-config";
import { readAll } from "../../sheets.server";

export default defineTool({
  name: "list_entries",
  title: "Listar lançamentos",
  description: "Lista os lançamentos de uma aba da planilha (Servicos, Atendimentos, Materiais, Recebimentos ou Despesas).",
  inputSchema: {
    tab: z.enum(TAB_NAMES as [TabName, ...TabName[]]).describe("Aba a listar."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ tab }) => {
    const rows = (await readAll())[tab];
    const labels = TABS[tab].fields.map((f) => f.label);
    const cols = tab === "Servicos" ? ["ID", ...labels] : tab === "Materiais" ? [...labels, "Total"] : labels;
    const text = rows.length ? [cols.join(" | "), ...rows.map((r) => r.join(" | "))].join("\n") : "Nenhum lançamento.";
    return { content: [{ type: "text", text }], structuredContent: { columns: cols, rows } };
  },
});
