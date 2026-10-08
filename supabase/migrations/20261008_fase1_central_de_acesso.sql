-- =====================================================================
-- Fase 1 da Central de Acesso (2026-10-08) · modelo do SST
-- Plano: D:/SEGUNDO CEREBRO - IDE/2 - Projetos/SGE/Departamentos/9 - Programação/Plano da Central de Acesso.md
-- Guardar depois em: SGE-CENTRAL/supabase/migrations/20261008_fase1_central_de_acesso.sql
--
-- O que faz:
--   A) Permissões no modelo do SST: papel + telas + colunas + setores + aprovação, por pessoa e por sistema
--      (tabela acesso_permissoes), com funções que o RLS de qualquer sistema pode usar.
--   B) Histórico com antes/depois de toda mudança de acesso (acesso_auditoria).
--   C) Fecha as brechas: só o ADMIN da Central grava usuários, acessos, setores, perfis e sistemas;
--      anônimo deixa de ver acessos e a secret_key dos sistemas.
-- Compatível com o que existe: a tela antiga da Central e o sso_client continuam funcionando.
-- Enquanto a tela antiga existir, o que ela grava em sge_central_usuario_sistema_acesso
-- é copiado sozinho para acesso_permissoes. Pode rodar mais de uma vez.
-- =====================================================================

create schema if not exists acesso_priv;
revoke all on schema acesso_priv from public, anon;
grant usage on schema acesso_priv to authenticated, service_role;

do $$ begin
  create type gps_compartilhado.acesso_papel as enum ('ADMIN', 'GESTOR', 'SUPERVISOR', 'OPERADOR', 'LEITURA', 'AUDITOR');
exception when duplicate_object then null;
end $$;

-- Catálogo de telas e colunas de cada sistema (vira caixinhas na tela de admin)
alter table gps_compartilhado.sge_central_sistemas
  add column if not exists telas jsonb not null default '[]'::jsonb,
  add column if not exists colunas jsonb not null default '[]'::jsonb;

-- ---------------------------------------------------------------------
-- A) Permissões (uma linha por pessoa × sistema)
-- ---------------------------------------------------------------------
create table if not exists gps_compartilhado.acesso_permissoes (
  id bigint generated always as identity primary key,
  usuario_id uuid not null references gps_compartilhado.sge_central_usuarios (id) on delete cascade,
  sistema_id uuid not null references gps_compartilhado.sge_central_sistemas (id) on delete cascade,
  papel gps_compartilhado.acesso_papel not null,
  telas text[],                 -- null = todas as telas do papel
  colunas text[],               -- null = todas as colunas
  setores uuid[],               -- null = todos os setores
  precisa_aprovacao boolean not null default false,
  aprova_lancamentos boolean not null default false,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid default auth.uid(),
  unique (usuario_id, sistema_id)
);
create index if not exists acesso_permissoes_sistema_idx on gps_compartilhado.acesso_permissoes (sistema_id);
comment on table gps_compartilhado.acesso_permissoes is 'Central de Acesso: o que cada pessoa pode em cada sistema (modelo do SST). Só o ADMIN da Central grava.';

create or replace function acesso_priv.tocar_atualizado_em()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;
drop trigger if exists tocar_atualizado_em on gps_compartilhado.acesso_permissoes;
create trigger tocar_atualizado_em before update on gps_compartilhado.acesso_permissoes
  for each row execute function acesso_priv.tocar_atualizado_em();

-- Funções de permissão (usadas pelo RLS de todos os sistemas)
create or replace function acesso_priv.minha_permissao(p_slug text)
returns setof gps_compartilhado.acesso_permissoes
language sql stable security definer set search_path = '' as $$
  select p.*
  from gps_compartilhado.acesso_permissoes p
  join gps_compartilhado.sge_central_sistemas s on s.id = p.sistema_id
  join gps_compartilhado.sge_central_usuarios u on u.id = p.usuario_id
  where p.usuario_id = (select auth.uid())
    and s.slug = p_slug
    and p.ativo
    and s.is_active is not false
    and u.is_active is not false
$$;

create or replace function acesso_priv.papel(p_slug text)
returns gps_compartilhado.acesso_papel
language sql stable security definer set search_path = '' as $$
  select papel from acesso_priv.minha_permissao(p_slug)
$$;

