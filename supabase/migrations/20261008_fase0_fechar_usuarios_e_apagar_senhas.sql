-- Fase 0 da Central de Acesso (2026-10-08)
-- Motivo: a tabela de usuários estava legível por qualquer pessoa sem login, com senhas em texto puro.
-- Plano: D:/SEGUNDO CEREBRO - IDE/2 - Projetos/SGE/Departamentos/9 - Programação/Plano da Central de Acesso.md
-- Como rodar: painel do Supabase > SQL Editor > colar tudo > Run. Pode rodar mais de uma vez sem problema.

-- 1) Fecha a tabela para quem não está logado (o login usa a visão v_sso_usuarios, que não tem senha e continua funcionando).
drop policy if exists anon_read_user_status on gps_compartilhado.sge_central_usuarios;
revoke all on table gps_compartilhado.sge_central_usuarios from anon;

-- 2) Apaga as senhas guardadas nesta tabela. As senhas de verdade ficam no Supabase Auth.
alter table gps_compartilhado.sge_central_usuarios alter column senha_hash drop not null;
update gps_compartilhado.sge_central_usuarios set senha_hash = null where senha_hash is not null;

-- 3) Trava: mesmo que a tela antiga mande uma senha, ela é descartada antes de gravar.
create or replace function gps_compartilhado.sge_nao_guardar_senha()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.senha_hash := null;
  return new;
end;
$$;
revoke execute on function gps_compartilhado.sge_nao_guardar_senha() from public, anon, authenticated;

drop trigger if exists trg_nao_guardar_senha on gps_compartilhado.sge_central_usuarios;
create trigger trg_nao_guardar_senha
  before insert or update on gps_compartilhado.sge_central_usuarios
  for each row execute function gps_compartilhado.sge_nao_guardar_senha();

comment on column gps_compartilhado.sge_central_usuarios.senha_hash is
  'Desativada em 2026-10-08 (Fase 0 da Central de Acesso): senhas ficam só no Supabase Auth. Sempre nula.';

-- 4) Conferência: deve mostrar 0 senhas e nenhuma regra para anon.
select
  (select count(*) from gps_compartilhado.sge_central_usuarios where senha_hash is not null) as senhas_restantes,
  (select count(*) from pg_policies where schemaname = 'gps_compartilhado'
     and tablename = 'sge_central_usuarios' and 'anon' = any(roles)) as regras_para_anonimo;
