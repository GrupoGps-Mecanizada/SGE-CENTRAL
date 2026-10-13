-- =====================================================================
-- VOLTA da Etapa A (régua única, 2026-10-13). Só rodar se algo der errado.
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
comment on view public.v_sso_acesso is null;
commit;
