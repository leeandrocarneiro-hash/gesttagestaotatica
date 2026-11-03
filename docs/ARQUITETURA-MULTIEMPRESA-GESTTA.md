# GESTTA — arquitetura multiempresa (decisões aprovadas)

## Decisões de produto
- Armazenamento operacional: Google Sheets.
- Uma única aplicação GESTTA para várias empresas.
- Cadastro público e gratuito: a empresa cria a conta e pode começar a usar sem aprovação manual.
- Uma conta de usuário por empresa na primeira versão.
- Um administrador geral da plataforma, com acesso administrativo e financeiro completo.
- Cada empresa acessa exclusivamente os próprios dados.
- A versão principal não deve receber mudanças até a validação e aprovação do trabalho nesta branch.

## Arquitetura de dados
### Planilha central
Mantém o cadastro de empresas, o único usuário de cada empresa, o administrador geral e os registros de auditoria.
Abas previstas:
- Empresas: id, razão social, nome fantasia, CNPJ, e-mail, telefone, status, spreadsheet_id e datas.
- Usuarios: id, nome, e-mail, password_hash, password_salt, papel, empresa_id, ativo, criado_em e ultimo_acesso.
- Auditoria: id, ator, empresa_id, ação, detalhes e data.

### Planilha operacional por empresa
Cada empresa tem uma planilha operacional própria, vinculada pelo servidor ao empresa_id autenticado. As abas de operação existentes no GESTTA (Servicos, Atendimentos, Materiais, Recebimentos e Despesas) permanecem compatíveis.
A escolha da planilha nunca pode vir de um parâmetro livre enviado pelo navegador: o servidor resolve empresa_id -> Empresas.spreadsheet_id.

## Autenticação e segurança obrigatórias
- Senhas nunca são gravadas em texto aberto; usar PBKDF2-SHA256 com salt aleatório individual (ou serviço de autenticação equivalente).
- Cookie de sessão HttpOnly, Secure, SameSite=Lax, assinado por segredo forte mantido apenas no servidor.
- Revalidar usuário ativo e empresa ativa em cada operação protegida.
- Limitar tentativas de login e oferecer fluxo seguro de recuperação de senha antes de produção.
- Todas as server functions de leitura, inclusão, edição, exclusão, importação, exportação e relatórios devem exigir sessão válida e resolver a planilha no servidor.
- O administrador geral pode consultar e alterar dados de qualquer empresa, mas ações administrativas devem ser auditadas.
- O usuário da empresa não pode selecionar nem trocar o empresa_id de registros.
- Cadastro público deve impedir duplicidade de e-mail/CNPJ e criar empresa + usuário com estratégia de compensação/reconciliação para falhas parciais.

## Fluxo de cadastro aberto
1. Responsável informa dados da empresa e credenciais.
2. Servidor valida os campos e verifica duplicidade.
3. Servidor cria empresa com status ATIVA e usuário company_admin, com senha protegida.
4. O sistema vincula a empresa a uma planilha operacional exclusiva, criada ou provisionada com segurança.
5. Usuário entra e utiliza o GESTTA sem aprovação manual.
6. Administrador geral pode suspender/reativar a empresa; suspensão invalida sessões e bloqueia operações.

## Painel do administrador geral
- Listar, pesquisar, ativar e suspender empresas.
- Consultar dados cadastrais, último acesso e situação.
- Visualizar lançamentos e relatórios financeiros de qualquer empresa.
- Executar ações administrativas com registro em Auditoria.
- Acesso exclusivo por autenticação e autorização verificadas no servidor.

## Plano de implementação
1. Auditoria da versão estável e mapeamento de todas as operações Google Sheets.
2. Definir e validar o esquema central e o provisionamento de planilha por empresa.
3. Implementar autenticação segura, sessão e cadastro público gratuito.
4. Conectar o login público ao novo cadastro e remover dependência do login legado somente após migração validada.
5. Aplicar autorização centralizada em todas as operações dos módulos e nas rotas de exportação/importação.
6. Implementar painel global com acesso financeiro completo e trilha de auditoria.
7. Testar duas ou mais empresas, usuário único, isolamento em CRUD, gráficos, PDF, XLSX, importações, bloqueio e acesso administrativo.
8. Validar build, lint, testes e comportamento real do gateway/ambiente Lovable.
9. Fazer revisão final e abrir PR para aprovação; não publicar nem mesclar automaticamente.

## Critérios de aceite
- Cadastro aberto cria uma empresa e apenas um usuário de empresa.
- Duas empresas não conseguem ler, editar, excluir ou exportar dados uma da outra.
- Nenhuma função aceita planilha/empresa arbitrária enviada pelo cliente.
- Suspensão bloqueia imediatamente novas operações da empresa.
- Administrador geral acessa todas as empresas e suas informações financeiras, com auditoria.
- Senhas não aparecem em texto aberto em planilhas, logs ou respostas.
- Dados existentes são preservados e há plano de reversão.
- Todos os testes automatizados e build passam.

## Situação identificada na auditoria inicial
A branch foi criada a partir de main para isolar o trabalho. O repositório já contém código de preparação da planilha central e uma camada inicial de autenticação, mas a autenticação central ainda não está integrada ao login operacional público. A implementação de autenticação central encontrada lê uma coluna de senha em texto aberto e a rotina de bootstrap central também grava senha sem hash, apesar de existir um utilitário PBKDF2 no projeto. A página operacional ainda usa o login legado e a configuração da planilha individual. Portanto, a base atual não está pronta para cadastro público nem para dados reais multiempresa.

O acesso administrativo financeiro completo é uma decisão de produto, mas deve ser implementado somente em funções server-side autorizadas e auditadas. Não basta esconder ou mostrar telas no frontend.

## Limites de publicação
Este documento e as mudanças desta branch não alteram o deploy nem a branch principal. Não cadastrar empresas reais nem migrar dados até concluir os critérios de aceite.
