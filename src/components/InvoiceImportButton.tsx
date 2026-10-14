import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileUp, FileText, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { addRow } from "@/lib/sheets.functions";

type ImportedItem = { material: string; quantity: string; unit: string; unitCost: string };
type ParsedInvoice = { supplier: string; date: string; number: string; key: string; items: ImportedItem[] };

const local = (root: ParentNode, name: string) =>
  Array.from(root.querySelectorAll("*")).find((el) => el.localName === name)?.textContent?.trim() ?? "";
const money = (v: string) => Number(v.replace(/\./g, "").replace(",", ".")) || 0;
const isoDate = (v: string) => {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : new Date().toISOString().slice(0, 10);
};

function parseXml(xml: string): ParsedInvoice {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("O arquivo XML não é válido.");
  const inf = Array.from(doc.querySelectorAll("*")).find((el) => el.localName === "infNFe");
  if (!inf) throw new Error("Não encontrei os dados de uma NF-e neste XML.");
  const emit = Array.from(inf.querySelectorAll("*")).find((el) => el.localName === "emit");
  const ide = Array.from(inf.querySelectorAll("*")).find((el) => el.localName === "ide");
  const dets = Array.from(inf.querySelectorAll("*")).filter((el) => el.localName === "det");
  const items = dets.map((det) => {
    const prod = Array.from(det.children).find((el) => el.localName === "prod");
    if (!prod) return null;
    const desc = local(prod, "xProd");
    const qty = local(prod, "qCom");
    const unit = local(prod, "uCom");
    const unitCost = local(prod, "vUnCom");
    return desc ? { material: desc, quantity: qty, unit, unitCost: String(Number(unitCost) || 0) } : null;
  }).filter((x): x is ImportedItem => Boolean(x));
  const key = inf.getAttribute("Id")?.replace(/^NFe/, "") ?? "";
  return {
    supplier: emit ? local(emit, "xNome") : "",
    date: ide ? isoDate(local(ide, "dhEmi") || local(ide, "dEmi")) : new Date().toISOString().slice(0, 10),
    number: ide ? local(ide, "nNF") : "",
    key,
    items,
  };
}

declare global {
  interface Window { pdfjsLib?: any }
}
async function loadPdfJs(): Promise<any> {
  if (window.pdfjsLib) return window.pdfjsLib;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Não foi possível carregar o leitor de PDF. Tente importar o XML."));
    document.head.appendChild(script);
  });
  if (!window.pdfjsLib) throw new Error("Leitor de PDF indisponível.");
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  return window.pdfjsLib;
}
async function parsePdf(file: File): Promise<ParsedInvoice> {
  const pdfjs = await loadPdfJs();
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const text = await page.getTextContent();
    pages.push(text.items.map((item: { str?: string }) => item.str ?? "").join(" "));
  }
  const text = pages.join("\n");
  const supplier = text.match(/IDENTIFICAÇÃO DO EMITENTE\s*[:\-]?\s*(.{3,100}?)(?=\s+CNPJ|\s+CPF|\s+DANFE)/i)?.[1]?.trim() ?? "";
  const dateRaw = text.match(/DATA DE EMISSÃO\s+([0-3]\d\/[01]\d\/\d{4})/i)?.[1] ?? "";
  const date = dateRaw ? dateRaw.split("/").reverse().join("-") : new Date().toISOString().slice(0, 10);
  const number = text.match(/N[º°.]?\s*\d+\s*([\d.]+)/i)?.[1] ?? "";
  const key = text.match(/(?:CHAVE DE ACESSO|CHAVE DE ACESSO DA NF-E)\s*([\d\s]{44,60})/i)?.[1]?.replace(/\D/g, "").slice(0, 44) ?? "";
  // DANFE layouts vary widely; the extracted text is used only as a starting point.
  const items: ImportedItem[] = [];
  const linePattern = /\b(\d{1,6})\s+(.{3,90}?)\s+(UN|UND|PC|PÇ|KG|G|LT|L|MT|M|CX|FD)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/gi;
  for (const match of text.matchAll(linePattern)) {
    const description = match[2].trim();
    if (/^(CNPJ|DANFE|NCM|CFOP|CST|DADOS ADICIONAIS)/i.test(description)) continue;
    items.push({ material: description, unit: match[3], quantity: String(money(match[4])), unitCost: String(money(match[5])) });
  }
  return { supplier, date, number, key, items };
}

