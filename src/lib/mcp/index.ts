import { defineMcp } from "@lovable.dev/mcp-js";
import serviceProfits from "./tools/service-profits";
import listEntries from "./tools/list-entries";
import addEntry from "./tools/add-entry";
import updateStatus from "./tools/update-status";

export default defineMcp({
  name: "service-profit-hub",
  title: "Service Profit Hub",
  version: "0.1.0",
  instructions:
    "Gestão de serviços ligada a uma planilha Google: consulte lucro por serviço, liste lançamentos por aba, faça novos lançamentos e atualize status de serviços.",
  tools: [serviceProfits, listEntries, addEntry, updateStatus],
});
