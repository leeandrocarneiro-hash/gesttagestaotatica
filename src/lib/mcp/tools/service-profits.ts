import { defineTool } from "@lovable.dev/mcp-js";
import { readAll, serviceProfits } from "../../sheets.server";

export default defineTool({
  name: "get_service_profits",
  title: "Lucro por serviço",
  description: "Lista cada serviço com preço, custos (materiais + despesas), lucro, valor recebido e status.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async () => {
    const services = serviceProfits(await readAll());
    const text = services.length
      ? services.map((s) => `${s.id} | ${s.cliente} | ${s.status} | preço ${s.preco} | custo ${s.custo} | lucro ${s.lucro} | recebido ${s.recebido}`).join("\n")
      : "Nenhum serviço cadastrado.";
    return { content: [{ type: "text", text }], structuredContent: { services } };
  },
});
