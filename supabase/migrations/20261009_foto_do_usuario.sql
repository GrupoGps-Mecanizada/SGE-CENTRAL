-- Foto do usuário (Barra Universal, sge-core 1.5): uma foto por pessoa, a mesma em todos os sistemas.
-- Guardada pequena (160 px, JPEG em data URL) no cadastro da Central; só a própria pessoa lê e troca, pelas funções abaixo.
alter table gps_compartilhado.sge_central_usuarios add column if not exists foto text;
comment on column gps_compartilhado.sge_central_usuarios.foto is 'Foto da pessoa (data:image/jpeg;base64, 160 px). Lida e trocada só pelas funções sge_minha_foto / sge_salvar_minha_foto.';

create or replace function public.sge_minha_foto()
returns text
language sql stable security definer set search_path = '' as $$
  select u.foto from gps_compartilhado.sge_central_usuarios u where u.id = (select auth.uid())
$$;

create or replace function public.sge_salvar_minha_foto(p_foto text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Entre no SGE para trocar a foto.' using errcode = '42501';
  end if;
  if p_foto is not null and (length(p_foto) > 200000 or p_foto !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$') then
    raise exception 'Foto inválida.' using errcode = '22023';
  end if;
  update gps_compartilhado.sge_central_usuarios set foto = p_foto where id = (select auth.uid());
end
$$;

revoke execute on function public.sge_minha_foto() from public, anon;
revoke execute on function public.sge_salvar_minha_foto(text) from public, anon;
grant execute on function public.sge_minha_foto() to authenticated, service_role;
grant execute on function public.sge_salvar_minha_foto(text) to authenticated, service_role;
