# Mudanças da SGE Central

## v2.4.0 · 2026-10-15 · Tela "Usuários e acessos" (modelo do SST)
- A antiga "Gestão de Identidade" + "Configuração de Usuário" saiu. No lugar: **cartões dos 6 níveis** (quantas pessoas em cada; clicar filtra), **lista de pessoas** (setor, quantos sistemas, Liberado/Bloqueado) com busca sem acento por nome, e-mail ou setor.
- Clicar numa pessoa abre a **gaveta lateral**: todos os sistemas, cada um com "Sem acesso" ou um dos 6 níveis (vale na hora, fica no histórico); setores; Redefinir senha; Bloquear em todos os sistemas. Seu próprio acesso à Central continua travado.
- "Sem acesso" desliga o acesso (a linha fica guardada); escolher um nível de novo religa.
- Mesmo banco (`gps_compartilhado.acesso_permissoes`): **nenhum SQL novo**.
- Arquivos: `js/tela-acessos.js`, `js/pessoas.js` (regras, 5 testes), `css/acessos.css`; teste visual com dados falsos em `testes/navegador/tela-acessos.html`.

## Banco · 2026-10-13 · Régua única de acesso, etapa A
Spec: `D:/SEGUNDO CEREBRO - IDE/2 - Projetos/SGE/Departamentos/9 - Programação/Régua única de acesso - especificação.md`
- `public.v_sso_acesso` passa a ler `acesso_permissoes` (fonte única) e traduz o nível para o nome antigo (SUPER/ADM/GESTAO/VISAO/SUPERVISOR). Mesmas colunas e tipos.
- Aplicado e conferido: os 30 acessos antigos ficaram iguais (0 diferenças); entraram os 8 acessos que só existiam na tabela nova (SST, Monitoramento, Mapeamento). Leitura como anônimo conferida.
- SQL: `supabase/migrations/20261013_regua_unica_visao_tradutora.sql`. Volta ensaiada: `supabase/voltar/20261013_voltar_visao_tradutora.sql`.

## v2.3.0 · 2026-10-09 · Login único e "Mostrar no portal"
- **Login único:** quem já entrou no SGE (portal ou outro sistema, mesma sessão) não digita a senha de novo: a página de login confere cadastro e acesso e segue direto para o sistema. Senha provisória continua obrigando a trocar.
- Tela de Sistemas: caixinha **Mostrar no portal** (desmarcada: o sistema some do portal e da grade da Barra Universal, mas continua funcionando).
- Banco (aplicado): coluna `mostrar_portal`; Medição, Apontamentos, Controle de Frota antigo, Presença, Horas Extras e Manutenções escondidos do portal; Monitoramento de Produtividade cadastrado como "Controle de Frota" (área Frota), com acesso para os administradores da Central.

## v2.2.0 · 2026-10-09 · Ícone de cada sistema
- Tela de Sistemas (novo e editar): seletor de **ícone** (grade com os ícones do `sge-icones.js` do sge-core). O ícone aparece na grade de sistemas da Barra Universal e no Portal SGE. Sem cor por sistema: todos os ícones ficam no mesmo tom neutro.

## v2.1.0 · 2026-10-08 · Login do Portal SGE
Plano: `D:/SEGUNDO CEREBRO - IDE/2 - Projetos/SGE/Departamentos/9 - Programação/Plano do Portal SGE.md` (seção 4)
- Login aceita voltar para `https://sge-portal.pages.dev` e para os endereços de teste `https://*.sge-portal.pages.dev`; para outros endereços, continua recusando.
- `app_slug=sge_portal`: exige só usuário cadastrado e ativo (sem acesso a um sistema específico). Se não conseguir conferir o cadastro, recusa o login. Não registra sessão de sistema.
- Tela de Sistemas (novo e editar): campos "Área do menu", "Ordem" e "Abre fora" (`area_menu`, `ordem`, `abre_fora`).

## v2.0.0 · 2026-10-08 · Central de Acesso (Fases 0 a 2)
Plano: `D:/SEGUNDO CEREBRO - IDE/2 - Projetos/SGE/Departamentos/9 - Programação/Plano da Central de Acesso.md`

**Banco (aplicado no SQL Editor; arquivos em `supabase/migrations/`)**
- Tabela de usuários fechada para quem não está logado; senhas que estavam gravadas foram apagadas e a tabela não guarda mais senha.
- Permissões no modelo do SST (`acesso_permissoes`: papel, telas, colunas, setores, aprovação), histórico com antes/depois (`acesso_auditoria`) e funções `acesso_priv.*`.
- Só o ADMIN da Central grava usuários, acessos, setores, perfis e sistemas. `secret_key` dos sistemas apagadas.
- Só nasce login com e-mail `@gestaogps.com.br`, `@gpssa.com.br` ou a exceção `warlison@sge.com` (gancho Before User Created).

**Servidor**
- Nova Edge Function `acesso-usuarios`: cria login com senha provisória, redefine senha, bloqueia de verdade (no login) e libera a troca de senha.

**Telas**
- Novo usuário: sem campo de senha, com setor; a senha provisória aparece uma vez, com "Copiar mensagem para WhatsApp".
- Botão "Redefinir senha" na ficha do usuário.
- "Bloquear" agora bloqueia também no login (antes só marcava na tabela).
- Login: obriga a criar a senha própria no primeiro acesso; só devolve a pessoa para endereços do SGE.
