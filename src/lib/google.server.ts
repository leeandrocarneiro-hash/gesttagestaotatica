// Server-only helpers for Google Sheets / Drive through the connector gateway.
const SHEETS = "https://connector-gateway.lovable.dev/google_sheets/v4";
const DRIVE = "https://connector-gateway.lovable.dev/google_drive/drive/v3";

export const MASTER_SPREADSHEET_ID = "1QZ-6_wvPHEmLqJ8tXCCzr-uueYGjFepvWauuq0NWx08";

function hdrs(keyName: "GOOGLE_SHEETS_API_KEY" | "GOOGLE_DRIVE_API_KEY") {
  const a = process.env["LOVABLE_API_KEY"];
  const b = process.env[keyName];
  if (!a || !b) throw new Error("Conexão com o Google não configurada");
  return { Authorization: `Bearer ${a}`, "X-Connection-Api-Key": b, "Content-Type": "application/json" };
}

async function req(url: string, key: "GOOGLE_SHEETS_API_KEY" | "GOOGLE_DRIVE_API_KEY", init?: RequestInit) {
  const r = await fetch(url, { ...init, headers: hdrs(key) });
  if (!r.ok) {
    const t = await r.text();
    console.error(`Google ${r.status}: ${t}`);
    throw new Error(`Erro na planilha [${r.status}]`);
  }
  return r.json();
}

export const sheets = (path: string, init?: RequestInit) => req(`${SHEETS}${path}`, "GOOGLE_SHEETS_API_KEY", init);
export const drive = (path: string, init?: RequestInit) => req(`${DRIVE}${path}`, "GOOGLE_DRIVE_API_KEY", init);

const HEADERS: Record<string, string[]> = {
  Servicos: ["ID", "Data agendada", "Cliente", "Telefone", "Descrição do serviço", "Status", "Preço cobrado", "Observações"],
  Atendimentos: ["Data", "Cliente", "Contato", "Canal", "Assunto", "Observações"],
  Materiais: ["Data", "ID Serviço", "Material", "Fornecedor", "Quantidade", "Custo unitário", "Total"],
  Recebimentos: ["Data", "ID Serviço", "Cliente", "Valor", "Forma de pagamento"],
  Despesas: ["Data", "ID Serviço", "Categoria", "Descrição", "Valor"],
};
const STATUS = ["Agendado", "Em execução", "Concluído", "Cancelado"];
const CATS = ["Combustível", "Mão de obra", "Ferramentas", "Administrativo", "Outros"];

