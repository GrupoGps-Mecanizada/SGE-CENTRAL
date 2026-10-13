# Régua única de acesso: Etapa A (visão tradutora). Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer a `public.v_sso_acesso` ler a tabela nova `gps_compartilhado.acesso_permissoes` e traduzir o nível para o nome antigo, sem que nenhum dos 30 acessos de hoje mude.

**Architecture:** Só banco. `create or replace view` com as mesmas 7 colunas e os mesmos tipos. A tradução fica escrita na própria visão, em CASE, porque anônimo e autenticado não podem executar as funções `acesso_priv.*`. A tabela antiga e o gatilho `sincronizar_acesso_antigo` continuam, e um SQL de volta fica pronto e ensaiado.

**Tech Stack:** Supabase Postgres 17 (projeto `mgcjidryrjqiceielmzp`, "Banco De Dados"), SQL Editor ou MCP `execute_sql`.

**Spec:** `D:/SEGUNDO CEREBRO - IDE/2 - Projetos/SGE/Departamentos/9 - Programação/Régua única de acesso - especificação.md` (seção 3)

## Global Constraints
- Colunas da visão, nesta ordem e com estes tipos: `id uuid, usuario_id uuid, sistema_id uuid, is_active boolean, perfil_id uuid, perfil_nome varchar(100), perfil_nivel integer`.
- Tradução: nome antigo preservado quando corresponde ao nível novo (SUPER/ADM↔ADMIN, GESTAO↔GESTOR, VISAO↔LEITURA). Senão: ADMIN→ADM, GESTOR→GESTAO, SUPERVISOR→SUPERVISOR só em `controle_presenca_mec`, todo o resto→VISAO.
- Nada é apagado. Nenhuma política RLS e nenhum `grant` mudam.
- Aplicar só com o OK do Warlison, fora da troca de turno.

## Review Focus
1. Pessoa que está na tabela antiga e falta na nova perderia o acesso. A conferência "atual_sem_igual_na_nova = 0" precisa rodar **imediatamente antes** de aplicar (Task 2, Step 1).
2. Mudança feita pela tela antiga depois da troca (o gatilho copia para a nova) precisa aparecer na visão. Ensaio com ROLLBACK (Task 2, Step 4).
3. Tipo de coluna diferente faz o `create or replace` falhar. Ensaio com ROLLBACK antes (Task 1, Step 2).
4. O caminho de volta não pode rebaixar níveis do SST pela ponte: o gatilho fica desligado durante a cópia (Task 1, Step 3, e ensaio na Task 2, Step 5).
5. Acesso apagado na tela nova não pode voltar a valer se a visão for restaurada: o SQL de volta desliga a linha antiga (Task 1, Step 3).

---

### Task 1: Arquivos SQL (ida e volta) + ensaio sem gravar

**Files:**
- Create: `supabase/migrations/20261013_regua_unica_visao_tradutora.sql`
- Create: `supabase/voltar/20261013_voltar_visao_tradutora.sql`

- [ ] **Step 1: Escrever o SQL de ida**

