# Arquitetura proposta: Google Drive por empresa (sem planilha central)

## Objetivo

Cada empresa vincula a própria conta Google no cadastro. O GESTTA cria a planilha operacional dentro do Google Drive dessa conta. Em acessos futuros, a empresa autentica novamente com a mesma conta Google e o sistema localiza a planilha sem consultar uma planilha central.

Esta alteração é uma proposta de implementação e não deve ser considerada pronta para produção até que o OAuth do Google esteja configurado e os testes descritos abaixo sejam concluídos.

## Fluxo recomendado

1. No cadastro, o usuário preenche os dados da empresa e define as credenciais do GESTTA.
2. O usuário seleciona Conectar com Google e conclui OAuth 2.0 Authorization Code com PKCE, state e nonce.
3. O backend valida a identidade Google (sub e e-mail verificado). O e-mail é informativo; usar o identificador estável sub como identidade da conta vinculada.
4. Com autorização do usuário, o backend cria uma planilha Google exclusiva no Drive da conta conectada, inicializa as abas operacionais e cria uma aba privada Acesso com o identificador da empresa, usuários, hashes PBKDF2 e salts individuais.
5. O backend grava no appDataFolder da mesma conta Google um pequeno arquivo de índice contendo somente a versão do formato, o google_sub, o identificador interno da empresa e o ID da planilha criada. Esse arquivo não contém senha, token OAuth ou dados financeiros.
6. No próximo acesso, o usuário autentica com a mesma conta Google. O backend valida o sub, lê o índice no appDataFolder, obtém o ID da planilha e valida o usuário/senha do GESTTA na aba Acesso.
7. Todas as operações de dados usam exclusivamente o spreadsheet ID obtido no servidor a partir da sessão autenticada. Nunca aceitar spreadsheet IDs enviados pelo navegador.

## Escopos OAuth a avaliar

Solicitar somente os escopos estritamente necessários:
- openid
- email
- profile
- https://www.googleapis.com/auth/drive.appdata para ler/escrever o índice privado do aplicativo
- https://www.googleapis.com/auth/drive.file para criar e administrar os arquivos criados/abertos pelo GESTTA
- https://www.googleapis.com/auth/spreadsheets para inicializar e operar as planilhas

A tela de consentimento deve explicar que o GESTTA cria e atualiza uma planilha no Drive da empresa. Não solicitar acesso amplo a todo o Drive se os escopos restritos forem suficientes.

## Segurança

- OAuth Authorization Code + PKCE; validar state, nonce, emissor, audiência, assinatura, expiração e email_verified.
- Nunca colocar client_secret, access token ou refresh token no frontend, repositório, logs ou planilhas.
- Não persistir refresh tokens em uma planilha central. O fluxo inicial deve usar autorização interativa quando necessário; se futuramente for indispensável manter acesso offline, decidir explicitamente onde guardar tokens criptografados e como permitir revogação.
- Cookie de sessão HttpOnly, Secure e SameSite; assinatura HMAC com segredo forte; expiração e rotação.
- Hash de senha com PBKDF2 + salt individual; nunca texto puro.
- Validar que o google_sub da sessão corresponde ao índice privado e à empresa da planilha.
- Isolar consultas/cache por empresa e invalidar sessão quando a conta Google for desconectada.
- Tratar duplicidade de cadastro e concorrência com lock/controle de idempotência.
- Não confiar no e-mail digitado pelo usuário para localizar planilhas.
- Não expor o ID da planilha como mecanismo de autorização.

## Migração e compatibilidade

O código atual em main usa central-auth.server.ts e uma planilha central (Empresas, Usuarios, Auditoria). Não remover nem desativar esse fluxo até existir uma migração aprovada e testada. Contas existentes precisam de um fluxo de vinculação Google e migração assistida que preserve a planilha e os dados operacionais atuais. Não apagar, recriar ou sobrescrever planilhas existentes automaticamente.

As funções de administrador geral atuais dependem da planilha central. Antes de removê-las, definir um modelo administrativo alternativo (por exemplo, painel de suporte sem acesso aos dados financeiros, com metadados mínimos e consentimento explícito).

## Configuração necessária antes da implementação executável

Criar um projeto OAuth no Google Cloud, configurar a tela de consentimento, adicionar os domínios autorizados e a URL de callback do ambiente de hospedagem. Configurar no servidor, como secrets:
- GOOGLE_OAUTH_CLIENT_ID
- GOOGLE_OAUTH_CLIENT_SECRET
- GOOGLE_OAUTH_REDIRECT_URI
- GESTTA_SESSION_SECRET

A URL de callback deve corresponder exatamente à cadastrada no Google Cloud. Não enviar valores secretos pelo chat nem adicioná-los ao GitHub.

## Critérios de aceite

- Cadastro de uma empresa cria uma planilha no Drive da conta Google escolhida.
- O índice fica no appDataFolder dessa mesma conta, sem catálogo global.
- Login com outra conta Google não encontra nem acessa a planilha.
- Login com a conta vinculada recupera a planilha correta e valida a senha do GESTTA.
- Duas empresas distintas recebem IDs de planilha distintos e não conseguem ler/escrever uma na outra.
- Desconectar/revogar a conta Google bloqueia novas operações até nova autorização.
- Nenhum dado de empresa, usuário ou financeiro é escrito em planilha central.
- Contas existentes e dados atuais permanecem intactos durante a implantação.
- Testes automatizados, lint e build passam; testes de integração são realizados com duas contas Google de teste.

## Estado

Este documento registra a arquitetura e os pré-requisitos. Não implementa ainda o fluxo OAuth nem altera o login/cadastro em produção. A implementação depende de credenciais OAuth do Google Cloud e de uma URL de callback estável do ambiente de hospedagem.
