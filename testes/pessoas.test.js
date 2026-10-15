'use strict';
// Testes da tela "Usuários e acessos". Rodar: node --test testes/
const test = require('node:test');
const assert = require('node:assert');
const P = require('../js/pessoas.js');

const usuarios = [
    { id: 'u1', nome: 'Ana Souza', email: 'ana@gpssa.com.br', is_active: true },
    { id: 'u2', nome: 'José Brito', email: 'jose@gestaogps.com.br', is_active: false },
];
const acessos = [
    { usuario_id: 'u1', sistema_id: 's1', papel: 'GESTOR', ativo: true },
    { usuario_id: 'u1', sistema_id: 's2', papel: 'GESTOR', ativo: true },
    { usuario_id: 'u1', sistema_id: 's3', papel: 'LEITURA', ativo: false },
    { usuario_id: 'u2', sistema_id: 's1', papel: 'SUPERVISOR', ativo: true },
];
const setores = [{ id: 10, sigla: 'ADM' }, { id: 11, sigla: 'OPE' }];
const usuarioSetores = [{ usuario_id: 'u1', setor_id: 11 }, { usuario_id: 'u1', setor_id: 10 }];

test('uma linha por pessoa, com setores e só os acessos ativos', () => {
    const [ana, jose] = P.montarPessoas(usuarios, acessos, usuarioSetores, setores);
    assert.deepStrictEqual(ana.setores, ['ADM', 'OPE']);
    assert.strictEqual(ana.acessos.length, 2);
    assert.strictEqual(ana.ativo, true);
    assert.strictEqual(jose.ativo, false);
    assert.deepStrictEqual(jose.setores, []);
});

test('cartões contam pessoas por nível, sem repetir a mesma pessoa', () => {
    const pessoas = P.montarPessoas(usuarios, acessos, usuarioSetores, setores);
    const c = P.contarPorNivel(pessoas, ['GESTOR', 'SUPERVISOR', 'LEITURA']);
    assert.deepStrictEqual(c, { GESTOR: 1, SUPERVISOR: 1, LEITURA: 0 });
});

test('busca sem acento por nome, e-mail ou setor, e filtro por nível', () => {
    const pessoas = P.montarPessoas(usuarios, acessos, usuarioSetores, setores);
    assert.deepStrictEqual(P.filtrarPessoas(pessoas, 'jose', '').map((p) => p.id), ['u2']);
    assert.deepStrictEqual(P.filtrarPessoas(pessoas, 'ope', '').map((p) => p.id), ['u1']);
    assert.deepStrictEqual(P.filtrarPessoas(pessoas, '', 'SUPERVISOR').map((p) => p.id), ['u2']);
    assert.strictEqual(P.filtrarPessoas(pessoas, '', '').length, 2);
});

test('trocar o nível de um sistema vira a ação certa no banco', () => {
    assert.deepStrictEqual(P.mudancaDeNivel(null, 'GESTOR'), { tipo: 'conceder', papel: 'GESTOR' });
    assert.strictEqual(P.mudancaDeNivel(null, ''), null);
    assert.deepStrictEqual(P.mudancaDeNivel({ papel: 'GESTOR', ativo: true }, ''), { tipo: 'desativar' });
    assert.strictEqual(P.mudancaDeNivel({ papel: 'GESTOR', ativo: false }, ''), null);
    assert.strictEqual(P.mudancaDeNivel({ papel: 'GESTOR', ativo: true }, 'GESTOR'), null);
    assert.deepStrictEqual(P.mudancaDeNivel({ papel: 'GESTOR', ativo: true }, 'LEITURA'), { tipo: 'atualizar', papel: 'LEITURA' });
    // acesso desativado volta com o nível escolhido (a linha já existe: não cria outra)
    assert.deepStrictEqual(P.mudancaDeNivel({ papel: 'GESTOR', ativo: false }, 'GESTOR'), { tipo: 'atualizar', papel: 'GESTOR' });
});

test('iniciais do avatar', () => {
    assert.strictEqual(P.iniciais('Ana Souza'), 'AS');
    assert.strictEqual(P.iniciais('icaro@sge.com'), 'IC');
    assert.strictEqual(P.iniciais(''), '?');
});
