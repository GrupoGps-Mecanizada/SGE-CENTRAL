/**
 * CENTRAL SGE — Tela "Usuários e acessos" (modelo do SST, 2026-10-15).
 * Cartões dos 6 níveis, lista de pessoas e gaveta lateral com o nível da pessoa em cada sistema.
 * Regras sem tela em js/pessoas.js; níveis em js/regua.js. Grava em gps_compartilhado.acesso_permissoes.
 */
'use strict';

const acessosTela = { pessoas: [], acessos: [], setoresPorPessoa: {}, termo: '', nivel: '', aberta: null, meuId: null };

async function loadUsers() {
    try {
        const [usuarios, acessos, usuarioSetores, meuId] = await Promise.all([
            window.SGE_API.fetchAllUsers(),
            window.SGE_API.fetchAllAccess(),
            window.SGE_API.fetchAllUserSectors(),
            window.SGE_API.getMeuId(),
        ]);
        acessosTela.acessos = acessos;
        acessosTela.meuId = meuId;
        acessosTela.setoresPorPessoa = {};
        usuarioSetores.forEach((us) => (acessosTela.setoresPorPessoa[us.usuario_id] ||= []).push(us.setor_id));
        acessosTela.pessoas = window.SGE_PESSOAS.montarPessoas(usuarios, acessos, usuarioSetores, _allSectors);
        desenharNiveis();
        desenharPessoas();
        if (acessosTela.aberta) desenharGaveta();
    } catch (e) {
        console.error('Usuários:', e);
        sgeToast('error', 'Não consegui carregar os usuários. Confira a internet e tente de novo.');
    }
}

// Quem chama de fora (ex.: chamado "pedir acesso") abre a pessoa direto.
function openUserConfig(user) {
    switchPanel('users');
    abrirPessoa(user.id);
}

function nomeDoSistema(id) {
    const s = _allSystems.find((x) => String(x.id) === String(id));
    return s ? s.nome : '?';
}

function desenharNiveis() {
    const R = window.SGE_REGUA;
    const conta = window.SGE_PESSOAS.contarPorNivel(acessosTela.pessoas, R.PAPEIS.map((p) => p.codigo));
    const caixa = document.getElementById('acessos-niveis');
    caixa.innerHTML = R.PAPEIS.map((p) => `
        <button type="button" class="nivel-cartao" data-nivel="${p.codigo}" aria-pressed="${acessosTela.nivel === p.codigo}"
            title="Mostrar só quem tem o nível ${escapeHtml(p.nome)}">
            <span class="nivel-topo">
                <strong>${escapeHtml(p.nome)}</strong>
                <span class="nivel-conta">${conta[p.codigo]} pessoa(s)</span>
            </span>
            <span class="nivel-explica">${escapeHtml(p.explica)}</span>
        </button>`).join('');
    caixa.querySelectorAll('.nivel-cartao').forEach((b) => b.addEventListener('click', () => {
        acessosTela.nivel = acessosTela.nivel === b.dataset.nivel ? '' : b.dataset.nivel;
        desenharNiveis();
        desenharPessoas();
    }));
}

