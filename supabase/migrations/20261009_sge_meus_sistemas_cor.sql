-- Barra Universal SGE (sge-core 1.2): sge_meus_sistemas passa a devolver a cor de cada sistema.
-- Mesmo corpo de sge-portal/sql/20261008_portal_sge.sql, só com 'cor' a mais. Aplicar com o OK do Warlison.
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
          'slug', s.slug, 'nome', s.nome, 'icone', s.icone, 'cor', s.cor, 'area_menu', s.area_menu,
          'ordem', s.ordem, 'url_origem', s.url_origem, 'abre_fora', s.abre_fora, 'papel', p.papel)
        order by s.ordem nulls last, s.nome)
      from gps_compartilhado.acesso_permissoes p
      join gps_compartilhado.sge_central_sistemas s on s.id = p.sistema_id
      where p.usuario_id = (select auth.uid())
        and p.ativo and p.papel is not null and s.is_active is not false
    ), '[]'::jsonb) else '[]'::jsonb end
  )
$$;
revoke execute on function public.sge_meus_sistemas() from public, anon;
grant execute on function public.sge_meus_sistemas() to authenticated, service_role;