create or replace function acesso_priv.tem_papel(p_slug text, variadic p_papeis gps_compartilhado.acesso_papel[])
returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(acesso_priv.papel(p_slug) = any (p_papeis), false)
$$;

create or replace function acesso_priv.eh_admin_central()
returns boolean
language sql stable security definer set search_path = '' as $$
  select acesso_priv.tem_papel('sge_hub', 'ADMIN')
$$;

create or replace function acesso_priv.pode_tela(p_slug text, p_tela text)
returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select telas is null or p_tela = any (telas) from acesso_priv.minha_permissao(p_slug)), false)
$$;

create or replace function acesso_priv.coluna_permitida(p_slug text, p_coluna text)
returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select colunas is null or p_coluna = any (colunas) from acesso_priv.minha_permissao(p_slug)), false)
$$;

create or replace function acesso_priv.setor_permitido(p_slug text, p_setor uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select setores is null or p_setor = any (setores) from acesso_priv.minha_permissao(p_slug)), false)
$$;

revoke execute on all functions in schema acesso_priv from public, anon;
grant execute on all functions in schema acesso_priv to authenticated, service_role;

-- O que o sistema pergunta ao abrir (usado pelo SGE.acesso do sge-core na Fase 3). Sem permissão, "papel" vem nulo.
create or replace function public.sge_minhas_permissoes(p_slug text)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'usuario_id', u.id,
    'nome', u.nome,
    'email', u.email,
    'sistema', s.slug,
    'sistema_nome', s.nome,
    'papel', case when p.ativo and u.is_active is not false and s.is_active is not false then p.papel end,
    'telas', p.telas,
    'colunas', p.colunas,
    'setores', p.setores,
    'precisa_aprovacao', coalesce(p.precisa_aprovacao, false),
    'aprova_lancamentos', coalesce(p.aprova_lancamentos, false),
    'admin_central', acesso_priv.eh_admin_central()
  )
  from gps_compartilhado.sge_central_usuarios u
  cross join (select id, slug, nome, is_active from gps_compartilhado.sge_central_sistemas where slug = p_slug) s
  left join gps_compartilhado.acesso_permissoes p on p.usuario_id = u.id and p.sistema_id = s.id
  where u.id = (select auth.uid())
$$;
revoke execute on function public.sge_minhas_permissoes(text) from public, anon;
grant execute on function public.sge_minhas_permissoes(text) to authenticated, service_role;

alter table gps_compartilhado.acesso_permissoes enable row level security;
drop policy if exists "lê a própria ou admin" on gps_compartilhado.acesso_permissoes;
create policy "lê a própria ou admin" on gps_compartilhado.acesso_permissoes for select to authenticated
  using (usuario_id = (select auth.uid()) or (select acesso_priv.eh_admin_central()));
drop policy if exists "admin grava" on gps_compartilhado.acesso_permissoes;
create policy "admin grava" on gps_compartilhado.acesso_permissoes for all to authenticated
  using ((select acesso_priv.eh_admin_central()))
  with check ((select acesso_priv.eh_admin_central()));
revoke all on gps_compartilhado.acesso_permissoes from anon;
grant select, insert, update, delete on gps_compartilhado.acesso_permissoes to authenticated;
grant all on gps_compartilhado.acesso_permissoes to service_role;

-- ---------------------------------------------------------------------
-- B) Histórico com antes/depois (igual ao SST)
-- ---------------------------------------------------------------------
create table if not exists gps_compartilhado.acesso_auditoria (
  id bigint generated always as identity primary key,
  entidade text not null,
  entidade_id text,
  acao text not null check (acao in ('INSERT', 'UPDATE', 'DELETE')),
  antes jsonb,
  depois jsonb,
  usuario_id uuid,
  em timestamptz not null default now()
);
create index if not exists acesso_auditoria_entidade_idx on gps_compartilhado.acesso_auditoria (entidade, entidade_id);
create index if not exists acesso_auditoria_em_idx on gps_compartilhado.acesso_auditoria (em desc);

create or replace function acesso_priv.auditar()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_antes jsonb;
  v_depois jsonb;
  v jsonb;
