-- Portal SGE (2026-10-13, pedido do Warlison): o Hub antigo sai do ar e o Mapeamento de Atividades passa para o portal.
-- Cadastra o sistema (página sem login) e libera ADMIN para quem é ADMIN da Central (sge_hub). Os demais acessos são dados na tela de Usuários.
insert into gps_compartilhado.sge_central_sistemas (nome, slug, url_origem, is_active, icone, area_menu, ordem, descricao, mostrar_portal)
select 'Mapeamento de Atividades', 'mapeamento_atividades', 'https://grupogps-mecanizada.github.io/Mapeamento-Atividades/',
       true, 'clipboard', 'Operação', 6, 'Mapeamento das atividades da operação', true
where not exists (select 1 from gps_compartilhado.sge_central_sistemas where slug = 'mapeamento_atividades');

insert into gps_compartilhado.acesso_permissoes (usuario_id, sistema_id, papel, ativo)
select adm.usuario_id, s.id, 'ADMIN', true
from gps_compartilhado.sge_central_sistemas s
cross join (select distinct p.usuario_id from gps_compartilhado.acesso_permissoes p
            join gps_compartilhado.sge_central_sistemas c on c.id = p.sistema_id and c.slug = 'sge_hub'
            where p.papel = 'ADMIN' and p.ativo) adm
where s.slug = 'mapeamento_atividades'
  and not exists (select 1 from gps_compartilhado.acesso_permissoes p2 where p2.usuario_id = adm.usuario_id and p2.sistema_id = s.id);
