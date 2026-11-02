# GESTTA — arquitetura multiempresa com Google Planilhas

## Decisão de arquitetura
O Google Planilhas permanece como único armazenamento persistente de dados da aplicação. Não usar Supabase, Firebase, banco SQL ou outro banco externo.

- **Planilha central GESTTA:** empresas, solicitações de cadastro, usuários, hashes de senha, papéis, permissões e vínculo de cada empresa à sua planilha operacional.
- **Uma planilha operacional por empresa:** Serviços, Atendimentos, Materiais, Recebimentos e Despesas.
- **Autenticação própria:** e-mail e senha GESTTA. A senha nunca pode ser salva em texto aberto; armazenar somente hash PBKDF2 com salt individual. Sessão em cookie HttpOnly, Secure e SameSite.
- **Isolamento:** o navegador nunca escolhe nem envia o ID da planilha operacional. O servidor resolve esse ID a partir da sessão, do usuário ativo e da associação à empresa.

## Abas da planilha central
Criar estas abas com cabeçalho na linha 1:
- `Empresas`: id, razao_social, nome_fantasia, cnpj, email_contato, telefone, status, spreadsheet_id, criado_em, aprovado_em, aprovado_por.
- `Solicitacoes`: id, empresa_id, solicitante_nome, email, telefone, status, criado_em, analisado_em, analisado_por.
- `Usuarios`: id, nome, email, password_hash, password_salt, papel, empresa_id, ativo, permissoes_json, criado_em, ultimo_acesso.
- `Auditoria`: id, usuario_id, empresa_id, acao, detalhes_json, criado_em.

Papéis: `general_admin`, `company_admin`, `employee`. As permissões de funcionário são definidas por módulo no campo `permissoes_json`.

## Variáveis de ambiente
Configurar no servidor:
- `LOVABLE_API_KEY`
- `GOOGLE_SHEETS_API_KEY`
- `GESTTA_CENTRAL_SPREADSHEET_ID`
- `GESTTA_SESSION_SECRET` (segredo aleatório forte, mínimo 32 bytes)
- `GESTTA_BOOTSTRAP_ADMIN_EMAIL` (e-mail do primeiro administrador geral)

Nenhuma dessas variáveis deve ter prefixo `VITE_`.

## Estado da implementação
Esta branch remove a proposta anterior de Supabase e documenta a arquitetura aprovada. A integração completa ainda exige:
1. Criar/configurar a planilha central e seus cabeçalhos.
2. Definir o primeiro administrador geral e inicializar sua conta com um fluxo seguro.
3. Implementar login, logout, recuperação de senha e gerenciamento de usuários.
4. Proteger **todas** as server functions com sessão e permissões.
5. Resolver a planilha operacional no servidor por empresa autenticada.
6. Confirmar que a conexão do gateway Google Sheets tem acesso à planilha central e a todas as planilhas de empresas.
7. Testar isolamento entre duas empresas antes de ativar em produção.

## Compatibilidade
A planilha operacional atual e o fluxo de empresa única devem permanecer intactos até a migração multiempresa estar concluída e validada. Não habilitar cadastro/login incompletos em produção.
