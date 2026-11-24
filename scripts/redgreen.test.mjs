import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), 'conselho.mjs');

function rodarCli(args, env = process.env) {
  return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env });
}

test('e2e --exigir-falha-base: bloqueia sem teste, bloqueia FALSO VERDE, bloqueia falha no HEAD e aprova Red->Green real', () => {
  const d = mkdtempSync(join(tmpdir(), 'conselho-rg-e2e-'));
  const g = (...args) => {
    const r = spawnSync('git', ['-C', d, ...args], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout;
  };
  try {
    g('init', '-q');
    g('config', 'user.email', 't@example.com');
    g('config', 'user.name', 'Tester');

    // Revisores fake locais (processos node instantâneos, zero cota de IA)
    const revPath = join(tmpdir(), `rev-rg-${Date.now()}.json`);
    writeFileSync(revPath, JSON.stringify([
      {
        nome: 'jedy-mock',
        lente: 'ordem',
        cmd: process.execPath,
        args: ['-e', 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{console.log(s.includes("PROVA RED -> GREEN EXECUTADA")?"1. [BAIXA] auth.mjs:1 - prova presente\\nVEREDITO: APROVA":"VEREDITO: REPROVA");})'],
        entrada: 'stdin',
        maxChars: 100000,
      },
      {
        nome: 'sith-mock',
        lente: 'ruptura',
        cmd: process.execPath,
        args: ['-e', 'process.stdin.resume();process.stdin.on("end",()=>console.log("VEREDITO: APROVA"))'],
        entrada: 'stdin',
        maxChars: 100000,
      },
    ]));

    try {
      // Commit 1 (base vulnerável): libera tudo sem checar papel
      writeFileSync(join(d, 'auth.mjs'), 'export function podeAcessar(papel) { return true; }\n');
      g('add', 'auth.mjs');
      g('commit', '-q', '-m', 'base vulneravel');

      // Caso 1: commit sem arquivo de teste -> exit 7
      writeFileSync(join(d, 'auth.mjs'), 'export function podeAcessar(papel) { return papel === "admin"; }\n');
      g('add', 'auth.mjs');
      g('commit', '-q', '-m', 'fix sem teste');

      let r = rodarCli(['--repo', d, '--rev', 'HEAD', '--revisores', revPath, '--exigir-falha-base', '--teste-cmd', `"${process.execPath}" --test`]);
      assert.equal(r.status, 7, r.stderr);
      assert.match(r.stderr, /nenhum arquivo de teste/);

      // Caso 2: FALSO VERDE (teste tautológico que já passa na base sem o fix!) -> exit 7
      writeFileSync(join(d, 'auth.test.mjs'), [
        'import { test } from "node:test";',
        'import assert from "node:assert/strict";',
        'import { podeAcessar } from "./auth.mjs";',
        'test("falso verde: só testa admin", () => { assert.equal(podeAcessar("admin"), true); });',
      ].join('\n') + '\n');
      g('add', 'auth.test.mjs');
      g('commit', '-q', '--amend', '-m', 'fix com teste tautologico');

      r = rodarCli(['--repo', d, '--rev', 'HEAD', '--revisores', revPath, '--exigir-falha-base', '--teste-cmd', `"${process.execPath}" --test auth.test.mjs`]);
      assert.equal(r.status, 7, r.stderr);
      assert.match(r.stderr, /FALSO VERDE/);

      // Caso 3: Teste falha na base E também falha no HEAD -> exit 7
      writeFileSync(join(d, 'auth.test.mjs'), [
        'import { test } from "node:test";',
        'import assert from "node:assert/strict";',
        'import { podeAcessar } from "./auth.mjs";',
        'test("quebrado em ambos", () => { assert.equal(podeAcessar("admin"), false); });',
      ].join('\n') + '\n');
      g('add', 'auth.test.mjs');
      g('commit', '-q', '--amend', '-m', 'fix com teste quebrado');

      r = rodarCli(['--repo', d, '--rev', 'HEAD', '--revisores', revPath, '--exigir-falha-base', '--teste-cmd', `"${process.execPath}" --test auth.test.mjs`]);
      assert.equal(r.status, 7, r.stderr);
      assert.match(r.stderr, /CONTINUA FALHANDO no código corrigido/);

      // Caso 4: Prova Red -> Green legítima -> exit 0 + evidência entregue aos anciões!
      writeFileSync(join(d, 'auth.test.mjs'), [
        'import { test } from "node:test";',
        'import assert from "node:assert/strict";',
        'import { podeAcessar } from "./auth.mjs";',
        'test("visitante bloqueado", () => { assert.equal(podeAcessar("guest"), false); });',
      ].join('\n') + '\n');
      g('add', 'auth.test.mjs');
      g('commit', '-q', '--amend', '-m', 'fix com prova red-green real');

      r = rodarCli(['--repo', d, '--rev', 'HEAD', '--revisores', revPath, '--exigir-falha-base', '--teste-cmd', `"${process.execPath}" --test auth.test.mjs`]);
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stderr, /prova Red -> Green OK/);
      assert.match(r.stdout, /jedy-mock -> VEREDITO: APROVA/);
      assert.match(r.stdout, /Vereditos IGUAIS/);

      // Confirma limpeza integral de worktrees descartáveis
      const wts = g('worktree', 'list', '--porcelain').split(/\r?\n/).filter((l) => l.startsWith('worktree '));
      assert.equal(wts.length, 1, 'nenhum worktree temporário pode sobrar');
    } finally {
      rmSync(revPath, { force: true });
    }
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test('aviso automático quando diff toca superfície sensível sem --exigir-falha-base', () => {
  const d = mkdtempSync(join(tmpdir(), 'conselho-sec-warn-'));
  const g = (...args) => spawnSync('git', ['-C', d, ...args], { encoding: 'utf8' });
  try {
    g('init', '-q');
    g('config', 'user.email', 't@example.com');
    g('config', 'user.name', 'Tester');
    writeFileSync(join(d, 'login.js'), 'export const x = 1;\n');
    g('add', 'login.js');
    g('commit', '-q', '-m', 'init');
    writeFileSync(join(d, 'login.js'), 'export function validarJwtPermissao() { return true; }\n');
    g('add', 'login.js');
    g('commit', '-q', '-m', 'auth change');

    const r = rodarCli(['--repo', d, '--rev', 'HEAD', '--dry-run']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /AVISO: diff toca superfície de segurança/);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});
