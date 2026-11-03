# Substituição do cadastro central por Cloudflare D1

O cadastro de empresas, usuários, permissões e auditoria passa a usar Cloudflare D1 pela API REST. As planilhas operacionais de cada empresa continuam no Google Sheets. O código não apaga nem altera a antiga planilha central.

## 1. Criar e configurar o D1

1. No painel Cloudflare, crie um banco D1 para o GESTTA.
2. Gere um API Token com permissão de leitura e escrita em D1 para a conta correta.
3. Configure no ambiente de servidor do deploy:
   - `CLOUDFLARE_ACCOUNT_ID`
   - `CLOUDFLARE_D1_DATABASE_ID`
   - `CLOUDFLARE_API_TOKEN`
   - `GESTTA_SESSION_SECRET` (mínimo 32 bytes aleatórios)
   - `LOVABLE_API_KEY` e `GOOGLE_SHEETS_API_KEY` (mantidos para as planilhas financeiras)
4. Nunca exponha esses valores com prefixo `VITE_`.

O código cria as tabelas necessárias na primeira utilização. O arquivo `migrations/0001_gestta_registry.sql` documenta o mesmo esquema para provisionamento manual.

## 2. Migrar os cadastros existentes

Antes de trocar a aplicação publicada, faça backup da planilha central antiga e configure temporariamente:
- `GESTTA_LEGACY_CENTRAL_SPREADSHEET_ID` com o ID da planilha central atual.

Execute localmente, em ambiente confiável:

```bash
node scripts/migrate-central-sheet-to-d1.mjs
```

O importador copia empresas, usuários (incluindo hashes/salts de senha existentes) e auditoria. Ele usa INSERT OR IGNORE para permitir repetição segura e **não exclui nem modifica a planilha de origem**. Confira as quantidades importadas e teste login de administrador e funcionário antes de publicar. Remova a variável legada após a validação.

## 3. Limites desta etapa

- A conexão das planilhas financeiras ainda usa o conector Google Sheets configurado no GESTTA. A autenticação OAuth individual de cada empresa no próprio Drive não está implementada nesta etapa e exige credenciais OAuth do Google e fluxo de callback/consentimento.
- O D1 precisa estar criado e as variáveis secretas configuradas no ambiente de hospedagem. Sem isso, login/cadastro falhará de forma fechada; não existe fallback silencioso para a antiga planilha.
- A planilha central antiga deve ser mantida como backup até validar a migração e todos os acessos.
- Esta alteração não deve ser considerada pronta para produção antes de executar o build/testes e validar o D1 no ambiente real.


## 4. Login com Google

O GESTTA oferece o botão **Continuar com Google** para contas já cadastradas. O e-mail verificado da conta Google deve ser o mesmo e-mail da conta GESTTA. Por segurança, o login Google não cria automaticamente uma empresa nem vincula um e-mail diferente.

Configure no ambiente de servidor:
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI`

No Google Cloud Console, crie um OAuth Client ID do tipo **Aplicativo da Web**, habilite o fluxo OAuth e cadastre exatamente a URL de retorno configurada em `GOOGLE_OAUTH_REDIRECT_URI` (por exemplo, `https://gesttagestaotatica.lovable.app/google-callback`). Adicione também o domínio do GESTTA em **Authorized JavaScript origins** quando solicitado pelo console.

O fluxo usa authorization code, valida o estado anti-CSRF, confirma o token de identidade no Google e só então cria a sessão segura do GESTTA. O segredo OAuth deve permanecer apenas no servidor e nunca receber prefixo `VITE_`.
