# GESTTA

Sistema de gestão de serviços, materiais, recebimentos, despesas e lucratividade, com os dados armazenados em **uma única planilha Google compartilhada por todas as empresas**.

## Base de dados

O GESTTA utiliza a planilha existente **Gestão de serviço**:

- Spreadsheet ID: `1inU8c_VuiHPTUePSvbEGGrQpDVlG3pYwG6j4gMJcsPk`
- Abas operacionais: `Servicos`, `Atendimentos`, `Materiais`, `Recebimentos` e `Despesas`.
- A aba `Resumo` é preservada e não é alterada pelo processo de inicialização.

Na primeira inicialização, o sistema cria as abas administrativas `Empresas`, `Usuarios` e `Auditoria`. Também acrescenta duas colunas técnicas ao final das cinco abas operacionais: `GESTTA_ID` e `Empresa ID`. Os registros já existentes são associados à primeira empresa criada. As colunas originais e seus dados não são substituídos.

Cada lançamento é filtrado no servidor pelo identificador da empresa autenticada. O administrador geral pode cadastrar e bloquear empresas; cada administrador de empresa acessa somente os próprios lançamentos.

## Autenticação e segurança

- Login por e-mail e senha.
- Senhas armazenadas com PBKDF2-SHA256, salt individual e 310.000 iterações.
- Sessão assinada no servidor e guardada em cookie HttpOnly.
- As operações de leitura e gravação verificam a sessão e a empresa no servidor; não dependem de filtros aplicados apenas no navegador.
- O primeiro cadastro cria o administrador geral e a empresa proprietária dos registros históricos. Depois disso, somente o administrador geral pode cadastrar outras empresas.

## Variáveis de ambiente do servidor

Configure-as no ambiente de hospedagem do GESTTA. Não use prefixo `VITE_`:

- `LOVABLE_API_KEY`: chave do gateway do Lovable.
- `GOOGLE_SHEETS_API_KEY`: chave de conexão do Google Sheets no gateway.
- `GESTTA_CENTRAL_SPREADSHEET_ID`: ID da planilha acima (já preenchido no arquivo `.env.example` como referência).
- `GESTTA_SESSION_SECRET`: segredo aleatório com pelo menos 32 caracteres, usado para assinar as sessões.

Essas chaves são segredos de servidor e nunca devem ser colocadas no código do navegador, em commits ou no arquivo `.env.example`.

## Observações de implantação

O código usa Server Functions do TanStack Start para manter as chamadas ao Google Sheets e a autenticação no servidor. O projeto não precisa do Supabase para login ou operações de dados.

A primeira abertura da tela de login verifica se a inicialização já foi concluída. Se não houver usuários, ela apresenta o formulário para criar o administrador geral e associar os registros existentes à primeira empresa.

## Desenvolvimento

```sh
bun install
bun run dev
bun run lint
bun run build
```

**Aplicação publicada:** https://gesttagestaotatica.lovable.app  
**Editor Lovable:** https://lovable.dev/projects/ac31775e-b1c0-49ac-83ce-4abea9f10d8e
