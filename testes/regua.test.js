'use strict';
// Testes da régua única de acesso. Rodar: node --test testes/
const test = require('node:test');
const assert = require('node:assert');
const R = require('../js/regua.js');

test('6 níveis na ordem da régua, com nome e explicação', () => {
    assert.deepStrictEqual(R.PAPEIS.map(p => p.codigo),
        ['ADMIN', 'GESTOR', 'SUPERVISOR', 'OPERADOR', 'LEITURA', 'AUDITOR']);
    assert.deepStrictEqual(R.PAPEIS.map(p => p.nome),
        ['Administrador', 'Gestor', 'Supervisor', 'Operador', 'Leitura', 'Auditor']);
    R.PAPEIS.forEach(p => assert.ok(p.explica.length > 5, p.codigo));
});

test('padrão ao conceder é o menor poder', () => {
    assert.strictEqual(R.PAPEL_PADRAO, 'LEITURA');
});

test('nomeNoSistemaAntigo segue a mesma tradução da visão v_sso_acesso', () => {
    assert.strictEqual(R.nomeNoSistemaAntigo('ADMIN', 'etilometro_mec'), 'ADM');
    assert.strictEqual(R.nomeNoSistemaAntigo('GESTOR', 'etilometro_mec'), 'GESTAO');
    assert.strictEqual(R.nomeNoSistemaAntigo('SUPERVISOR', 'controle_presenca_mec'), 'SUPERVISOR');
    assert.strictEqual(R.nomeNoSistemaAntigo('SUPERVISOR', 'etilometro_mec'), 'VISAO');
    assert.strictEqual(R.nomeNoSistemaAntigo('OPERADOR', 'controle_presenca_mec'), 'VISAO');
    assert.strictEqual(R.nomeNoSistemaAntigo('LEITURA', 'gestao_efetivo_mec'), 'VISAO');
    assert.strictEqual(R.nomeNoSistemaAntigo('AUDITOR', 'gestao_efetivo_mec'), 'VISAO');
});

test('aviso só quando o nível vira Leitura num sistema antigo', () => {
    assert.strictEqual(R.aviso('ADMIN', 'etilometro_mec'), '');
    assert.strictEqual(R.aviso('GESTOR', 'etilometro_mec'), '');
    assert.strictEqual(R.aviso('LEITURA', 'etilometro_mec'), '');
    assert.strictEqual(R.aviso('SUPERVISOR', 'controle_presenca_mec'), '');
    assert.match(R.aviso('SUPERVISOR', 'etilometro_mec'), /Leitura/);
    assert.match(R.aviso('OPERADOR', 'gestao_efetivo_mec'), /Leitura/);
    assert.match(R.aviso('AUDITOR', 'relatorio_turno_mec'), /Leitura/);
    assert.strictEqual(R.aviso('AUDITOR', 'sst_mec'), '');
    assert.strictEqual(R.aviso('OPERADOR', 'monitoramento_produtividade'), '');
});

test('podeMexer trava só o próprio acesso à Central', () => {
    const eu = 'u-1';
    assert.strictEqual(R.podeMexer({ usuario_id: eu, sistema: { slug: 'sge_hub' } }, eu), false);
    assert.strictEqual(R.podeMexer({ usuario_id: eu, sistema: { slug: 'etilometro_mec' } }, eu), true);
    assert.strictEqual(R.podeMexer({ usuario_id: 'u-2', sistema: { slug: 'sge_hub' } }, eu), true);
    assert.strictEqual(R.podeMexer({ usuario_id: eu, sistema: { slug: 'sge_hub' } }, null), false);
});

test('nível desconhecido não quebra', () => {
    assert.strictEqual(R.papel('XYZ'), null);
    assert.strictEqual(R.papel('GESTOR').nome, 'Gestor');
});
