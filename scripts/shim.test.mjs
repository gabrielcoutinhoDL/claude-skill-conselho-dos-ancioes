import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main, carregarRevisores, envDoAnciao } from './conselho.mjs';
import { runCli, resolverComando } from './lib.mjs';

async function capturar(fn) {
  const so = process.stdout.write.bind(process.stdout), se = process.stderr.write.bind(process.stderr);
  const lo = console.log, le = console.error;
  const out = [], err = [];
  process.stdout.write = (c) => { out.push(String(c)); return true; };
  process.stderr.write = (c) => { err.push(String(c)); return true; };
  console.log = (...x) => out.push(x.join(' ') + '\n');
  console.error = (...x) => err.push(x.join(' ') + '\n');
  try { const r = await fn(); return { r, out: out.join(''), err: err.join('') }; }
  finally { process.stdout.write = so; process.stderr.write = se; console.log = lo; console.error = le; }
}

const NODE = process.execPath;
const SEM_LOG = { logCall: () => {} };
const ARGS = ['--texto', 'material de teste', '--pedido', 'p'];

function config(lista) {
  const d = mkdtempSync(join(tmpdir(), 'conselho-cfg-'));
  const f = join(d, 'revisores.json');
  writeFileSync(f, JSON.stringify(lista));
  return { f, limpar: () => rmSync(d, { recursive: true, force: true }) };
}

test('resolverComando: shim .cmd do npm no Windows; exe direto; fora do Windows nada muda', () => {
  const where = (saida) => () => ({ status: 0, stdout: saida });
  assert.deepEqual(resolverComando('gemini', 'win32', where('C:\\n\\gemini\r\nC:\\n\\gemini.cmd\r\n')), { file: 'C:\\n\\gemini.cmd', shim: true });
  assert.deepEqual(resolverComando('git', 'win32', where('C:\\g\\git.exe\r\n')), { file: 'C:\\g\\git.exe', shim: false });
  assert.deepEqual(resolverComando('x.cmd', 'win32', () => assert.fail()), { file: 'x.cmd', shim: true });
  assert.deepEqual(resolverComando('nada', 'win32', () => ({ status: 1, stdout: '' })), { file: 'nada', shim: false });
  assert.deepEqual(resolverComando('gemini', 'linux', () => assert.fail()), { file: 'gemini', shim: false });
});

test('runCli: shim .cmd recusa entrada por argumento e caracteres especiais (cmd.exe)', async () => {
  const comum = { plat: 'win32', run: () => ({ status: 0, stdout: 'C:\\n\\x.cmd\r\n' }), prompt: 'p', timeoutMs: 5000 };
  const a = await runCli({ cmd: 'x', args: ['{prompt}'], entrada: 'arg', ...comum });
  assert.equal(a.code, 127); assert.match(a.err, /shim \.cmd/);
  for (const ruim of ['a & calc', 'a | b', '"x"', 'a>b', '%PATH%', 'a^b']) {
    const r = await runCli({ cmd: 'x', args: ['-p', ruim], entrada: 'stdin', ...comum });
    assert.equal(r.code, 127, `deveria recusar: ${ruim}`);
  }
});

test('runCli: shim .cmd real no Windows (como o gemini do npm), prompt por stdin', { skip: process.platform !== 'win32' }, async () => {
  const d = mkdtempSync(join(tmpdir(), 'conselho-shim-'));
  try {
    writeFileSync(join(d, 'x.js'),
      "let b='';process.stdin.on('data',x=>b+=x).on('end',()=>{console.log('ok '+process.argv.slice(2).join('|')+'\\nVEREDITO: '+(b.includes('<<<MATERIAL-')?'APROVA':'REPROVA'))})");
    writeFileSync(join(d, 'fake-gemini.cmd'), `@echo off\r\n"${NODE}" "%~dp0x.js" %*\r\n`);
    const r = await runCli({ cmd: join(d, 'fake-gemini.cmd'), args: ['-m', 'modelo-x', '-p', 'Responda ao conteudo recebido por stdin.'], entrada: 'stdin', prompt: '<<<MATERIAL-abc dados', timeoutMs: 30000 });
    assert.equal(r.code, 0, r.err); assert.match(r.out, /VEREDITO: APROVA/);
    assert.match(r.out, /-m\|modelo-x\|-p\|Responda ao conteudo recebido por stdin\./);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('envDoAnciao e definirEnv: copia de outra variável, sem valores no JSON', () => {
  const env = { GEMINI_FREE_KEY: 'chave-free-abc12345', OUTRA: 'x', PATH: 'p' };
  const rev = { removerEnv: ['GEMINI_FREE_KEY', 'GEMINI_PAID_KEY'], definirEnv: { GEMINI_API_KEY: 'GEMINI_FREE_KEY' } };
  assert.deepEqual(envDoAnciao(env, rev), { OUTRA: 'x', PATH: 'p', GEMINI_API_KEY: 'chave-free-abc12345' });
  assert.deepEqual(envDoAnciao(env, { removerEnv: [], definirEnv: { Z: 'NAO_EXISTE' } }), env);
  const base = { nome: 'a', cmd: 'x' };
  for (const ruim of [['GEMINI_API_KEY'], { A: 1 }, { 'A B': 'C' }, { A: 'sk-valor literal' }]) {
    const { f, limpar } = config([{ ...base, definirEnv: ruim }]);
    try { assert.throws(() => carregarRevisores(f), /definirEnv/); } finally { limpar(); }
  }
});

test('e2e: definirEnv entrega a chave ao filho, avisa se a origem falta e redige o valor da saída', async () => {
  const eco = "console.log('ok\\nVEREDITO: APROVA\\nK='+(process.env.GEMINI_API_KEY||'ausente'))";
  const { f, limpar } = config([{ nome: 'gem', cmd: NODE, args: ['-e', eco], removerEnv: ['GEMINI_FREE_KEY'], definirEnv: { GEMINI_API_KEY: 'GEMINI_FREE_KEY' } }]);
  try {
    const env = { ...process.env, GEMINI_FREE_KEY: 'chave-free-abc12345' };
    const c = await capturar(() => main([...ARGS, '--revisores', f], env, SEM_LOG));
    assert.equal(c.r, 0); assert.match(c.out, /K=\[REDACTED:own-key\]/); assert.ok(!c.out.includes('chave-free-abc12345'));
    const sem = await capturar(() => main([...ARGS, '--revisores', f], { ...process.env, GEMINI_FREE_KEY: '' }, SEM_LOG));
    assert.match(sem.err, /espera GEMINI_API_KEY a partir de GEMINI_FREE_KEY/); assert.match(sem.out, /K=ausente/);
  } finally { limpar(); }
});
