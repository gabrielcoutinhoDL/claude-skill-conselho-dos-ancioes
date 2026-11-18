#!/usr/bin/env node
// Conselho dos Anciões (versão ULTRON): Opus (Claude Code, plano) + Argon (Antigravity), em paralelo.
// Baseado na skill de Danilo Gato (@odanilogato, cpdf.ai); reescrito sem GPT/Codex. ADR-012.
// Uso: node conselho.mjs [--arquivo a.md ...] [--texto "..."] [--pedido "..."|--pedido-arquivo f]
//        [--rev HEAD|a..b | --diff-file f.patch | (nada = git diff HEAD)] [--contexto "1 frase"]
//        [--only opus|argon] [--effort low|medium|high] [--claude-model id] [--dry-run] [--repo DIR]
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, existsSync, mkdtempSync, rmSync, appendFileSync, mkdirSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitize, checkFilePath, runAgy } from '../../../scripts/ask-gemini.mjs';

const MAX_CHARS = 24_000; // teto do Argon via agy (prompt inline, ~28K) menos o envelope do prompt
const MIN_TIMEOUT_S = 300;

export function parseArgs(argv) {
  const a = { files: [], effort: 'medium', claudeModel: process.env.CONSELHO_CLAUDE_MODEL || 'claude-opus-5-5', timeoutS: 900, repo: process.cwd(), maxChars: MAX_CHARS };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const next = () => { if (i + 1 >= argv.length) throw new Error(`falta valor para ${k}`); return argv[++i]; };
    if (k === '--arquivo') a.files.push(next());
    else if (k === '--texto') a.texto = next();
    else if (k === '--pedido' || k === '--criterio') a.pedido = next();
    else if (k === '--pedido-arquivo') a.pedidoArquivo = next();
    else if (k === '--contexto') a.contexto = next();
    else if (k === '--rev') a.rev = next();
    else if (k === '--diff-file') a.diffFile = next();
    else if (k === '--repo') a.repo = next();
    else if (k === '--only') a.only = next();
    else if (k === '--effort') a.effort = next();
    else if (k === '--claude-model') a.claudeModel = next();
    else if (k === '--max-chars') a.maxChars = Number(next());
    else if (k === '--timeout') a.timeoutS = Number(next());
    else if (k === '--dry-run') a.dryRun = true;
    else throw new Error(`argumento desconhecido: ${k}`);
  }
  if (a.only && !['opus', 'argon'].includes(a.only)) throw new Error('--only deve ser opus ou argon');
  if (!['low', 'medium', 'high'].includes(a.effort)) throw new Error('--effort deve ser low, medium ou high');
  if (!/^[a-z0-9][a-z0-9.-]{0,60}$/.test(a.claudeModel)) throw new Error('--claude-model inválido');
  if (a.rev && (a.rev.startsWith('-') || !/^[\w.^~@{}\/:-]+$/.test(a.rev))) throw new Error('--rev inválido');
  if (!Number.isFinite(a.maxChars) || a.maxChars <= 0) throw new Error('--max-chars inválido');
  if (!Number.isFinite(a.timeoutS) || a.timeoutS < MIN_TIMEOUT_S) a.timeoutS = MIN_TIMEOUT_S;
  return a;
}

const FORMATO = `Responda em português, SUCINTO, sem elogio e sem explicação longa:
- no máximo 8 pontos, do mais grave ao menos grave
- cada ponto numa linha: [ALTA|MÉDIA|BAIXA] LOCAL - problema e correção em poucas palavras
- no máximo 250 palavras no total
- por último, UMA linha exatamente assim: VEREDITO: APROVA | APROVA COM RESSALVAS | REPROVA`;

