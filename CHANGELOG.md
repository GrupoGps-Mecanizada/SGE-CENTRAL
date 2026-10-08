# Mudanças da SGE Central

## v2.0.0 · 2026-10-08 · Central de Acesso (Fases 0 a 2)
Plano: `D:/SEGUNDO CEREBRO - IDE/2 - Projetos/SGE/Departamentos/9 - Programação/Plano da Central de Acesso.md`

**Banco (aplicado no SQL Editor; arquivos em `supabase/migrations/`)**
- Tabela de usuários fechada para quem não está logado; senhas que estavam gravadas foram apagadas e a tabela não guarda mais senha.
- Permissões no modelo do SST (`acesso_permissoes`: papel, telas, colunas, setores, aprovação), histórico com antes/depois (`acesso_auditoria`) e funções `acesso_priv.*`.
- Só o ADMIN da Central grava usuários, acessos, setores, perfis e sistemas. `secret_key` dos sistemas apagadas.
- Só nasce login com e-mail `@gestaogps.com.br`, `@gpssa.com.br` ou a exceção `warlison@sge.com` (gancho Before User Created).

**Servidor**
- Nova Edge Function `acesso-usuarios`: cria login com senha provisória, redefine senha, bloqueia de verdade (no login) e libera a troca de senha.

**Telas**
- Novo usuário: sem campo de senha, com setor; a senha provisória aparece uma vez, com "Copiar mensagem para WhatsApp".
- Botão "Redefinir senha" na ficha do usuário.
- "Bloquear" agora bloqueia também no login (antes só marcava na tabela).
- Login: obriga a criar a senha própria no primeiro acesso; só devolve a pessoa para endereços do SGE.
