-- Portal SGE (2026-10-09, pedido do Warlison):
-- 1) "Mostrar no portal": sistema continua funcionando, só não aparece no portal nem na grade da Barra Universal.
-- 2) Esconde do portal: Controle de Medição, Apontamentos, Controle de Frota (antigo), Controle de Presença, Horas Extras, Manutenções.
-- 3) Cadastra o Monitoramento de Produtividade com o nome "Controle de Frota" e libera ADMIN para quem é ADMIN da Central (sge_hub).
alter table gps_compartilhado.sge_central_sistemas
  add column if not exists mostrar_portal boolean not null default true;
comment on column gps_compartilhado.sge_central_sistemas.mostrar_portal is 'false = não aparece no Portal SGE nem na grade da Barra Universal (o sistema continua funcionando).';

update gps_compartilhado.sge_central_sistemas set mostrar_portal = false
where slug in ('controle_medicao_adm', 'apontamentos_mec', 'controle_frota_mec', 'controle_presenca_mec', 'horas_extras_mec', 'manutencoes_mec');

insert into gps_compartilhado.sge_central_sistemas (nome, slug, url_origem, is_active, icone, area_menu, ordem, descricao)
select 'Controle de Frota', 'monitoramento_produtividade', 'https://grupogps-mecanizada.github.io/Monitoramento-De-Produtividade/',
       true, 'truck', 'Frota', 1, 'Monitoramento de produtividade da frota'
where not exists (select 1 from gps_compartilhado.sge_central_sistemas where slug = 'monitoramento_produtividade');

insert into gps_compartilhado.acesso_permissoes (usuario_id, sistema_id, papel, ativo)
select adm.usuario_id, s.id, 'ADMIN', true
from gps_compartilhado.sge_central_sistemas s
cross join (select distinct p.usuario_id from gps_compartilhado.acesso_permissoes p
            join gps_compartilhado.sge_central_sistemas c on c.id = p.sistema_id and c.slug = 'sge_hub'
            where p.papel = 'ADMIN' and p.ativo) adm
where s.slug = 'monitoramento_produtividade'
  and not exists (select 1 from gps_compartilhado.acesso_permissoes p2 where p2.usuario_id = adm.usuario_id and p2.sistema_id = s.id);

-- Lista do portal e da Barra Universal: só os sistemas marcados para aparecer no portal.
create or replace function public.sge_meus_sistemas()
returns jsonb
language sql stable security definer set search_path = '' as $$
  with eu as (
    select u.id, u.nome, (u.is_active is not false) as ativo
    from gps_compartilhado.sge_central_usuarios u
    where u.id = (select auth.uid())
  )
  select jsonb_build_object(
    'ativo', coalesce((select ativo from eu), false),
    'nome', (select nome from eu),
    'sistemas', case when coalesce((select ativo from eu), false) then coalesce((
      select jsonb_agg(jsonb_build_object(
          'slug', s.slug, 'nome', s.nome, 'icone', s.icone, 'area_menu', s.area_menu,
          'ordem', s.ordem, 'url_origem', s.url_origem, 'abre_fora', s.abre_fora, 'papel', p.papel)
        order by s.ordem nulls last, s.nome)
      from gps_compartilhado.acesso_permissoes p
      join gps_compartilhado.sge_central_sistemas s on s.id = p.sistema_id
      where p.usuario_id = (select auth.uid())
        and p.ativo and p.papel is not null and s.is_active is not false and s.mostrar_portal
    ), '[]'::jsonb) else '[]'::jsonb end
  )
$$;
revoke execute on function public.sge_meus_sistemas() from public, anon;
grant execute on function public.sge_meus_sistemas() to authenticated, service_role;
