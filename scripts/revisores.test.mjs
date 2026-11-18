import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main, carregarRevisores } from './conselho.mjs';
import { sanitize, checkFilePath, carregarCaminhosBloqueados, semVariaveis, runCli, killTree } from './lib.mjs';

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
// "Modelos" falsos, 100% portáveis (rodam com o próprio node): leem o prompt e respondem no formato do conselho.
const LE_STDIN = "let b='';process.stdin.on('data',d=>b+=d).on('end',()=>{";
const ECO_STDIN = `${LE_STDIN}console.log('1. [BAIXA] x - y\\nVEREDITO: '+(b.includes('<<<MATERIAL-')?'APROVA':'REPROVA'))})`;
const ECO_ARG = "const p=process.argv[1]||'';console.log('1. [MÉDIA] a - b\\nVEREDITO: '+(p.includes('<<<MATERIAL-')?'REPROVA':'APROVA'))";
const QUEBRA = "console.error('boom');process.exit(1)";

function config(lista) {
  const d = mkdtempSync(join(tmpdir(), 'conselho-cfg-'));
  const f = join(d, 'revisores.json');
  writeFileSync(f, JSON.stringify(lista));
  return { f, limpar: () => rmSync(d, { recursive: true, force: true }) };
}

test('lib.sanitize e checkFilePath: segredos, .env e lista de bloqueio configurável', () => {
  const s = sanitize('mail a@b.com e AKIAABCDEFGHIJKLMNOP', []);
  assert.equal(s.redactions, 2); assert.ok(!s.text.includes('a@b.com'));
  assert.equal(sanitize('-----BEGIN PRIVATE KEY-----\nx', []).fatal, true);
  assert.equal(sanitize('tem sk-abcdefghijklmnopqrstuvwx dentro', ['sk-abcdefghijklmnopqrstuvwx']).fatal, true);
  assert.match(checkFilePath('C:\\x\\.env'), /bloqueado por nome/);
  assert.match(checkFilePath('/p/id_rsa'), /bloqueado por nome/);
  assert.equal(checkFilePath('/p/leia.md', []), null);
  assert.match(checkFilePath('/clientes/acme/a.md', [/clientes/i]), /lista de bloqueio/);
});