```sql
-- =====================================================================
-- Régua única de acesso: Etapa A (2026-10-13)
-- Spec: D:/SEGUNDO CEREBRO - IDE/2 - Projetos/SGE/Departamentos/9 - Programação/Régua única de acesso - especificação.md
-- A visão do login antigo passa a ler acesso_permissoes e traduz o nível para o nome antigo.
-- Mesmas colunas e tipos. Os acessos de hoje continuam com o mesmo nome. Volta: supabase/voltar/20261013_voltar_visao_tradutora.sql
-- =====================================================================
create or replace view public.v_sso_acesso as
with base as (
  select a.id, n.usuario_id, n.sistema_id, n.ativo, a.perfil_id, pf.nome as nome_antigo, n.papel, s.slug
  from gps_compartilhado.acesso_permissoes n
  join gps_compartilhado.sge_central_sistemas s on s.id = n.sistema_id
  left join gps_compartilhado.sge_central_usuario_sistema_acesso a
    on a.usuario_id = n.usuario_id and a.sistema_id = n.sistema_id
  left join gps_compartilhado.sge_central_perfis pf on pf.id = a.perfil_id
), traduzido as (
  select b.*, (case
    when b.nome_antigo in ('SUPER', 'ADM') and b.papel = 'ADMIN' then b.nome_antigo
    when b.nome_antigo = 'GESTAO' and b.papel = 'GESTOR' then b.nome_antigo
    when b.nome_antigo = 'VISAO' and b.papel = 'LEITURA' then b.nome_antigo
    when b.papel = 'ADMIN' then 'ADM'
    when b.papel = 'GESTOR' then 'GESTAO'
    when b.papel = 'SUPERVISOR' and b.slug = 'controle_presenca_mec' then 'SUPERVISOR'
    else 'VISAO'
  end)::varchar(100) as nome
  from base b
)
select t.id, t.usuario_id, t.sistema_id, t.ativo as is_active, t.perfil_id,
       t.nome as perfil_nome, pf.nivel as perfil_nivel
from traduzido t
left join gps_compartilhado.sge_central_perfis pf on pf.nome = t.nome;

comment on view public.v_sso_acesso is 'Login antigo (sso_client): lê acesso_permissoes e traduz o nível para SUPER/ADM/GESTAO/VISAO/SUPERVISOR. Régua única 2026-10-13.';
```

- [ ] **Step 2: Ensaio sem gravar (tipos e diferenças)**

Rodar no banco o conteúdo do Step 1 entre `begin;` e `rollback;`, com esta conferência antes do `rollback`. Para comparar, a conferência usa a definição original da visão:

```sql
with atual as (
  select a.id, a.usuario_id, a.sistema_id, a.is_active, a.perfil_id, p.nome as perfil_nome, p.nivel as perfil_nivel
  from gps_compartilhado.sge_central_usuario_sistema_acesso a
  left join gps_compartilhado.sge_central_perfis p on p.id = a.perfil_id
), nova as (select * from public.v_sso_acesso)
select 'atual_sem_igual_na_nova' as tipo, count(*) from (select * from atual except select * from nova) x
union all select 'nova_sem_igual_na_atual', count(*) from (select * from nova except select * from atual) y;
```
Esperado: o `create or replace` passa sem erro; `atual_sem_igual_na_nova = 0`; `nova_sem_igual_na_atual = 8` (sst_mec 6, monitoramento_produtividade 1, mapeamento_atividades 1). Qualquer outro número: PARAR e avisar o Warlison.

- [ ] **Step 3: Escrever o SQL de volta**

```sql
-- =====================================================================
-- VOLTA da Etapa A (régua única). Só rodar se algo der errado.
-- 1) Copia para a tabela antiga o que foi dado/mudado/tirado pela tela nova
--    (com a ponte desligada, para não rebaixar nada na tabela nova).
-- 2) Recria a visão original.
-- =====================================================================
begin;
alter table gps_compartilhado.sge_central_usuario_sistema_acesso disable trigger sincronizar_acesso_antigo;

update gps_compartilhado.sge_central_usuario_sistema_acesso a
   set perfil_id = coalesce(pf.id, a.perfil_id), is_active = v.is_active
  from public.v_sso_acesso v
  left join gps_compartilhado.sge_central_perfis pf on pf.nome = v.perfil_nome
 where a.usuario_id = v.usuario_id and a.sistema_id = v.sistema_id
   and (a.perfil_id is distinct from coalesce(pf.id, a.perfil_id) or a.is_active is distinct from v.is_active);

insert into gps_compartilhado.sge_central_usuario_sistema_acesso (usuario_id, sistema_id, perfil_id, is_active)
select v.usuario_id, v.sistema_id,
       coalesce(pf.id, (select id from gps_compartilhado.sge_central_perfis where nome = 'VISAO')), v.is_active
  from public.v_sso_acesso v
  left join gps_compartilhado.sge_central_perfis pf on pf.nome = v.perfil_nome
 where not exists (select 1 from gps_compartilhado.sge_central_usuario_sistema_acesso a
                    where a.usuario_id = v.usuario_id and a.sistema_id = v.sistema_id);

update gps_compartilhado.sge_central_usuario_sistema_acesso a
   set is_active = false
 where a.is_active is not false
   and not exists (select 1 from gps_compartilhado.acesso_permissoes n
                    where n.usuario_id = a.usuario_id and n.sistema_id = a.sistema_id);

alter table gps_compartilhado.sge_central_usuario_sistema_acesso enable trigger sincronizar_acesso_antigo;

create or replace view public.v_sso_acesso as
select a.id, a.usuario_id, a.sistema_id, a.is_active, a.perfil_id,
       p.nome as perfil_nome, p.nivel as perfil_nivel
from gps_compartilhado.sge_central_usuario_sistema_acesso a
left join gps_compartilhado.sge_central_perfis p on p.id = a.perfil_id;
commit;
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20261013_regua_unica_visao_tradutora.sql supabase/voltar/20261013_voltar_visao_tradutora.sql docs/superpowers/plans/2026-10-13-regua-unica-etapa-a.md
git commit -m "SQL: régua única etapa A — visão tradutora (não aplicado) + volta"
```

