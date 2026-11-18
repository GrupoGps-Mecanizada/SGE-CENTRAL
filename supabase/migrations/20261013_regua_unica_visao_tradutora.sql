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

-- Conferência (esperado: atual_sem_igual_na_nova = 0; nova_sem_igual_na_atual = 8, que são SST, Monitoramento e Mapeamento)
with atual as (
  select a.id, a.usuario_id, a.sistema_id, a.is_active, a.perfil_id, p.nome as perfil_nome, p.nivel as perfil_nivel
  from gps_compartilhado.sge_central_usuario_sistema_acesso a
  left join gps_compartilhado.sge_central_perfis p on p.id = a.perfil_id
), nova as (select * from public.v_sso_acesso)
select 'atual_sem_igual_na_nova' as tipo, count(*) from (select * from atual except select * from nova) x
union all select 'nova_sem_igual_na_atual', count(*) from (select * from nova except select * from atual) y;