function desenharPessoas() {
    const tbody = document.getElementById('table-users');
    const lista = window.SGE_PESSOAS.filtrarPessoas(acessosTela.pessoas, acessosTela.termo, acessosTela.nivel);
    const resumo = document.getElementById('acessos-resumo');
    if (resumo) {
        const filtro = acessosTela.nivel ? ` · nível ${window.SGE_REGUA.papel(acessosTela.nivel)?.nome}` : '';
        resumo.textContent = `${lista.length} de ${acessosTela.pessoas.length} pessoa(s)${filtro} · clique numa pessoa para mudar os acessos`;
    }
    if (!lista.length) {
        tbody.innerHTML = `<tr><td colspan="4" class="table-empty"><div class="table-empty-inner">${emptyStateSVG()}
            <span>${acessosTela.pessoas.length ? 'Ninguém encontrado com esse filtro' : 'Nenhum usuário cadastrado'}</span></div></td></tr>`;
        return;
    }
    tbody.innerHTML = '';
    lista.forEach((p) => {
        const nomes = p.acessos.map((a) => nomeDoSistema(a.sistema_id)).sort((a, b) => a.localeCompare(b, 'pt-BR'));
        const tr = document.createElement('tr');
        tr.className = 'linha-pessoa';
        tr.dataset.id = p.id;
        tr.tabIndex = 0;
        tr.innerHTML = `
            <td>
                <div class="pessoa">
                    <span class="pessoa-avatar">${escapeHtml(window.SGE_PESSOAS.iniciais(p.nome))}</span>
                    <span class="pessoa-texto"><strong>${escapeHtml(p.nome)}</strong><small>${escapeHtml(p.email)}</small></span>
                </div>
            </td>
            <td>${p.setores.length ? p.setores.map((s) => `<span class="setor-mini">${escapeHtml(s)}</span>`).join(' ') : '<span class="texto-fraco">—</span>'}</td>
            <td>${nomes.length
                ? `<strong>${nomes.length}</strong> <span class="texto-fraco nomes-sis" title="${escapeHtml(nomes.join(', '))}">${escapeHtml(nomes.slice(0, 2).join(', '))}${nomes.length > 2 ? ` +${nomes.length - 2}` : ''}</span>`
                : '<span class="texto-fraco">Nenhum</span>'}</td>
            <td><span class="status-badge ${p.ativo ? 'active' : 'blocked'}">${p.ativo ? 'Liberado' : 'Bloqueado'}</span></td>`;
        const abrir = () => abrirPessoa(p.id);
        tr.addEventListener('click', abrir);
        tr.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); abrir(); } });
        tbody.appendChild(tr);
    });
}

// ── Gaveta lateral da pessoa ─────────────────────────────

function abrirPessoa(id) {
    acessosTela.aberta = id;
    desenharGaveta();
    const fundo = document.getElementById('gaveta-pessoa');
    fundo.hidden = false;
    document.body.classList.add('com-gaveta');
    fundo.querySelector('.gaveta-fechar')?.focus();
}

function fecharGaveta() {
    const fundo = document.getElementById('gaveta-pessoa');
    if (fundo.hidden) return;
    fundo.hidden = true;
    document.body.classList.remove('com-gaveta');
    const id = acessosTela.aberta;
    acessosTela.aberta = null;
    const linha = [...document.querySelectorAll('.linha-pessoa')].find((tr) => tr.dataset.id === id);
    if (linha) linha.focus();
}