export function buildPrompt({ tipo, material, contexto, pedido }) {
  const ctx = contexto || '(não informado)';
  if (tipo === 'diff') {
    return `Você é um ancião revisor. Revise SOMENTE o diff abaixo. Não explore o repositório, não rode comandos, não use ferramentas.
Contexto da mudança: ${ctx}
Procure bugs, regressões, falhas de segurança e casos de borda que o diff introduz ou deixa passar.
${FORMATO.replace('LOCAL', 'arquivo:linha')}

DIFF:
${material}`;
  }
  return `Você é um ancião revisor. Revise SOMENTE o material abaixo. Não explore nada fora dele, não rode comandos, não use ferramentas.
Contexto: ${ctx}
PEDIDO ORIGINAL OU CRITÉRIO DE JULGAMENTO: ${pedido || '(não informado: avalie o material pelo que ele se propõe a ser)'}
Julgue se o material CUMPRE o pedido ou o critério. Aponte o que está errado (fato, número, conta, contradição), o que está faltando e o que pode dar problema depois (risco, ambiguidade, brecha). Se for código, aplique também a revisão técnica. Não reescreva o material.
${FORMATO.replace('LOCAL', 'trecho ou seção')}

MATERIAL:
${material}`;
}

/** Última linha "VEREDITO: ..." sem asteriscos; '' se não houver. */
export function extractVerdict(text) {
  const m = [...String(text).matchAll(/VEREDITO:[^\n]*/g)].pop();
  return m ? m[0].replace(/\*/g, '').trim() : '';
}

/** Remove a nota "Relatório Obsidian" que o agy anexa ao fim. */
export function stripAgyNoise(text) {
  return String(text).replace(/\n*-{3,}\s*\n\*?Relat[óo]rio Obsidian[\s\S]*$/i, '').trim();
}

function git(repo, args) {
  const r = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`git falhou: ${(r.stderr || '').slice(0, 300)}`);
  return r.stdout;
}

function collect(a) {
  if (a.files.length || a.texto) {
    let m = '';
    for (const f of a.files) {
      const bad = checkFilePath(f);
      if (bad) throw new Error(bad);
      if (!existsSync(f)) throw new Error(`arquivo não existe: ${f}`);
      m += `=== ARQUIVO: ${basename(f)} ===\n${readFileSync(f, 'utf8')}\n\n`;
    }
    if (a.texto) m += `=== TEXTO ===\n${a.texto}\n`;
    return { tipo: 'artefato', material: m };
  }
  if (a.diffFile) {
    const bad = checkFilePath(a.diffFile);
    if (bad) throw new Error(bad);
    return { tipo: 'diff', material: readFileSync(a.diffFile, 'utf8') };
  }
  const bad = checkFilePath(resolve(a.repo));
  if (bad && /JMB/.test(bad)) throw new Error(bad);
  const material = a.rev
    ? (a.rev.includes('..') ? git(a.repo, ['diff', '-U5', a.rev]) : git(a.repo, ['show', '-U5', '--format=commit %h: %s', a.rev]))
    : git(a.repo, ['diff', '-U5', 'HEAD']);
  return { tipo: 'diff', material };
}

