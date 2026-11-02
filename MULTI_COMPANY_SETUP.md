# GESTTA — ativação do acesso multiempresa

Esta branch inicia a base de autenticação, empresas, membros e permissões. **A aplicação ainda não deve ser publicada como multiempresa** até concluir a integração dos formulários/rotas e a migração de todas as operações Google Sheets para resolução server-side do spreadsheet_id da empresa autenticada.

## O que foi incluído
- Esquema Supabase para perfis, empresas, membros e permissões por módulo.
- Estados de empresa: pending, approved, awaiting_sheet, active, rejected e blocked.
- Políticas RLS para separar dados e limitar administradores de empresa à própria empresa.
- Cliente Supabase de navegador usando publishable key.
- Exemplo de variáveis de ambiente.

## Ativação necessária
1. Criar um projeto Supabase.
2. Executar `supabase/migrations/202611020001_multi_company.sql` no SQL Editor.
3. Configurar `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` na hospedagem e no ambiente local.
4. Criar o primeiro usuário via Supabase Auth e promover seu perfil para `general_admin` usando o UUID desse usuário no SQL Editor.
5. Configurar o gateway Google Sheets com acesso às planilhas vinculadas.
6. Antes de liberar usuários reais, concluir autenticação nas rotas e proteger cada server function de Sheets com sessão validada, associação ativa e permissões por módulo.

## Segurança / limitações desta etapa
- Não há credenciais Supabase deste projeto disponíveis no repositório; por isso nenhum projeto remoto foi criado ou configurado.
- A chave service-role não deve ser colocada em variáveis `VITE_*` nem enviada ao navegador.
- A planilha não pode ser escolhida pelo cliente. O servidor deve buscar o spreadsheet_id pela associação autenticada no banco.
- O ID fixo atual em `src/lib/sheets-config.ts` continua ativo nesta etapa. Não habilite cadastro público nem múltiplas empresas antes da migração de `src/lib/sheets.functions.ts`.
