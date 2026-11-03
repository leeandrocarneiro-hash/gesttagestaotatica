const required = ["LOVABLE_API_KEY", "GOOGLE_SHEETS_API_KEY", "GESTTA_LEGACY_CENTRAL_SPREADSHEET_ID", "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_D1_DATABASE_ID", "CLOUDFLARE_API_TOKEN"];
for (const key of required) if (!process.env[key]) throw new Error(`Missing environment variable: ${key}`);

const gateway = "https://connector-gateway.lovable.dev/google_sheets/v4";
const centralId = process.env.GESTTA_LEGACY_CENTRAL_SPREADSHEET_ID;
const googleHeaders = { Authorization: `Bearer ${process.env.LOVABLE_API_KEY}`, "X-Connection-Api-Key": process.env.GOOGLE_SHEETS_API_KEY };
const d1Url = `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/d1/database/${process.env.CLOUDFLARE_D1_DATABASE_ID}/query`;
async function read(range) {
  const response = await fetch(`${gateway}/spreadsheets/${centralId}/values/${encodeURIComponent(range)}`, { headers: googleHeaders });
  if (!response.ok) throw new Error(`Could not read legacy range ${range}: HTTP ${response.status}`);
  const body = await response.json();
  return body.values ?? [];
}
async function run(sql, params = []) {
  const response = await fetch(d1Url, { method: "POST", headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ sql, params }) });
  const body = await response.json();
  if (!response.ok || !body.success || body.result?.[0]?.success === false) throw new Error(`D1 migration failed: ${JSON.stringify(body.errors ?? body.result?.[0]?.error)}`);
  return body.result?.[0]?.results ?? [];
}
const companies = await read("Empresas!A2:K");
const users = await read("Usuarios!A2:K");
const audit = await read("Auditoria!A2:F");
console.log(`Found ${companies.length} companies, ${users.length} users and ${audit.length} audit rows. Importing without deleting the source spreadsheet...`);
for (const r of companies) {
  if (!r[0]) continue;
  await run("INSERT OR IGNORE INTO companies (id,razao_social,nome_fantasia,cnpj,email_contato,telefone,status,spreadsheet_id,created_at,updated_at,origem) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    [String(r[0]),String(r[1]??""),String(r[2]??r[1]??""),String(r[3]??""),String(r[4]??""),String(r[5]??""),String(r[6]??"PENDENTE"),String(r[7]??""),String(r[8]??new Date().toISOString()),String(r[9]??""),String(r[10]??"")]);
}
for (const r of users) {
  if (!r[0] || !r[2]) continue;
  await run("INSERT OR IGNORE INTO users (id,nome,email,password_hash,password_salt,role,company_id,active,permissions,created_at,last_login) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    [String(r[0]),String(r[1]??""),String(r[2]).toLowerCase(),String(r[3]??""),String(r[4]??""),String(r[5]??"employee"),String(r[6]??""),String(r[7]??"SIM"),String(r[8]??"{}"),String(r[9]??new Date().toISOString()),String(r[10]??"")]);
}
for (const r of audit) {
  if (!r[0]) continue;
  await run("INSERT OR IGNORE INTO audit_log (id,actor_id,company_id,action,details,created_at) VALUES (?,?,?,?,?,?)",
    [String(r[0]),String(r[1]??""),String(r[2]??""),String(r[3]??""),String(r[4]??"{}"),String(r[5]??new Date().toISOString())]);
}
await run("INSERT OR REPLACE INTO app_migrations (name,completed_at) VALUES (?,?)", ["legacy-central-sheet-import",new Date().toISOString()]);
console.log("Import complete. Source Google spreadsheet was left untouched. Verify company/user counts and test login before removing its old secrets.");