/** Creates a company spreadsheet (tabs, formulas, charts) and shares it with the company e-mail. */
export async function createCompanySpreadsheet(companyName: string, email: string): Promise<string> {
  const file = await drive(`/files?fields=id`, {
    method: "POST",
    body: JSON.stringify({ name: `Gestão de Serviços — ${companyName}`, mimeType: "application/vnd.google-apps.spreadsheet" }),
  });
  const id: string = file.id;
  const tabs = [...Object.keys(HEADERS), "Resumo"];
  const R = 6; // Resumo sheetId
  const src = (r0: number, r1: number, c: number) => ({ sourceRange: { sources: [{ sheetId: R, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c, endColumnIndex: c + 1 }] } });
  await sheets(`/spreadsheets/${id}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      requests: [
        ...tabs.map((t, i) => ({ addSheet: { properties: { sheetId: i + 1, title: t, gridProperties: { frozenRowCount: 1 } } } })),
        { deleteSheet: { sheetId: 0 } },
        ...tabs.map((_, i) => ({ repeatCell: { range: { sheetId: i + 1, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: "userEnteredFormat.textFormat.bold" } })),
        {
          addChart: { chart: { spec: { title: "Preço x Custo x Lucro por serviço", basicChart: { chartType: "COLUMN", legendPosition: "BOTTOM_LEGEND", headerCount: 1,
            domains: [{ domain: src(0, 200, 0) }],
            series: [{ series: src(0, 200, 2), targetAxis: "LEFT_AXIS" }, { series: src(0, 200, 5), targetAxis: "LEFT_AXIS" }, { series: src(0, 200, 6), targetAxis: "LEFT_AXIS" }] } },
            position: { overlayPosition: { anchorCell: { sheetId: R, rowIndex: 15, columnIndex: 0 }, widthPixels: 720, heightPixels: 360 } } } },
        },
        { addChart: { chart: { spec: { title: "Serviços por status", pieChart: { legendPosition: "RIGHT_LEGEND", domain: src(1, 5, 10), series: src(1, 5, 11) } },
          position: { overlayPosition: { anchorCell: { sheetId: R, rowIndex: 15, columnIndex: 9 }, widthPixels: 420, heightPixels: 300 } } } } },
        { addChart: { chart: { spec: { title: "Despesas por categoria", pieChart: { legendPosition: "RIGHT_LEGEND", pieHole: 0.4, domain: src(8, 13, 10), series: src(8, 13, 11) } },
          position: { overlayPosition: { anchorCell: { sheetId: R, rowIndex: 34, columnIndex: 9 }, widthPixels: 420, heightPixels: 300 } } } } },
      ],
    }),
  });
  const resumo: string[][] = [
    ["ID", "Cliente", "Preço cobrado", "Materiais", "Despesas", "Custo total", "Lucro", "Margem", "Recebido", "", "Status", "Qtd"],
    [
      '=IFERROR(FILTER(Servicos!A2:A,Servicos!A2:A<>""),"")',
      '=ARRAYFORMULA(IF(A2:A="","",IFERROR(VLOOKUP(A2:A,Servicos!A2:C,3,FALSE),"")))',
      '=ARRAYFORMULA(IF(A2:A="","",IFERROR(VLOOKUP(A2:A,{Servicos!A2:A,Servicos!G2:G},2,FALSE),0)))',
      '=ARRAYFORMULA(IF(A2:A="","",SUMIF(Materiais!B2:B,A2:A,Materiais!G2:G)))',
      '=ARRAYFORMULA(IF(A2:A="","",SUMIF(Despesas!B2:B,A2:A,Despesas!E2:E)))',
      '=ARRAYFORMULA(IF(A2:A="","",D2:D+E2:E))',
      '=ARRAYFORMULA(IF(A2:A="","",C2:C-F2:F))',
      '=ARRAYFORMULA(IF(A2:A="","",IFERROR(G2:G/C2:C,0)))',
      '=ARRAYFORMULA(IF(A2:A="","",SUMIF(Recebimentos!B2:B,A2:A,Recebimentos!D2:D)))',
      "", STATUS[0], `=COUNTIF(Servicos!F2:F,K2)`,
    ],
  ];
  const side = [
    ...STATUS.slice(1).map((s, i) => ({ range: `Resumo!K${i + 3}:L${i + 3}`, values: [[s, `=COUNTIF(Servicos!F2:F,K${i + 3})`]] })),
    { range: "Resumo!K8:L8", values: [["Categoria de despesa", "Total"]] },
    ...CATS.map((c, i) => ({ range: `Resumo!K${i + 9}:L${i + 9}`, values: [[c, `=SUMIF(Despesas!C2:C,K${i + 9},Despesas!E2:E)`]] })),
  ];
  await sheets(`/spreadsheets/${id}/values:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      valueInputOption: "USER_ENTERED",
      data: [
        ...Object.entries(HEADERS).map(([t, h]) => ({ range: `${t}!A1`, values: [h] })),
        { range: "Resumo!A1", values: resumo },
        ...side,
      ],
    }),
  });
  try {
    await drive(`/files/${id}/permissions?sendNotificationEmail=true`, {
      method: "POST",
      body: JSON.stringify({ type: "user", role: "writer", emailAddress: email }),
    });
  } catch (e) {
    console.error("Compartilhamento falhou", e);
  }
  return id;
}
