export const SPREADSHEET_ID = "1inU8c_VuiHPTUePSvbEGGrQpDVlG3pYwG6j4gMJcsPk";
export const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`;
export const SHEET_XLSX_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=xlsx`;

export type FieldType = "text" | "date" | "number" | "select" | "servico" | "textarea";
export type Field = { label: string; type: FieldType; options?: string[]; required?: boolean };

export const STATUS = ["Agendado", "Em execução", "Concluído", "Cancelado"];
export const CATEGORIAS = ["Combustível", "Mão de obra", "Ferramentas", "Administrativo", "Outros"];

export const TABS = {
  Servicos: {
    title: "Serviços",
    hint: "Agende e acompanhe a elaboração de cada serviço.",
    fields: [
      { label: "Data agendada", type: "date", required: true },
      { label: "Cliente", type: "text", required: true },
      { label: "Telefone", type: "text" },
      { label: "Descrição do serviço", type: "textarea", required: true },
      { label: "Status", type: "select", options: STATUS, required: true },
      { label: "Preço cobrado", type: "number", required: true },
      { label: "Observações", type: "text" },
    ],
  },
  Atendimentos: {
    title: "Atendimentos",
    hint: "Registre cada contato com cliente.",
    fields: [
      { label: "Data", type: "date", required: true },
      { label: "Cliente", type: "text", required: true },
      { label: "Contato", type: "text" },
      { label: "Canal", type: "select", options: ["WhatsApp", "Telefone", "Presencial", "E-mail", "Outro"] },
      { label: "Assunto", type: "text", required: true },
      { label: "Observações", type: "textarea" },
    ],
  },
  Materiais: {
    title: "Materiais",
    hint: "Compras de material, ligadas ao serviço onde foram usadas.",
    fields: [
      { label: "Data", type: "date", required: true },
      { label: "Serviço", type: "servico" },
      { label: "Material", type: "text", required: true },
      { label: "Fornecedor", type: "text" },
      { label: "Quantidade", type: "number", required: true },
      { label: "Custo unitário", type: "number", required: true },
    ],
  },
  Recebimentos: {
    title: "Recebimentos",
    hint: "Valores recebidos dos clientes.",
    fields: [
      { label: "Data", type: "date", required: true },
      { label: "Serviço", type: "servico", required: true },
      { label: "Cliente", type: "text" },
      { label: "Valor", type: "number", required: true },
      { label: "Forma de pagamento", type: "select", options: ["Pix", "Dinheiro", "Cartão", "Boleto", "Transferência"] },
    ],
  },
  Despesas: {
    title: "Despesas",
    hint: "Pagamentos e despesas. Ligue a um serviço para entrar no custo dele.",
    fields: [
      { label: "Data", type: "date", required: true },
      { label: "Serviço", type: "servico" },
      { label: "Categoria", type: "select", options: CATEGORIAS, required: true },
      { label: "Descrição", type: "text", required: true },
      { label: "Valor", type: "number", required: true },
    ],
  },
} satisfies Record<string, { title: string; hint: string; fields: Field[] }>;

export type TabName = keyof typeof TABS;
export const TAB_NAMES = Object.keys(TABS) as TabName[];
export type SheetData = Record<TabName, string[][]>;