### Task 2: Aplicar (só com OK do Warlison) e conferir

- [ ] **Step 1: Conferência de véspera.** Rodar de novo o ensaio do Task 1, Step 2 (com `rollback`). Tem que dar 0 e 8.
- [ ] **Step 2: Aplicar** o arquivo de ida (SQL Editor pelo Warlison, ou MCP com OK dele).
- [ ] **Step 3: Conferir na visão real.** Rodar a consulta do Task 1, Step 2 sem `begin/rollback`. Esperado: 0 e 8.
- [ ] **Step 4: Ensaio da tela antiga (com ROLLBACK).** Isso confirma que uma mudança feita pela tela antiga chega à visão:

```sql
begin;
create temp table alvo on commit drop as
  select a.id from gps_compartilhado.sge_central_usuario_sistema_acesso a
    join gps_compartilhado.sge_central_perfis p on p.id = a.perfil_id
   where p.nome = 'GESTAO' limit 1;
update gps_compartilhado.sge_central_usuario_sistema_acesso
   set perfil_id = (select id from gps_compartilhado.sge_central_perfis where nome = 'VISAO')
 where id = (select id from alvo);
select v.perfil_nome from public.v_sso_acesso v where v.id = (select id from alvo);
rollback;
```
Esperado: `VISAO` (antes era `GESTAO`). Depois do rollback, nada fica gravado.
- [ ] **Step 5: Ensaio do caminho de volta (com ROLLBACK).** Rodar o arquivo de volta trocando o `commit;` final por estas conferências e depois `rollback;`:
  - conferência do Task 1, Step 2. Esperado: 0 e 0, porque a visão antiga passa a ter também as 8 linhas do SST, do Monitoramento e do Mapeamento;
  - `select papel, count(*) from gps_compartilhado.acesso_permissoes group by 1;`. Esperado: igual a antes (ADMIN 17, GESTOR 17, AUDITOR 1, LEITURA 3), ou seja, a tabela nova não foi tocada.
- [ ] **Step 6: Teste no navegador (Warlison):** abrir a Central (entra como admin), o Gestão de Efetivo e o Etilômetro. Os mesmos botões de sempre aparecem.

### Task 3: Registro

**Files:**
- Modify: `docs/SSO_INTEGRACAO.md:25` e `:208` (a visão agora lê `acesso_permissoes`)
- Modify: `CHANGELOG.md` (ou o arquivo de mudanças da Central)
- Modify (cofre): `Plano da Central de Acesso.md` (marcar Etapa A), `0 - Regras e Histórico/Histórico.md`, ficha da Central

- [ ] **Step 1:** Atualizar os textos acima com: data, "visão tradutora aplicada, 0 diferenças, volta em `supabase/voltar/`".
- [ ] **Step 2: Commit**

```bash
git add docs/SSO_INTEGRACAO.md CHANGELOG.md
git commit -m "Docs: v_sso_acesso lê a régua única (acesso_permissoes)"
```
