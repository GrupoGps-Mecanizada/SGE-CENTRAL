/**
 * CENTRAL SGE — Régua única de acesso (2026-10-13)
 * Os 6 níveis que valem em todos os sistemas do SGE.
 * Spec: D:/SEGUNDO CEREBRO - IDE/2 - Projetos/SGE/Departamentos/9 - Programação/Régua única de acesso - especificação.md
 */
'use strict';
(function (raiz) {
    const PAPEIS = [
        { codigo: 'ADMIN',      nome: 'Administrador', explica: 'Tudo no sistema: configurações, apagar e liberar acesso.' },
        { codigo: 'GESTOR',     nome: 'Gestor',        explica: 'Vê e edita tudo da operação, aprova e exporta. Não mexe em configuração.' },
        { codigo: 'SUPERVISOR', nome: 'Supervisor',    explica: 'Lança e edita só a própria equipe ou setor.' },
        { codigo: 'OPERADOR',   nome: 'Operador',      explica: 'Só lança registros novos, não apaga.' },
        { codigo: 'LEITURA',    nome: 'Leitura',       explica: 'Só consulta.' },
        { codigo: 'AUDITOR',    nome: 'Auditor',       explica: 'Consulta e vê o histórico de quem mudou o quê.' },
    ];
    const PAPEL_PADRAO = 'LEITURA';

    // Sistemas que já leem a régua direto (sge-core). Os outros usam o login antigo,
    // que recebe o nível traduzido pela visão v_sso_acesso. Acrescentar aqui a cada sistema migrado (Etapa C).
    const SISTEMAS_REGUA_NOVA = ['sst_mec', 'monitoramento_produtividade', 'mapeamento_atividades'];

    function papel(codigo) {
        return PAPEIS.find(p => p.codigo === codigo) || null;
    }

    // Mesma tradução da visão v_sso_acesso (para acessos dados por esta tela)
    function nomeNoSistemaAntigo(codigo, slug) {
        if (codigo === 'ADMIN') return 'ADM';
        if (codigo === 'GESTOR') return 'GESTAO';
        if (codigo === 'SUPERVISOR' && slug === 'controle_presenca_mec') return 'SUPERVISOR';
        return 'VISAO';
    }

    function aviso(codigo, slug) {
        if (SISTEMAS_REGUA_NOVA.includes(slug)) return '';
        if (codigo === 'LEITURA' || nomeNoSistemaAntigo(codigo, slug) !== 'VISAO') return '';
        return 'Neste sistema ainda vale como Leitura, até ele ser atualizado para a régua nova.';
    }

    // O admin não mexe no próprio acesso à Central (evita se trancar fora).
    // Sem saber quem está logado, trava todos os acessos à Central.
    function podeMexer(acesso, meuId) {
        if (acesso?.sistema?.slug !== 'sge_hub') return true;
        return !!meuId && acesso.usuario_id !== meuId;
    }

    const api = { PAPEIS, PAPEL_PADRAO, SISTEMAS_REGUA_NOVA, papel, nomeNoSistemaAntigo, aviso, podeMexer };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else raiz.SGE_REGUA = api;
})(typeof window !== 'undefined' ? window : globalThis);
