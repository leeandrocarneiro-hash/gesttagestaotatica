# Configuração multiempresa do GESTTA

A autenticação e o cadastro de empresas usam Google Planilhas no backend. Nenhuma senha é armazenada em texto puro: o campo de senha guarda PBKDF2-SHA-256 com salt individual. A sessão é assinada por HMAC e enviada em cookie HttpOnly, Secure e SameSite=Lax.

## Variáveis de ambiente obrigatórias

Configure somente no ambiente de servidor (nunca em variáveis VITE_):

- `LOVABLE_API_KEY`: chave de integração do gateway Lovable.
- `GOOGLE_SHEETS_API_KEY`: conexão Google Sheets já autorizada no projeto.
- `GESTTA_CENTRAL_SPREADSHEET_ID`: ID da planilha central privada.
- `GESTTA_SESSION_SECRET`: segredo aleatório com pelo menos 32 bytes para assinar sessões.

Gere o segredo de sessão com um gerador criptograficamente seguro, por exemplo `openssl rand -base64 48`. Não reutilize senhas pessoais.

## Preparar a planilha central

Crie uma planilha privada, acessível apenas à conta Google conectada ao GESTTA, e configure o ID em `GESTTA_CENTRAL_SPREADSHEET_ID`. Crie três abas com estes cabeçalhos na linha 1:

- **Empresas** (A:K): `empresaId | razaoSocial | nomeFantasia | cnpj | emailContato | telefone | status | spreadsheetId | criadoEm | atualizadoEm | origem`
- **Usuarios** (A:K): `usuarioId | nome | email | passwordHash | passwordSalt | papel | empresaId | ativo | permissoes | criadoEm | ultimoAcesso`
- **Auditoria** (A:F): `eventoId | usuarioId | empresaId | acao | detalhes | criadoEm`

O cadastro público só ativa a empresa depois de criar a planilha operacional, preparar as abas e vincular o ID à planilha central. Se alguma etapa falhar, a empresa permanece PENDENTE; não repita o cadastro com o mesmo e-mail antes de reconciliar a linha pendente.

## Criação automática de planilhas

O fluxo usa o recurso Google Sheets API `spreadsheets.create` através do gateway conectado, seguido de `spreadsheets.batchUpdate` e `values.batchUpdate`. A conexão precisa ter permissão de criação e edição de planilhas. O gateway do projeto deve permitir POST em `/spreadsheets`; se não permitir, o cadastro falhará explicitamente e não usará a planilha de outra empresa como fallback.

A planilha operacional antiga configurada no código anterior não é migrada, apagada nem reutilizada. Os dados existentes permanecem intactos.

## Antes de publicar

1. Configure e valide as quatro variáveis acima.
2. Confirme que a conexão Google pode criar planilhas e editar as planilhas criadas.
3. Execute `npm test`, `npm run lint` e `npm run build`.
4. Teste com duas contas e confirme que cada uma recebe um ID de planilha diferente.
5. Revise os logs e os controles de acesso antes de mesclar a branch.

**Atenção:** o Google Sheets é um armazenamento simples, sem transações/índices exclusivos. O cadastro faz uma verificação de e-mail antes de gravar, mas uma corrida entre cadastros simultâneos precisa ser coberta por testes e, idealmente, por um mecanismo de lock no servidor antes de uso público em escala.
