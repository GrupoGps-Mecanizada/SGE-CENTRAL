# Régua única de acesso: Etapa B (tela da Central). Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A tela "Configuração de Usuário" da Central passa a dar acesso pelos 6 níveis da régua, gravando em `gps_compartilhado.acesso_permissoes` (fonte única desde a Etapa A).

**Architecture:** Um arquivo novo `js/regua.js` com a lista de níveis e as regras puras (testadas com `node --test`, sem instalar nada). Em `js/api.js`, as 5 funções de acesso trocam de tabela. Em `js/app.js`, o seletor de perfil vira o seletor de nível, com explicação e aviso.

**Spec:** `D:/SEGUNDO CEREBRO - IDE/2 - Projetos/SGE/Departamentos/9 - Programação/Régua única de acesso - especificação.md` (seções 1 e 4-B)

## Global Constraints
- Níveis e textos exatamente como na spec, seção 1.
- Nível padrão ao conceder: **Leitura** (o menor poder). Hoje o padrão é o primeiro da lista, que é SUPER.
- O administrador não consegue mudar, desativar nem revogar o **próprio** acesso à Central (`sge_hub`), para não se trancar fora.
- A tabela antiga não é mais gravada pela tela. Nada é apagado.
- Publicar (merge em `main` e push) só com o OK do Warlison.

## Review Focus
1. O admin rebaixa o próprio acesso à Central e perde o painel. Coberto por `podeMexer` (teste).
2. Nível novo em sistema antigo dá mais poder do que deveria. O aviso segue a mesma tradução da visão (teste `nomeNoSistemaAntigo`).
3. Nome de sistema com HTML. Escapar nome e slug na lista.
4. Nível desconhecido vindo do banco quebra o seletor. Mostrar o código cru como opção selecionada.
5. Clique em "Conceder" sem escolher o sistema. Já barrado ("Selecione um sistema").

### Task 1: `js/regua.js` + testes
- [ ] Escrever `testes/regua.test.js` (node:test) cobrindo: 6 níveis na ordem; `nomeNoSistemaAntigo` igual à visão (ADMIN→ADM, GESTOR→GESTAO, SUPERVISOR→SUPERVISOR só na Presença, resto→VISAO); `aviso` vazio para ADMIN/GESTOR/LEITURA e para sistemas da régua nova; `podeMexer` falso só para o próprio acesso ao `sge_hub`.
- [ ] `node --test testes/` → FAIL (arquivo não existe).
- [ ] Escrever `js/regua.js` (expõe `window.SGE_REGUA` e `module.exports`).
- [ ] `node --test testes/` → PASS.

### Task 2: `js/api.js`, `js/app.js` e `index.html`
- [ ] api.js: `fetchUserAccess`, `grantSystemAccess(userId, sistemaId, papel)`, `revokeSystemAccess`, `updateAccessProfile(accessId, papel)` e `toggleAccessActive` passam a usar `acesso_permissoes` (`papel`, `ativo`). Nova função `getMeuId()`.
- [ ] app.js: seletor com `SGE_REGUA.PAPEIS`, explicação do nível escolhido, aviso de sistema antigo, padrão Leitura, trava do próprio `sge_hub`, nome e slug escapados.
- [ ] index.html: carregar `js/regua.js` antes do `app.js` e subir as versões (`?v=`).
- [ ] Conferir no banco (somente leitura) que o select da nova `fetchUserAccess` funciona com o nome da chave `acesso_permissoes_sistema_id_fkey`.
- [ ] `node --test testes/` → PASS. `node --check` nos 3 arquivos JS.
- [ ] Commit no ramo `regua-unica`.

### Task 3: Publicar (só com OK) e testar
- [ ] Merge em `main` e push (GitHub Pages).
- [ ] Warlison abre a Central → Usuários → um colaborador: vê os níveis em português, troca um nível de teste e volta, e confere no sistema daquele colaborador.
- [ ] Registrar no CHANGELOG, no plano do cofre e no Histórico.
