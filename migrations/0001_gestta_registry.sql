CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  razao_social TEXT NOT NULL,
  nome_fantasia TEXT NOT NULL,
  cnpj TEXT NOT NULL DEFAULT '',
  email_contato TEXT NOT NULL DEFAULT '',
  telefone TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  spreadsheet_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  origem TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS companies_cnpj_unique ON companies(cnpj) WHERE cnpj <> '';
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('general_admin','company_admin','employee')),
  company_id TEXT NOT NULL DEFAULT '',
  active TEXT NOT NULL DEFAULT 'SIM',
  permissions TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  last_login TEXT NOT NULL DEFAULT '',
  FOREIGN KEY(company_id) REFERENCES companies(id)
);
CREATE INDEX IF NOT EXISTS users_company_idx ON users(company_id);
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  company_id TEXT NOT NULL,
  action TEXT NOT NULL,
  details TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS app_migrations (
  name TEXT PRIMARY KEY,
  completed_at TEXT NOT NULL
);