test('lib.carregarCaminhosBloqueados: env, arquivo ausente e regex inválida', () => {
  const home = mkdtempSync(join(tmpdir(), 'conselho-home-'));
  try {
    assert.deepEqual(carregarCaminhosBloqueados({}, home), []);
    const r = carregarCaminhosBloqueados({ CONSELHO_CAMINHOS_BLOQUEADOS: 'clientes;(' }, home);
    assert.equal(r.length, 1); assert.ok(r[0].test('/x/Clientes/y'));
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('lib.semVariaveis não muta o original', () => {
  const env = { A: '1', B: '2' };
  assert.deepEqual(semVariaveis(env, ['A']), { B: '2' });
  assert.deepEqual(env, { A: '1', B: '2' });
});

test('lib.runCli: stdin, arg com {prompt}, metacaracteres sem shell, comando inexistente e timeout', async () => {
  const a = await runCli({ cmd: NODE, args: ['-e', ECO_STDIN], entrada: 'stdin', prompt: '<<<MATERIAL-x oi', timeoutMs: 20000 });
  assert.equal(a.code, 0); assert.match(a.out, /VEREDITO: APROVA/);
  const b = await runCli({ cmd: NODE, args: ['-e', ECO_ARG, '{prompt}'], entrada: 'arg', prompt: 'sem marcador', timeoutMs: 20000 });
  assert.equal(b.code, 0); assert.match(b.out, /VEREDITO: APROVA/);
  const c = await runCli({ cmd: NODE, args: ['-e', "console.log(process.argv[1])", '{prompt}'], entrada: 'arg', prompt: '"; echo PWNED & calc', timeoutMs: 20000 });
  assert.equal(c.out.trim(), '"; echo PWNED & calc'); // o prompt chega como texto, nunca interpretado
  const d = await runCli({ cmd: 'comando-que-nao-existe-xyz', args: [], prompt: 'x', timeoutMs: 20000 });
  assert.equal(d.code, 127);
  const t0 = Date.now();
  const e = await runCli({ cmd: NODE, args: ['-e', 'setInterval(()=>{},1000)'], prompt: 'x', timeoutMs: 400 });
  assert.equal(e.timedOut, true);
  assert.ok(Date.now() - t0 < 9000, 'o timeout derruba o processo sem esperar o guarda');
});

test('killTree exportado pelo conselho continua funcionando', () => {
  let sinal;
  killTree({ pid: 1, kill: (s) => { sinal = s; } }, 'linux', () => assert.fail());
  assert.equal(sinal, 'SIGKILL');
});

test('carregarRevisores: aceita config válida (array ou {revisores}) e aplica padrões', () => {
  const { f, limpar } = config([{ nome: 'gpt', cmd: 'codex', args: ['exec', '-'] }]);
  try {
    const r = carregarRevisores(f);
    assert.deepEqual(r, [{ nome: 'gpt', modelo: 'codex', cmd: 'codex', args: ['exec', '-'], entrada: 'stdin', maxChars: 24000, removerEnv: [] }]);
  } finally { limpar(); }
  const c2 = config({ revisores: [{ nome: 'local', cmd: 'ollama', args: ['run', 'llama3', '{prompt}'], entrada: 'arg', maxChars: 8000, removerEnv: ['X_KEY'], modelo: 'llama3' }] });
  try {
    const r = carregarRevisores(c2.f);
    assert.equal(r[0].entrada, 'arg'); assert.equal(r[0].maxChars, 8000); assert.equal(r[0].modelo, 'llama3');
  } finally { c2.limpar(); }
});

test('carregarRevisores: rejeita configs inválidas', () => {
  const casos = [
    [[], /pelo menos um/],
    [[{ cmd: 'x' }], /nome inválido/],
    [[{ nome: 'a b', cmd: 'x' }], /nome inválido/],
    [[{ nome: 'a', cmd: 'x' }, { nome: 'A', cmd: 'y' }], /repetido/],
    [[{ nome: 'a' }], /cmd obrigatório/],
    [[{ nome: 'a', cmd: 'x', args: 'nao-array' }], /args/],
    [[{ nome: 'a', cmd: 'x', entrada: 'pipe' }], /entrada/],
    [[{ nome: 'a', cmd: 'x', entrada: 'arg', args: ['sem-marcador'] }], /\{prompt\}/],
    [[{ nome: 'a', cmd: 'x', maxChars: -1 }], /maxChars/],
    [[{ nome: 'a', cmd: 'x', removerEnv: [1] }], /removerEnv/],
  ];
  for (const [lista, re] of casos) {
    const { f, limpar } = config(lista);
    try { assert.throws(() => carregarRevisores(f), re); } finally { limpar(); }
  }
  assert.throws(() => carregarRevisores(join(tmpdir(), 'nao-existe-xyz.json')), /não existe/);
  const d = mkdtempSync(join(tmpdir(), 'conselho-cfg-'));
  try { writeFileSync(join(d, 'x.json'), '{nao é json'); assert.throws(() => carregarRevisores(join(d, 'x.json')), /JSON inválido/); }
  finally { rmSync(d, { recursive: true, force: true }); }
});

const SEM_LOG = { logCall: () => {} };
const ARGS = ['--texto', 'material de teste', '--pedido', 'p'];

test('e2e: 3 "modelos" quaisquer (stdin, arg e um que quebra) via --revisores, sem simulação do runner', async () => {
  const { f, limpar } = config([
    { nome: 'alfa', cmd: NODE, args: ['-e', ECO_STDIN], entrada: 'stdin' },
    { nome: 'beta', cmd: NODE, args: ['-e', ECO_ARG, '{prompt}'], entrada: 'arg' },
    { nome: 'gama', cmd: NODE, args: ['-e', QUEBRA], entrada: 'stdin' },
  ]);
  try {
    const c = await capturar(() => main([...ARGS, '--revisores', f], {}, SEM_LOG));
    assert.equal(c.r, 5); // 2 de 3 deram parecer válido
    assert.match(c.out, /ANCIÃO: alfa/); assert.match(c.out, /ANCIÃO: beta/); assert.match(c.out, /ANCIÃO: gama/);
    assert.match(c.out, /alfa -> VEREDITO: APROVA/); assert.match(c.out, /beta -> VEREDITO: REPROVA/); // o prompt chega com o delimitador
    assert.match(c.out, /FALHOU: código 1/); assert.match(c.out, /parecer parcial/);

    const so = await capturar(() => main([...ARGS, '--revisores', f, '--only', 'ALFA'], {}, SEM_LOG));
    assert.equal(so.r, 0); assert.ok(!so.out.includes('ANCIÃO: beta'));

    const nenhum = await capturar(() => main([...ARGS, '--revisores', f, '--only', 'delta'], {}, SEM_LOG));
    assert.equal(nenhum.r, 2); assert.match(nenhum.err, /ancião inexistente/);

    const viaEnv = await capturar(() => main([...ARGS, '--only', 'alfa'], { CONSELHO_REVISORES: f }, SEM_LOG));
    assert.equal(viaEnv.r, 0);
  } finally { limpar(); }
});

test('e2e: todos concordam = IGUAIS; teto vem do menor maxChars; chave do ambiente é removida do filho', async () => {
  const eco = "console.log('ok\\nVEREDITO: APROVA\\nKEY='+(process.env.MINHA_CHAVE_XYZ||'ausente'))";
  const { f, limpar } = config([
    { nome: 'um', cmd: NODE, args: ['-e', eco], removerEnv: ['MINHA_CHAVE_XYZ'] },
    { nome: 'dois', cmd: NODE, args: ['-e', eco], removerEnv: ['MINHA_CHAVE_XYZ'], maxChars: 5000 },
  ]);
  try {
    const env = { ...process.env, MINHA_CHAVE_XYZ: 'valor-secreto-123456' };
    const c = await capturar(() => main([...ARGS, '--revisores', f], env, SEM_LOG));
    assert.equal(c.r, 0); assert.match(c.out, /Vereditos IGUAIS/);
    assert.match(c.out, /KEY=ausente/); assert.ok(!c.out.includes('valor-secreto-123456'));
    assert.match(c.err, /MINHA_CHAVE_XYZ removida\(s\) do ambiente do um/);

    const teto = await capturar(() => main([...ARGS, '--revisores', f, '--max-chars', '9000', '--dry-run'], {}, SEM_LOG));
    assert.equal(teto.r, 2); assert.match(teto.err, /teto de 5000 \(limite de dois\)/);
    const so1 = await capturar(() => main([...ARGS, '--revisores', f, '--max-chars', '9000', '--only', 'um', '--dry-run'], {}, SEM_LOG));
    assert.equal(so1.r, 0); // só o "um" (teto 24000): 9000 cabe
  } finally { limpar(); }
});
