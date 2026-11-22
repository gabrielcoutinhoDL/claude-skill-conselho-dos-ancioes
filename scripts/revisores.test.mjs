import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main, carregarRevisores, envDoAnciao, resolverLente, buildPrompt, parseArgs } from './conselho.mjs';
import { sanitize, checkFilePath, carregarCaminhosBloqueados, semVariaveis, runCli, killTree, resolverComando } from './lib.mjs';

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
  assert.equal(c.out.trim(), '"; echo PWNED & calc');
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
    assert.deepEqual(r, [{ nome: 'gpt', modelo: 'codex', cmd: 'codex', args: ['exec', '-'], entrada: 'stdin', maxChars: 24000, removerEnv: [], definirEnv: {} }]);
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

test('lentes rivais (Jedy/Ordem vs. Sith/Ruptura): resolverLente, parseArgs, buildPrompt e carregarRevisores', () => {
  assert.equal(resolverLente(undefined), null);
  assert.equal(resolverLente('neutra'), null);
  assert.equal(resolverLente('ordem').rotulo, 'Ordem/Jedy');
  assert.equal(resolverLente('JEDY').chave, 'ordem');
  assert.equal(resolverLente('ruptura').rotulo, 'Ruptura/Sith');
  assert.equal(resolverLente('Sith').chave, 'ruptura');
  assert.equal(resolverLente('Foco em FinOps e margem').chave, 'custom');

  assert.equal(parseArgs(['--rival']).rival, true);
  assert.equal(parseArgs(['--modo', 'rival']).modo, 'rival');
  assert.equal(parseArgs(['--modo', 'neutro']).rival, false);
  assert.throws(() => parseArgs(['--modo', 'caos']), /--modo deve ser rival ou neutro/);

  const pOrdem = buildPrompt({ tipo: 'artefato', material: 'plano X', pedido: 'meta Y', lente: 'ordem' });
  assert.match(pOrdem, /LENTE RIVAL DE JULGAMENTO — POLO DA ORDEM/);
  const pRuptura = buildPrompt({ tipo: 'diff', material: '+a', lente: 'sith' });
  assert.match(pRuptura, /LENTE RIVAL DE JULGAMENTO — POLO DA RUPTURA/);

  const cValido = config([{ nome: 'jedy', cmd: 'claude', lente: 'ordem' }, { nome: 'sith', cmd: 'agy', lente: 'ruptura' }]);
  try {
    const r = carregarRevisores(cValido.f);
    assert.equal(r[0].lente, 'ordem');
    assert.equal(r[1].lente, 'ruptura');
  } finally { cValido.limpar(); }

  for (const ruim of ['', '   ', 123]) {
    const cRuim = config([{ nome: 'jedy', cmd: 'claude', lente: ruim }]);
    try { assert.throws(() => carregarRevisores(cRuim.f), /lente deve ser string/); } finally { cRuim.limpar(); }
  }
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
    assert.equal(c.r, 5);
    assert.match(c.out, /ANCIÃO: alfa/); assert.match(c.out, /ANCIÃO: beta/); assert.match(c.out, /ANCIÃO: gama/);
    assert.match(c.out, /alfa -> VEREDITO: APROVA/); assert.match(c.out, /beta -> VEREDITO: REPROVA/);
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
    assert.equal(so1.r, 0);
  } finally { limpar(); }
});

test('e2e --rival e --modo neutro: injeta lentes opostas (Ordem/Jedy vs. Ruptura/Sith) nos anciões', async () => {
  const ecoLente = "let b='';process.stdin.on('data',x=>b+=x).on('end',()=>{const l=b.includes('POLO DA ORDEM')?'ORDEM':b.includes('POLO DA RUPTURA')?'RUPTURA':'NEUTRA';console.log('LENTE_RECEBIDA='+l+'\\nVEREDITO: APROVA')})";
  const { f, limpar } = config([
    { nome: 'jedy', cmd: NODE, args: ['-e', ecoLente] },
    { nome: 'sith', cmd: NODE, args: ['-e', ecoLente] },
  ]);
  try {
    const cRival = await capturar(() => main([...ARGS, '--revisores', f, '--rival'], {}, SEM_LOG));
    assert.equal(cRival.r, 0);
    assert.match(cRival.out, /ANCIÃO: jedy .* \[LENTE: Ordem\/Jedy\]/);
    assert.match(cRival.out, /ANCIÃO: sith .* \[LENTE: Ruptura\/Sith\]/);
    assert.match(cRival.out, /LENTE_RECEBIDA=ORDEM/);
    assert.match(cRival.out, /LENTE_RECEBIDA=RUPTURA/);

    const soSith = await capturar(() => main([...ARGS, '--revisores', f, '--rival', '--only', 'sith'], {}, SEM_LOG));
    assert.equal(soSith.r, 0);
    assert.match(soSith.out, /LENTE_RECEBIDA=RUPTURA/);
  } finally { limpar(); }

  const cFixo = config([{ nome: 'jedy', cmd: NODE, args: ['-e', ecoLente], lente: 'ordem' }]);
  try {
    const cNeutro = await capturar(() => main([...ARGS, '--revisores', cFixo.f, '--modo', 'neutro'], {}, SEM_LOG));
    assert.equal(cNeutro.r, 0);
    assert.match(cNeutro.out, /LENTE_RECEBIDA=NEUTRA/);
    assert.ok(!cNeutro.out.includes('[LENTE:'));
  } finally { cFixo.limpar(); }
});