function runClaude(model, prompt, timeoutMs) {
  const cwd = mkdtempSync(join(tmpdir(), 'conselho-opus-'));
  return new Promise((res) => {
    // '--tools ""' = sem ferramentas; prompt por stdin; pasta vazia.
    const child = spawn('claude', ['-p', '--model', model, '--tools', ''], { cwd, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '', timedOut = false;
    const t = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
    child.stdout.on('data', (c) => (out += c));
    child.stderr.on('data', (c) => (err += c));
    const done = (code) => { clearTimeout(t); rmSync(cwd, { recursive: true, force: true }); res({ code, out, err, timedOut }); };
    child.on('error', (e) => { err += String(e); done(127); });
    child.on('close', done);
    child.stdin.end(prompt);
  });
}

function logCall(e) {
  try { mkdirSync(join(homedir(), '.claude', 'logs'), { recursive: true }); appendFileSync(join(homedir(), '.claude', 'logs', 'conselho.jsonl'), JSON.stringify(e) + '\n'); } catch { /* opcional */ }
}

export async function main(argv, env = process.env) {
  let a;
  try { a = parseArgs(argv); } catch (e) { console.error(`erro: ${e.message}`); return 2; }
  let input;
  try {
    if (a.pedidoArquivo) { const bad = checkFilePath(a.pedidoArquivo); if (bad) throw new Error(bad); a.pedido = readFileSync(a.pedidoArquivo, 'utf8'); }
    input = collect(a);
  } catch (e) { console.error(`erro: ${e.message}`); return 2; }
  if (!input.material.trim()) { console.error('erro: material vazio (nada mudou?)'); return 2; }
  if (input.tipo === 'artefato' && !a.pedido) console.error('AVISO: sem --pedido/--criterio o ancião só avalia o material em si.');

  const ownKeys = [env.GEMINI_FREE_KEY, env.GEMINI_PAID_KEY, env.ANTHROPIC_API_KEY, env.OPENAI_API_KEY];
  const raw = buildPrompt({ ...input, contexto: a.contexto, pedido: a.pedido });
  const s = sanitize(raw, ownKeys);
  if (s.fatal) { console.error(`bloqueado: material de chave detectado ${JSON.stringify(s.counts)}. Nada foi enviado.`); return 3; }
  if (s.redactions > 0) console.error(`[conselho] ${s.redactions} item(ns) sensível(is) redigido(s): ${JSON.stringify(s.counts)}`);
  if (s.text.length > a.maxChars) { console.error(`bloqueado: material com ${s.text.length} caracteres > teto ${a.maxChars} (limite do Argon). Divida por arquivo.`); return 4; }
  console.error(`[conselho] tipo=${input.tipo} chars=${s.text.length} anciões=${a.only || 'opus+argon'}`);
  if (env.ANTHROPIC_API_KEY && a.only !== 'argon') console.error('AVISO: ANTHROPIC_API_KEY definida; o claude -p pode cobrar pela API em vez do plano.');
  if (a.dryRun) { process.stdout.write(s.text + '\n'); return 0; }

  const t0 = Date.now();
  const tasks = [];
  if (a.only !== 'argon') tasks.push(['Opus', a.claudeModel, runClaude(a.claudeModel, s.text, a.timeoutS * 1000)]);
  if (a.only !== 'opus') tasks.push(['Argon', `gemini-4-argon-${a.effort}`, runAgy('gemini-4-argon', a.effort, s.text, a.timeoutS * 1000).then((r) => ({ ...r, out: stripAgyNoise(r.out) }))]);
  const results = await Promise.all(tasks.map(async ([nome, modelo, p]) => ({ nome, modelo, ...(await p) })));

  const verdicts = {};
  for (const r of results) {
    const ok = r.code === 0 && !r.timedOut && r.out.trim().length > 0;
    console.log(`===== ANCIÃO: ${r.nome} (${r.modelo}) =====`);
    if (ok) { process.stdout.write(sanitize(r.out, ownKeys).text.trim() + '\n\n'); verdicts[r.nome] = extractVerdict(r.out); }
    else console.log(`FALHOU: ${r.timedOut ? 'timeout' : `código ${r.code}`}. ${sanitize(r.err || r.out, ownKeys).text.slice(0, 500)}\n`);
    logCall({ ts: new Date().toISOString(), ancião: r.nome, modelo: r.modelo, tipo: input.tipo, inChars: s.text.length, outChars: r.out.length, code: r.code, timedOut: r.timedOut, ok });
  }
  console.log('===== PARA A SÍNTESE =====');
  for (const [n, v] of Object.entries(verdicts)) console.log(`${n} -> ${v || '(sem veredito)'}`);
  const vs = Object.values(verdicts);
  if (results.length === 2) {
    if (vs.length < 2 || vs.some((v) => !v)) console.log('Um dos anciões falhou ou não deu veredito: trate como parecer de um ancião só.');
    else console.log(vs[0] === vs[1] ? 'Vereditos IGUAIS.' : 'Vereditos DIFERENTES: olhe com mais atenção os pontos em que divergem (sobe para o Gabriel).');
  }
  console.error(`[conselho] ${Math.round((Date.now() - t0) / 1000)} s`);
  return results.some((r) => r.code === 0) ? 0 : 6;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((c) => process.exit(c));
}
