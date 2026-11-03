# GESTTA — Supabase multiempresa

## Objetivo
Supabase Auth passa a ser a fonte de identidade e autenticação. O Google Sheets continua armazenando os dados operacionais, em uma planilha exclusiva por empresa.

## Migração adicionada
`supabase/migrations/20261102000100_gestta_multi_company_identity.sql` cria:
- `companies`: empresa, proprietário, status e vínculo futuro com a planilha operacional.
- `profiles`: associação usuário/empresa e papel.
- Trigger em `auth.users`: ao criar usuário via Supabase Auth, cria empresa e perfil na mesma transação.
- RLS para que o usuário autenticado leia somente a própria empresa e perfil.
- Funções auxiliares com `SECURITY DEFINER` para resolver a empresa da sessão e reconhecer administrador geral por `app_metadata`.

## Regras de segurança
- Senhas são gerenciadas pelo Supabase Auth; não gravar senhas em Google Sheets.
- Papel de administrador geral deve ser definido exclusivamente em `auth.users.app_metadata` por backend confiável; nunca confiar em `user_metadata`.
- O navegador não pode inserir perfis/empresas diretamente nem definir `spreadsheet_id`.
- Uma função server-side deve validar acesso real ao Google Sheets antes de gravar o vínculo da planilha.
- Toda operação de planilha deve resolver o ID pela sessão autenticada no servidor, nunca por parâmetro do navegador.

## O que ainda falta antes de habilitar
Esta migração é a fundação do banco e das políticas, não a conclusão do fluxo multiempresa. O login atual do projeto ainda usa autenticação legada via Google Sheets e comparação de senha em texto puro. Ainda é necessário:
1. Configurar as variáveis públicas do Supabase URL e anon/publishable key no ambiente do projeto, sem expor service-role key.
2. Integrar cadastro e login da interface com Supabase Auth; o cadastro deve enviar `company_name` e `display_name` em `user_metadata`.
3. Substituir a sessão própria atual por sessão Supabase validada no servidor.
4. Criar função server-side segura para vincular a planilha, validando permissões Google e impedindo reutilização do mesmo arquivo.
5. Migrar todos os endpoints de CRUD, gráficos, relatórios, PDF, XLSX e importação para resolver a planilha pela empresa da sessão.
6. Implementar o painel do administrador geral com papel lido de `app_metadata` e auditoria.
7. Testar duas empresas independentes e tentativas de acesso cruzado; executar build, lint e testes.
8. Planejar migração de contas legadas sem reaproveitar senhas em texto puro.

**Não usar com dados reais, não cadastrar empresas externas e não publicar até concluir os itens acima.** A branch principal não foi alterada.
