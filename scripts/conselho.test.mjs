import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, buildPrompt, extractVerdict, stripAgyNoise, main } from './conselho.mjs';

test('parseArgs: defaults e validações', () => {
  const a = parseArgs(['--texto', 'x']);
  assert.equal(a.claudeModel, 'claude-opus-5-5'); assert.equal(a.effort, 'medium'); assert.equal(a.maxChars, 24000);
  assert.equal(parseArgs(['--timeout', '5']).timeoutS, 300);
  assert.throws(() => parseArgs(['--only', 'gpt']));
  assert.throws(() => parseArgs(['--rev', '--output=x']));
  assert.throws(() => parseArgs(['--claude-model', 'a; calc']));
  assert.throws(() => parseArgs(['--foo']));
});

test('buildPrompt: diff x artefato', () => {
  const d = buildPrompt({ tipo: 'diff', material: 'DIFFX', contexto: 'ctx' });
  assert.match(d, /arquivo:linha/); assert.match(d, /DIFFX/); assert.match(d, /Contexto da mudança: ctx/);
  const m = buildPrompt({ tipo: 'artefato', material: 'MATX', pedido: 'PED' });
  assert.match(m, /trecho ou seção/); assert.match(m, /PEDIDO ORIGINAL OU CRITÉRIO DE JULGAMENTO: PED/);
  assert.match(buildPrompt({ tipo: 'artefato', material: 'm' }), /não informado/);
});

test('extractVerdict e stripAgyNoise', () => {
  assert.equal(extractVerdict('a\n**VEREDITO: REPROVA**\n'), 'VEREDITO: REPROVA');
  assert.equal(extractVerdict('sem'), '');
  assert.equal(stripAgyNoise('texto\nVEREDITO: APROVA\n\n---\n*Relatório Obsidian:* nada lido.'), 'texto\nVEREDITO: APROVA');
});

test('main --dry-run: artefato sanitizado; segredo aborta; teto aborta; .env bloqueado', async () => {
  const w = []; const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = (c) => { w.push(String(c)); return true; };
  const code = await main(['--texto', 'contato a@b.com', '--pedido', 'p', '--dry-run'], {});
  process.stdout.write = orig;
  assert.equal(code, 0); assert.ok(w.join('').includes('[REDACTED:email]'));
  assert.equal(await main(['--texto', '-----BEGIN PRIVATE KEY-----\nabc', '--dry-run'], {}), 3);
  assert.equal(await main(['--texto', 'x'.repeat(300), '--max-chars', '100', '--dry-run'], {}), 4);
  assert.equal(await main(['--arquivo', 'C:\\x\\.env', '--dry-run'], {}), 2);
});
