# GESTTA — arquitetura multiempresa com Google Planilhas

## Decisão de arquitetura
O Google Planilhas permanece como armazenamento persistente dos dados operacionais.

- **Planilha central GESTTA:** empresas, solicitações, usuários, hashes de senha, papéis, permissões e vínculo de cada empresa à sua planilha operacional.
- **Uma planilha operacional por empresa:** Serviços, Atendimentos, Materiais, Recebimentos e Despesas.
- **Autenticação própria:** e-mail e senha GESTTA. Nunca armazenar senha em texto aberto; usar hash PBKDF2 com salt individual. Sessão em cookie HttpOnly, Secure e SameSite.
- **Isolamento:** o navegador nunca escolhe nem envia o ID da planilha operacional. O servidor resolve esse ID a partir da sessão, do usuário ativo e da associação à empresa.

## Planilha central definida
ID informado pelo usuário: `14tacZ37LFI0fvjV82fMETF7smNT93gBcEwFr64Lgmgk`.

Link: https://docs.google.com/spreadsheets/d/14tacZ37LFI0fvjV82fMETF7smNT93gBcEwFr64Lgmgk/edit

Configure esse ID no servidor em `GESTTA_CENTRAL_SPREADSHEET_ID`. O acesso deve ser validado pela conexão Google Sheets do projeto; compartilhar o link publicamente não garante acesso pelo gateway.

## Abas da planilha central
Criar estas abas com cabeçalho na linha 1:
- `Empresas`: id, razao_social, nome_fantasia, cnpj, email_contato, telefone, status, spreadsheet_id, criado_em, aprovado_em, aprovado_por.
- `Solicitacoes`: id, empresa_id, solicitante_nome, email, telefone, status, criado_em, analisado_em, analisado_por.
- `Usuarios`: id, nome, email, password_hash, password_salt, papel, empresa_id, ativo, permissoes_json, criado_em, ultimo_acesso.
- `Auditoria`: id, usuario_id, empresa_id, acao, detalhes_json, criado_em.

Papéis: `general_admin`, `company_admin`, `employee`. As permissões de funcionário são definidas por módulo no campo `permissoes_json`.

## Variáveis de ambiente
Configurar no ambiente do servidor:
- `LOVABLE_API_KEY`
- `GOOGLE_SHEETS_API_KEY`
- `GESTTA_CENTRAL_SPREADSHEET_ID`
- `GESTTA_SESSION_SECRET` (segredo aleatório forte, mínimo 32 bytes)
- `GESTTA_BOOTSTRAP_ADMIN_EMAIL` (e-mail do primeiro administrador geral)
- `GESTTA_CENTRAL_SETUP_TOKEN` (temporário, somente durante a inicialização)

Nenhuma dessas variáveis deve ter prefixo `VITE_`.

## Inicialização segura das abas centrais
1. Configure `GESTTA_CENTRAL_SPREADSHEET_ID` e `GESTTA_CENTRAL_SETUP_TOKEN` no ambiente do servidor.
2. Acesse `/configurar-planilha-central` e informe o token.
3. A rotina verifica as quatro abas. Só grava cabeçalhos quando a primeira linha está vazia; se encontrar conteúdo diferente, interrompe sem sobrescrever. Se o cabeçalho já estiver correto, não altera a aba.
4. Depois de concluir, remova `GESTTA_CENTRAL_SETUP_TOKEN` do ambiente do servidor.

## Fluxo multiempresa aprovado
1. O administrador geral cria a empresa e seu primeiro usuário, definindo login e senha inicial.
2. No primeiro acesso, o usuário da empresa informa o link da planilha operacional própria.
3. O servidor valida o link e o acesso à planilha, cria somente as abas necessárias que estiverem ausentes e grava o vínculo na planilha central.
4. Nos acessos seguintes, o servidor obtém a planilha exclusivamente pela associação validada da empresa autenticada.
5. O administrador geral pode bloquear ou reativar contas. O bloqueio deve invalidar o acesso nas verificações seguintes.
6. Toda ação administrativa relevante deve gerar registro na aba `Auditoria`.

## Estado real da implementação — não habilitar em produção
A preparação das abas centrais e o fluxo legado de planilha individual já existem parcialmente. **A autenticação multiempresa completa ainda não está implementada.** No código atual, o login consulta uma aba legada `Logins` e compara a senha em texto aberto. O vínculo de planilha também ainda é resolvido por esse cadastro legado, não pelo conjunto `Usuarios` + `Empresas`.

Antes de usar com empresas reais, ainda é obrigatório:
1. Substituir o login legado por autenticação na aba `Usuarios`, com hash PBKDF2 e salt individual; não aceitar nem persistir senha em texto aberto.
2. Implementar bootstrap protegido do primeiro `general_admin`, criação de empresas e usuários, bloqueio/reativação e controle de papéis.
3. Fazer a sessão carregar identidade, papel e empresa; validar usuário ativo e empresa ativa em toda operação protegida.
4. Resolver a planilha operacional no servidor a partir de `Usuarios.empresa_id` → `Empresas.spreadsheet_id`; nunca confiar em ID de planilha enviado pelo navegador.
5. Proteger todas as server functions, incluindo leitura, inclusão, edição, exclusão, importação, exportação e relatórios, com sessão e permissões.
6. Validar que a conexão do gateway Google Sheets tem acesso à planilha central e às planilhas de cada empresa.
7. Testar isolamento com pelo menos duas empresas e contas de papéis diferentes, incluindo tentativas de acesso cruzado.
8. Revisar cookies, expiração/rotação de sessão, limitação de tentativas de login, recuperação de senha e auditoria.

**Não usar o sistema com dados reais nem cadastrar empresas externas até concluir e testar esses itens.**

## Compatibilidade
Preservar os dados e a planilha operacional atual durante a migração. Não remover o fluxo legado até existir uma migração validada e um plano de reversão.
