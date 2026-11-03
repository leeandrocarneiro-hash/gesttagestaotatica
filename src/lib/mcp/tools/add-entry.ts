import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { TAB_NAMES, TABS, type TabName } from "../../sheets-config";
import { appendRow } from "../../sheets.server";

export default defineTool({
  name: "add_entry",
  title: "Novo lançamento",
  description:
    "Adiciona um lançamento a uma aba. `values` segue a ordem dos campos: Servicos [Data agendada, Cliente, Telefone, Descrição, Status, Preço, Observações]; Atendimentos [Data, Cliente, Contato, Canal, Assunto, Observações]; Materiais [Data, ID do serviço, Material, Fornecedor, Quantidade, Custo unitário]; Recebimentos [Data, ID do serviço, Cliente, Valor, Forma de pagamento]; Despesas [Data, ID do serviço, Categoria, Descrição, Valor]. Datas em AAAA-MM-DD, números com ponto.",
  inputSchema: {
    tab: z.enum(TAB_NAMES as [TabName, ...TabName[]]).describe("Aba de destino."),
    values: z.array(z.string().max(2000)).max(10).describe("Valores na ordem dos campos da aba."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ tab, values }) => {
    const fields = TABS[tab].fields;
    if (values.length !== fields.length) throw new ToolError(`A aba ${tab} espera ${fields.length} valores.`);
    const missing = fields.filter((f, i) => "required" in f && f.required && !values[i]?.trim()).map((f) => f.label);
    if (missing.length) throw new ToolError(`Campos obrigatórios vazios: ${missing.join(", ")}`);
    const r = await appendRow(tab, values);
    return { content: [{ type: "text", text: r.id ? `Serviço ${r.id} lançado.` : "Lançado na planilha." }] };
  },
});