export function InvoiceImportButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const add = useServerFn(addRow);
  const [invoice, setInvoice] = useState<ParsedInvoice | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!invoice || !invoice.items.length) throw new Error("A nota não contém itens para importar.");
      for (const item of invoice.items) {
        await add({ data: { tab: "Materiais", values: [invoice.date, "", item.material, invoice.supplier, item.quantity, item.unitCost] } });
      }
    },
    onSuccess: async () => {
      setSaved(true);
      await qc.invalidateQueries({ queryKey: ["sheet"] });
      toast.success("Itens da nota importados para Materiais!");
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setSaving(false),
  });

  const pickFile = async (file?: File) => {
    if (!file) return;
    setBusy(true); setError(""); setInvoice(null); setSaved(false);
    try {
      const parsed = file.name.toLowerCase().endsWith(".xml")
        ? parseXml(await file.text())
        : file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
          ? await parsePdf(file)
          : (() => { throw new Error("Selecione um arquivo XML ou PDF."); })();
      if (!parsed.items.length) throw new Error("Não consegui identificar os produtos. Se for PDF digitalizado ou com layout diferente, importe o XML da NF-e para maior precisão.");
      setInvoice(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao ler o arquivo.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const updateItem = (index: number, field: keyof ImportedItem, value: string) => {
    setInvoice((prev) => prev ? ({ ...prev, items: prev.items.map((item, i) => i === index ? { ...item, [field]: value } : item) }) : prev);
  };

  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold"><FileUp className="h-5 w-5" /> Importar nota fiscal (XML/PDF)</h3>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Importe uma NF-e para preencher fornecedor, data, materiais, quantidades e custo unitário. Confira os dados antes de salvar.</p>
        </div>
        <input ref={inputRef} type="file" accept=".xml,application/xml,text/xml,.pdf,application/pdf" className="hidden" onChange={(e) => void pickFile(e.target.files?.[0])} />
        <Button type="button" disabled={busy || saving} onClick={() => inputRef.current?.click()}>
          {busy ? <Loader2 className="animate-spin" /> : <FileText />} {busy ? "Lendo arquivo..." : "Selecionar XML/PDF"}
        </Button>
      </div>
      {error && <p className="mt-3 flex items-start gap-2 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}
      {invoice && (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm">Fornecedor<input className="field mt-1" value={invoice.supplier} onChange={(e) => setInvoice({ ...invoice, supplier: e.target.value })} /></label>
            <label className="text-sm">Data da nota<input type="date" className="field mt-1" value={invoice.date} onChange={(e) => setInvoice({ ...invoice, date: e.target.value })} /></label>
            <label className="text-sm">Número da NF-e<input className="field mt-1" value={invoice.number} onChange={(e) => setInvoice({ ...invoice, number: e.target.value })} /></label>
          </div>
          {invoice.key && <p className="text-xs text-muted-foreground">Chave de acesso: {invoice.key}</p>}
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left"><tr>{["Material / produto", "Unidade", "Quantidade", "Custo unitário (R$)"].map((h) => <th key={h} className="whitespace-nowrap px-3 py-2">{h}</th>)}</tr></thead>
              <tbody>
                {invoice.items.map((item, i) => <tr key={i} className="border-t">
                  <td className="min-w-56 px-2 py-2"><input className="field" value={item.material} onChange={(e) => updateItem(i, "material", e.target.value)} /></td>
                  <td className="px-2 py-2"><input className="field w-20" value={item.unit} onChange={(e) => updateItem(i, "unit", e.target.value)} /></td>
                  <td className="px-2 py-2"><input className="field w-24" inputMode="decimal" value={item.quantity} onChange={(e) => updateItem(i, "quantity", e.target.value)} /></td>
                  <td className="px-2 py-2"><input className="field w-28" inputMode="decimal" value={item.unitCost} onChange={(e) => updateItem(i, "unitCost", e.target.value)} /></td>
                </tr>)}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{invoice.items.length} item(ns) detectado(s). A unidade é exibida para conferência; a planilha atual armazena quantidade e custo unitário.</p>
            <Button type="button" disabled={saving || saved || !invoice.items.length} onClick={() => { setSaving(true); saveMutation.mutate(); }}>
              {saving ? <Loader2 className="animate-spin" /> : saved ? <CheckCircle2 /> : <FileUp />} {saving ? "Salvando itens..." : saved ? "Importado" : "Confirmar e salvar materiais"}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