function desenharGaveta() {
    const R = window.SGE_REGUA;
    const p = acessosTela.pessoas.find((x) => x.id === acessosTela.aberta);
    const fundo = document.getElementById('gaveta-pessoa');
    if (!p) { fecharGaveta(); return; }

    const linhaDe = (sistemaId) => acessosTela.acessos.find((a) => a.usuario_id === p.id && a.sistema_id === sistemaId) || null;
    const sistemas = [..._allSystems].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    const meusSetores = usuarioSetoresDe(p.id);
    const setoresLivres = _allSectors.filter((s) => !meusSetores.includes(s));

    const linhasSistemas = sistemas.map((s) => {
        const a = linhaDe(s.id);
        const atual = a && a.ativo !== false ? a.papel : '';
        const trava = R.podeMexer({ sistema: { slug: s.slug }, usuario_id: p.id }, acessosTela.meuId) ? '' : 'disabled';
        const opcoes = ['<option value="">Sem acesso</option>']
            .concat(R.PAPEIS.map((x) => `<option value="${x.codigo}" ${x.codigo === atual ? 'selected' : ''}>${x.nome}</option>`));
        if (atual && !R.papel(atual)) opcoes.splice(1, 0, `<option value="${escapeHtml(atual)}" selected>${escapeHtml(atual)}</option>`);
        return `
            <div class="sis-linha ${atual ? 'tem' : ''}">
                <div class="sis-nome">
                    <strong>${escapeHtml(s.nome)}</strong>
                    ${s.is_active === false ? '<small class="texto-fraco">sistema desligado</small>' : ''}
                    ${trava ? '<small class="texto-fraco">seu próprio acesso à Central não muda por aqui</small>' : ''}
                </div>
                <select class="sis-nivel" data-sistema="${s.id}" data-slug="${escapeHtml(s.slug)}" aria-label="Nível em ${escapeHtml(s.nome)}" ${trava}>
                    ${opcoes.join('')}
                </select>
                <p class="sis-nota">${notaDoNivel(atual, s.slug)}</p>
            </div>`;
    }).join('');

    fundo.innerHTML = `
        <aside class="gaveta" role="dialog" aria-modal="true" aria-labelledby="gaveta-titulo">
            <header class="gaveta-cabeca">
                <span class="pessoa-avatar grande">${escapeHtml(window.SGE_PESSOAS.iniciais(p.nome))}</span>
                <div class="gaveta-quem">
                    <h3 id="gaveta-titulo">${escapeHtml(p.nome)}</h3>
                    <small>${escapeHtml(p.email)}</small>
                    <span class="status-badge ${p.ativo ? 'active' : 'blocked'}">${p.ativo ? 'Liberado' : 'Bloqueado'}</span>
                </div>
                <button type="button" class="gaveta-fechar" aria-label="Fechar">✕</button>
            </header>
            <div class="gaveta-acoes">
                <button type="button" class="btn-secondary btn-sm" id="g-senha" title="Gera uma senha provisória nova">Redefinir senha</button>
                <button type="button" class="btn-sm ${p.ativo ? 'btn-danger' : 'btn-primary'}" id="g-bloquear">${p.ativo ? 'Bloquear em todos os sistemas' : 'Liberar de novo'}</button>
            </div>
            <section class="gaveta-secao">
                <h4>Acesso aos sistemas</h4>
                <p class="texto-fraco">Escolha o nível em cada sistema. "Sem acesso" tira a pessoa daquele sistema. Vale na hora.</p>
                <div class="sis-lista">${linhasSistemas || '<p class="texto-fraco">Nenhum sistema cadastrado.</p>'}</div>
            </section>
            <section class="gaveta-secao">
                <h4>Setores</h4>
                <div class="setores-pessoa">${meusSetores.length
                    ? meusSetores.map((s) => `
                        <span class="sector-tag"><strong>${escapeHtml(s.sigla || '?')}</strong>&nbsp;${escapeHtml(s.nome || '')}
                        <button type="button" class="remove-sector" data-setor-id="${s.id}" aria-label="Tirar o setor ${escapeHtml(s.sigla || '')}">×</button></span>`).join('')
                    : '<span class="texto-fraco">Nenhum setor</span>'}</div>
                ${setoresLivres.length ? `
                <div class="grant-row">
                    <select id="g-setor" aria-label="Setor para acrescentar">
                        <option value="">Acrescentar setor…</option>
                        ${setoresLivres.map((s) => `<option value="${s.id}">${escapeHtml(s.sigla)} — ${escapeHtml(s.nome)}</option>`).join('')}
                    </select>
                    <button type="button" class="btn-primary btn-sm" id="g-add-setor">Acrescentar</button>
                </div>` : ''}
            </section>
        </aside>`;

    fundo.querySelector('.gaveta-fechar').addEventListener('click', fecharGaveta);
    fundo.querySelector('#g-senha').addEventListener('click', () => resetUserPassword(p.usuario));
    fundo.querySelector('#g-bloquear').addEventListener('click', () => toggleUserStatus(p.id, p.ativo));
    fundo.querySelectorAll('.sis-nivel').forEach((sel) => sel.addEventListener('change', () => mudarNivel(p, sel)));
    fundo.querySelectorAll('.remove-sector').forEach((b) => b.addEventListener('click', () => tirarSetor(p, b.dataset.setorId)));
    fundo.querySelector('#g-add-setor')?.addEventListener('click', () => acrescentarSetor(p, fundo.querySelector('#g-setor').value));
}

