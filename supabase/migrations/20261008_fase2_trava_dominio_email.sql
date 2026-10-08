-- Fase 2 da Central de Acesso (2026-10-08): só e-mails permitidos viram login.
-- Aplicado pelo Warlison no SQL Editor. Depois: Auth > Hooks > Before User Created > Postgres > public.hook_sge_emails_permitidos.
create table if not exists gps_compartilhado.acesso_emails_permitidos (
  valor text primary key check (valor = lower(valor)),
  tipo text not null check (tipo in ('dominio', 'email')),
  motivo text,
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid()
);

insert into gps_compartilhado.acesso_emails_permitidos (valor, tipo, motivo) values
  ('gestaogps.com.br', 'dominio', 'e-mail da empresa'),
  ('gpssa.com.br', 'dominio', 'e-mail da empresa'),
  ('warlison@sge.com', 'email', 'login do dono do SGE (única exceção)')
on conflict (valor) do nothing;

alter table gps_compartilhado.acesso_emails_permitidos enable row level security;
drop policy if exists "admin da central" on gps_compartilhado.acesso_emails_permitidos;
create policy "admin da central" on gps_compartilhado.acesso_emails_permitidos for all to authenticated
  using ((select acesso_priv.eh_admin_central()))
  with check ((select acesso_priv.eh_admin_central()));
revoke all on gps_compartilhado.acesso_emails_permitidos from anon;
grant select, insert, update, delete on gps_compartilhado.acesso_emails_permitidos to authenticated;

drop trigger if exists auditar on gps_compartilhado.acesso_emails_permitidos;
create trigger auditar after insert or update or delete on gps_compartilhado.acesso_emails_permitidos
  for each row execute function acesso_priv.auditar();

create or replace function public.hook_sge_emails_permitidos(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(coalesce(event -> 'user' ->> 'email', ''));
begin
  if v_email <> '' and exists (
    select 1 from gps_compartilhado.acesso_emails_permitidos p
     where (p.tipo = 'email' and p.valor = v_email)
        or (p.tipo = 'dominio' and p.valor = split_part(v_email, '@', 2))
  ) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'Use o seu e-mail @gestaogps.com.br ou @gpssa.com.br. Peça o acesso ao administrador do SGE.'));
end;
$$;
grant execute on function public.hook_sge_emails_permitidos(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_sge_emails_permitidos(jsonb) from authenticated, anon, public;
