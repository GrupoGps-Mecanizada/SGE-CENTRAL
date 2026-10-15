-- Central v2.4.0 · 2026-10-15 · Tela "Usuários e acessos" enxerga os níveis
-- Problema: o site recebia erro 406 ao ler gps_compartilhado.acesso_permissoes
--           (a área gps_compartilhado não fica aberta para o site, só a public).
-- Correção: uma visão na public que mostra a mesma tabela. Com security_invoker,
--           valem as MESMAS regras (RLS) da tabela: cada um lê só o seu, só o ADMIN da Central grava,
--           e quem não tem login não vê nada. Visão simples: aceita inserir, mudar e apagar.
-- Pode rodar de novo sem problema.

create or replace view public.v_acesso_permissoes
with (security_invoker = true) as
select id, usuario_id, sistema_id, papel, ativo
from gps_compartilhado.acesso_permissoes;

comment on view public.v_acesso_permissoes is 'Tela Usuários e acessos da Central: mesma tabela gps_compartilhado.acesso_permissoes, com o RLS dela.';

revoke all on public.v_acesso_permissoes from anon, public;
grant select, insert, update, delete on public.v_acesso_permissoes to authenticated;
grant all on public.v_acesso_permissoes to service_role;

notify pgrst, 'reload schema';

-- Conferência: deve mostrar quantos acessos existem por nível (rodando aqui, como dono, vê tudo).
select papel, count(*) as acessos, count(*) filter (where ativo) as ativos
from public.v_acesso_permissoes
group by papel
order by papel;
