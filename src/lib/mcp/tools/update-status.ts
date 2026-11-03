import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { STATUS } from "../../sheets-config";
import { setServiceStatus } from "../../sheets.server";

export default defineTool({
  name: "update_service_status",
  title: "Atualizar status do serviço",
  description: "Muda o status de um serviço pelo ID (ex.: S-001).",
  inputSchema: {
    id: z.string().max(20).describe("ID do serviço, ex.: S-001."),
    status: z.enum(STATUS as [string, ...string[]]).describe("Novo status."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ id, status }) => {
    await setServiceStatus(id, status);
    return { content: [{ type: "text", text: `${id} agora está "${status}".` }] };
  },
});