begin
  if tg_op in ('UPDATE', 'DELETE') then v_antes := to_jsonb(old) - 'senha_hash' - 'secret_key'; end if;
  if tg_op in ('INSERT', 'UPDATE') then v_depois := to_jsonb(new) - 'senha_hash' - 'secret_key'; end if;
  if tg_op = 'UPDATE' and (v_antes - 'atualizado_em') = (v_depois - 'atualizado_em') then
    return new;
  end if;
  v := coalesce(v_depois, v_antes);
  insert into gps_compartilhado.acesso_auditoria (entidade, entidade_id, acao, antes, depois, usuario_id)
  values (tg_table_name,
          coalesce(v ->> 'id', (v ->> 'usuario_id') || ':' || (v ->> 'setor_id'), (v ->> 'sistema_id') || ':' || (v ->> 'setor_id')),
          tg_op, v_antes, v_depois, (select auth.uid()));
  return coalesce(new, old);
end;
$$;
revoke execute on function acesso_priv.auditar() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['acesso_permissoes', 'sge_central_usuarios', 'sge_central_usuario_sistema_acesso',
                           'sge_central_usuario_setores', 'sge_central_setores', 'sge_central_sistemas',
                           'sge_central_sistema_setores_autorizados', 'sge_central_perfis'] loop
    execute format('drop trigger if exists auditar on gps_compartilhado.%I', t);
    execute format('create trigger auditar after insert or update or delete on gps_compartilhado.%I
                    for each row execute function acesso_priv.auditar()', t);
  end loop;
end $$;

alter table gps_compartilhado.acesso_auditoria enable row level security;
drop policy if exists "admin lê" on gps_compartilhado.acesso_auditoria;
create policy "admin lê" on gps_compartilhado.acesso_auditoria for select to authenticated
  using ((select acesso_priv.eh_admin_central()));
revoke all on gps_compartilhado.acesso_auditoria from anon, authenticated;
grant select on gps_compartilhado.acesso_auditoria to authenticated;
grant all on gps_compartilhado.acesso_auditoria to service_role;

-- Ponte com a tela antiga: o que ela grava vira permissão nova
-- (SUPER e ADM → ADMIN, GESTAO → GESTOR, VISAO → LEITURA). Sai na Fase 4.
create or replace function acesso_priv.sincronizar_acesso_antigo()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_papel gps_compartilhado.acesso_papel;
begin
  if tg_op = 'DELETE' then
    delete from gps_compartilhado.acesso_permissoes
     where usuario_id = old.usuario_id and sistema_id = old.sistema_id;
    return old;
  end if;
  if new.usuario_id is null or new.sistema_id is null then
    return new;
  end if;
  select case pf.nome when 'SUPER' then 'ADMIN' when 'ADM' then 'ADMIN' when 'GESTAO' then 'GESTOR' else 'LEITURA' end
    into v_papel
    from gps_compartilhado.sge_central_perfis pf where pf.id = new.perfil_id;
  insert into gps_compartilhado.acesso_permissoes (usuario_id, sistema_id, papel, ativo)
  values (new.usuario_id, new.sistema_id, coalesce(v_papel, 'LEITURA'), new.is_active is not false)
  on conflict (usuario_id, sistema_id) do update set papel = excluded.papel, ativo = excluded.ativo;
  return new;
end;
$$;
revoke execute on function acesso_priv.sincronizar_acesso_antigo() from public, anon, authenticated;

drop trigger if exists sincronizar_acesso_antigo on gps_compartilhado.sge_central_usuario_sistema_acesso;
create trigger sincronizar_acesso_antigo after insert or update or delete on gps_compartilhado.sge_central_usuario_sistema_acesso
  for each row execute function acesso_priv.sincronizar_acesso_antigo();

-- Carga inicial com os acessos de hoje
insert into gps_compartilhado.acesso_permissoes (usuario_id, sistema_id, papel, ativo)
select a.usuario_id, a.sistema_id,
       (case pf.nome when 'SUPER' then 'ADMIN' when 'ADM' then 'ADMIN' when 'GESTAO' then 'GESTOR' else 'LEITURA' end)::gps_compartilhado.acesso_papel,
       a.is_active is not false
from gps_compartilhado.sge_central_usuario_sistema_acesso a
left join gps_compartilhado.sge_central_perfis pf on pf.id = a.perfil_id
where a.usuario_id in (select id from gps_compartilhado.sge_central_usuarios)
  and a.sistema_id in (select id from gps_compartilhado.sge_central_sistemas)
on conflict (usuario_id, sistema_id) do nothing;

-- ---------------------------------------------------------------------
-- C) Fecha as brechas das tabelas antigas
-- Leitura continua para quem está logado (os sistemas antigos precisam); gravação só ADMIN da Central.
-- ---------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('sge_central_usuarios', 'admin_full_usuarios'),
      ('sge_central_usuario_sistema_acesso', 'admin_full_acesso'),
      ('sge_central_perfis', 'Acesso total autenticado - perfis'),
      ('sge_central_setores', 'Acesso total autenticado - setores'),
      ('sge_central_usuario_setores', 'Acesso total autenticado - usuario_setores'),
      ('sge_central_sistema_setores_autorizados', 'Acesso total autenticado - sistema_setores_autorizados'),
      ('sge_central_sistemas', 'admin_write_sistemas')
    ) v(tabela, politica_antiga)
  loop
    execute format('drop policy if exists %I on gps_compartilhado.%I', r.politica_antiga, r.tabela);
    execute format('drop policy if exists "autenticado lê" on gps_compartilhado.%I', r.tabela);
    execute format('create policy "autenticado lê" on gps_compartilhado.%I for select to authenticated using (true)', r.tabela);
    execute format('drop policy if exists "admin da central grava" on gps_compartilhado.%I', r.tabela);
    execute format('create policy "admin da central grava" on gps_compartilhado.%I for all to authenticated
                    using ((select acesso_priv.eh_admin_central()))
                    with check ((select acesso_priv.eh_admin_central()))', r.tabela);
  end loop;
end $$;

-- Histórico antigo: só o ADMIN lê e grava; quem fez passa a ser preenchido pelo banco.
alter table gps_compartilhado.sge_central_auditoria alter column admin_id set default auth.uid();
drop policy if exists "Acesso total autenticado - auditoria" on gps_compartilhado.sge_central_auditoria;
drop policy if exists "admin da central lê e grava" on gps_compartilhado.sge_central_auditoria;
create policy "admin da central lê e grava" on gps_compartilhado.sge_central_auditoria for all to authenticated
  using ((select acesso_priv.eh_admin_central()))
  with check ((select acesso_priv.eh_admin_central()));

-- Anônimo deixa de ver acessos, setores, perfis, histórico e notificações (o login usa as visões v_sso_*, que continuam).
drop policy if exists anon_read_access_status on gps_compartilhado.sge_central_usuario_sistema_acesso;
revoke all on gps_compartilhado.sge_central_usuario_sistema_acesso from anon;
revoke all on gps_compartilhado.sge_central_usuario_setores from anon;
revoke all on gps_compartilhado.sge_central_setores from anon;
revoke all on gps_compartilhado.sge_central_perfis from anon;
revoke all on gps_compartilhado.sge_central_auditoria from anon;
revoke all on gps_compartilhado.sge_central_notificacoes from anon;
revoke all on gps_compartilhado.sge_central_sistema_setores_autorizados from anon;

-- secret_key dos sistemas: não é usada em nenhum código e estava visível para qualquer pessoa. Apagada.
alter table gps_compartilhado.sge_central_sistemas alter column secret_key drop not null;
update gps_compartilhado.sge_central_sistemas set secret_key = null where secret_key is not null;
comment on column gps_compartilhado.sge_central_sistemas.secret_key is 'Desativada em 2026-10-08: não era usada e estava exposta.';
revoke all on gps_compartilhado.sge_central_sistemas from anon;
grant select (id, nome, slug, url_origem, is_active, icone, cor, descricao) on gps_compartilhado.sge_central_sistemas to anon;

-- Conferência: permissões carregadas ~29, admin = Warlison, secret_keys = 0
select
  (select count(*) from gps_compartilhado.acesso_permissoes) as permissoes_carregadas,
  (select string_agg(u.nome, ', ') from gps_compartilhado.acesso_permissoes p
     join gps_compartilhado.sge_central_sistemas s on s.id = p.sistema_id and s.slug = 'sge_hub'
     join gps_compartilhado.sge_central_usuarios u on u.id = p.usuario_id
    where p.papel = 'ADMIN' and p.ativo) as admins_da_central,
  (select count(*) from gps_compartilhado.sge_central_sistemas where secret_key is not null) as secret_keys_restantes;
