/**
 * CENTRAL SGE — Regras da tela "Usuários e acessos" (sem tela; testadas em testes/pessoas.test.js).
 * Junta usuários, acessos (acesso_permissoes) e setores numa linha por pessoa.
 */
'use strict';
(function (raiz) {
    const semAcento = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

    // Uma linha por pessoa: setores (siglas) e acessos ativos (sistema → nível).
    function montarPessoas(usuarios, acessos, usuarioSetores, setores) {
        const sigla = new Map((setores || []).map((s) => [s.id, s.sigla || s.nome || '?']));
        const porPessoa = new Map();
        (acessos || []).forEach((a) => {
            if (a.ativo === false) return;
            if (!porPessoa.has(a.usuario_id)) porPessoa.set(a.usuario_id, []);
            porPessoa.get(a.usuario_id).push({ sistema_id: a.sistema_id, papel: a.papel });
        });
        const setoresDe = new Map();
        (usuarioSetores || []).forEach((us) => {
            if (!setoresDe.has(us.usuario_id)) setoresDe.set(us.usuario_id, []);
            setoresDe.get(us.usuario_id).push(sigla.get(us.setor_id) || '?');
        });
        return (usuarios || []).map((u) => ({
            id: u.id,
            nome: u.nome || u.email || '?',
            email: u.email || '',
            ativo: u.is_active !== false,
            setores: (setoresDe.get(u.id) || []).sort(),
            acessos: porPessoa.get(u.id) || [],
            usuario: u,
        }));
    }

    // Quantas pessoas têm ao menos um acesso ativo em cada nível.
    function contarPorNivel(pessoas, codigos) {
        const conta = {};
        codigos.forEach((c) => { conta[c] = 0; });
        pessoas.forEach((p) => {
            new Set(p.acessos.map((a) => a.papel)).forEach((c) => { if (c in conta) conta[c]++; });
        });
        return conta;
    }

    // Busca por nome, e-mail ou setor (sem acento) e, se escolhido, só quem tem aquele nível.
    function filtrarPessoas(pessoas, termo, nivel) {
        const t = semAcento(termo).trim();
        return pessoas.filter((p) =>
            (!nivel || p.acessos.some((a) => a.papel === nivel)) &&
            (!t || semAcento(p.nome + ' ' + p.email + ' ' + p.setores.join(' ')).includes(t)));
    }

    // O que fazer no banco ao escolher um nível para um sistema ('' = Sem acesso).
    // acesso: a linha existente em acesso_permissoes (ativa ou não) ou null.
    function mudancaDeNivel(acesso, novo) {
        const ativo = !!acesso && acesso.ativo !== false;
        if (!novo) return ativo ? { tipo: 'desativar' } : null;
        if (!acesso) return { tipo: 'conceder', papel: novo };
        if (ativo && acesso.papel === novo) return null;
        return { tipo: 'atualizar', papel: novo };
    }

    function iniciais(nome) {
        const partes = String(nome || '').split('@')[0].split(/[\s._-]+/).filter(Boolean);
        if (!partes.length) return '?';
        return (partes.length === 1 ? partes[0].slice(0, 2) : partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
    }

    const api = { montarPessoas, contarPorNivel, filtrarPessoas, mudancaDeNivel, iniciais };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else raiz.SGE_PESSOAS = api;
})(typeof window !== 'undefined' ? window : globalThis);