function notaDoNivel(codigo, slug) {
    const R = window.SGE_REGUA;
    if (!codigo) return '';
    const p = R.papel(codigo);
    const av = R.aviso(codigo, slug);
    return (p ? escapeHtml(p.explica) : '') + (av ? ` <span class="nota-aviso">${escapeHtml(av)}</span>` : '');
}

// Setores completos da pessoa (sigla e nome) a partir dos ids guardados.
function usuarioSetoresDe(id) {
    const ids = acessosTela.setoresPorPessoa[id] || [];
    return _allSectors.filter((s) => ids.includes(s.id));
}

async function mudarNivel(p, sel) {
    const sistemaId = sel.dataset.sistema;
    const acesso = acessosTela.acessos.find((a) => a.usuario_id === p.id && String(a.sistema_id) === String(sistemaId)) || null;
    const mudanca = window.SGE_PESSOAS.mudancaDeNivel(acesso, sel.value);
    if (!mudanca) return;
    sel.disabled = true;
    try {
        if (mudanca.tipo === 'conceder') await window.SGE_API.grantSystemAccess(p.id, sistemaId, mudanca.papel);
        else if (mudanca.tipo === 'atualizar') await window.SGE_API.setAccessLevel(acesso.id, mudanca.papel);
        else await window.SGE_API.toggleAccessActive(acesso.id, false);
        await window.SGE_API.insertAuditLog(
            mudanca.tipo === 'conceder' ? 'CONCEDER_ACESSO_SISTEMA' : mudanca.tipo === 'atualizar' ? 'ALTERAR_PERFIL_ACESSO' : 'DESATIVAR_ACESSO',
            { usuario_id: p.id, sistema_id: sistemaId, papel: mudanca.papel || null });
        sgeToast('success', mudanca.tipo === 'desativar'
            ? `${p.nome} saiu de ${nomeDoSistema(sistemaId)}.`
            : `${p.nome}: ${window.SGE_REGUA.papel(mudanca.papel)?.nome || mudanca.papel} em ${nomeDoSistema(sistemaId)}.`);
        loadAuditLogs();
    } catch (err) {
        sgeToast('error', 'Não consegui salvar o nível: ' + err.message);
    }
    await loadUsers(); // redesenha a lista e a gaveta com o que ficou no banco
}

async function acrescentarSetor(p, setorId) {
    if (!setorId) { sgeToast('warning', 'Escolha um setor.'); return; }
    try {
        await window.SGE_API.addUserSector(p.id, setorId);
        await window.SGE_API.insertAuditLog('ADICIONAR_SETOR_USUARIO', { usuario_id: p.id, setor_id: setorId });
        sgeToast('success', 'Setor acrescentado.');
        loadAuditLogs();
    } catch (err) { sgeToast('error', err.message); }
    await loadUsers();
}

async function tirarSetor(p, setorId) {
    if (!await sgeConfirm('Tirar este setor da pessoa?', 'Tirar')) return;
    try {
        await window.SGE_API.removeUserSector(p.id, setorId);
        await window.SGE_API.insertAuditLog('REMOVER_SETOR_USUARIO', { usuario_id: p.id, setor_id: setorId });
        sgeToast('success', 'Setor retirado.');
        loadAuditLogs();
    } catch (err) { sgeToast('error', err.message); }
    await loadUsers();
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('search-users')?.addEventListener('input', (ev) => {
        acessosTela.termo = ev.target.value;
        desenharPessoas();
    });
    const fundo = document.getElementById('gaveta-pessoa');
    fundo?.addEventListener('click', (ev) => { if (ev.target === fundo) fecharGaveta(); });
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') fecharGaveta(); });
});
