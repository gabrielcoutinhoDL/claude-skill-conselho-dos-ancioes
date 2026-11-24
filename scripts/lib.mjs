// Utilidades do Conselho dos Anciões: filtro de segredos/PII, bloqueio de arquivos e execução de CLIs.
// Sem dependências. Autossuficiente: não importa nada fora desta pasta.
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { basename, resolve, join, delimiter } from 'node:path';

// Arquivos que nunca vão a nenhum ancião.
const BLOCKED_NAME = /(^|[\\/])(\.env(\..*)?|.*\.(pem|key|p12|pfx|keystore|jks)|id_(rsa|ed25519|ecdsa)|credentials(\.json)?|secrets?\.(json|ya?ml))$/i;

/**
 * Caminhos extras proibidos (ex.: pastas de clientes). Fontes, em ordem:
 *  - env CONSELHO_CAMINHOS_BLOQUEADOS: regexes separadas por ";"
 *  - arquivo ~/.claude/conselho.bloqueios.json: array de strings de regex
 * Vazio por padrão. Regex inválida é ignorada com aviso (nunca derruba o bloqueio dos demais).
 */
export function carregarCaminhosBloqueados(env = process.env, home = homedir()) {
  const fontes = [];
  if (env.CONSELHO_CAMINHOS_BLOQUEADOS) fontes.push(...env.CONSELHO_CAMINHOS_BLOQUEADOS.split(';').filter(Boolean));
  const arq = join(home, '.claude', 'conselho.bloqueios.json');
  try {
    if (existsSync(arq)) {
      const j = JSON.parse(readFileSync(arq, 'utf8'));
      if (Array.isArray(j)) fontes.push(...j.filter((x) => typeof x === 'string'));
    }
  } catch { /* arquivo ilegível: ignora */ }
  const res = [];
  for (const f of fontes) {
    try { res.push(new RegExp(f, 'i')); } catch { console.error(`AVISO: regex de bloqueio inválida ignorada: ${f}`); }
  }
  return res;
}

let _extra = null;
/** Motivo do bloqueio ou null. `extras` (regexes) só para teste; por padrão vem de env/arquivo. */
export function checkFilePath(p, extras) {
  if (BLOCKED_NAME.test(p)) return `arquivo bloqueado por nome: ${basename(p)}`;
  const lista = extras || (_extra ||= carregarCaminhosBloqueados());
  const abs = resolve(p);
  if (lista.some((re) => re.test(abs))) return 'caminho proibido pela lista de bloqueio (CONSELHO_CAMINHOS_BLOQUEADOS / conselho.bloqueios.json)';
  return null;
}

// [nome, regex, fatal]. Fatal = aborta (material de chave).
const SECRET_PATTERNS = [
  ['private-key', /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g, true],
  ['google-key', /\bAIza[0-9A-Za-z_-]{20,}\b/g, false],
  ['gemini-auth-key', /\bAQ\.[0-9A-Za-z_-]{20,}\b/g, false],
  ['aws-access-key', /\b(AKIA|ASIA)[0-9A-Z]{16}\b/g, false],
  ['github-token', /\b(ghp|gho|ghu|ghs|ghr|github_pat)_[0-9A-Za-z_]{20,}\b/g, false],
  ['api-key-sk', /\bsk-[0-9A-Za-z_-]{20,}\b/g, false],
  ['slack-token', /\bxox[abprs]-[0-9A-Za-z-]{10,}\b/g, false],
  ['jwt', /\beyJ[0-9A-Za-z_-]{8,}\.[0-9A-Za-z_-]{8,}\.[0-9A-Za-z_-]{8,}\b/g, false],
  ['bearer', /\bBearer\s+[0-9A-Za-z._~+/=-]{16,}/gi, false],
  ['conn-string', /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:[^\s@/]+@[^\s/]+/gi, false],
  // KEY=valor / "key": "valor" para nomes sensíveis
  ['secret-assign', /\b([A-Z0-9_.-]*(?:SECRET|TOKEN|PASSWORD|PASSWD|PWD|API[_-]?KEY|PRIVATE[_-]?KEY|ACCESS[_-]?KEY|CLIENT[_-]?SECRET|SERVICE[_-]?ROLE)[A-Z0-9_.-]*)(\s*["']?\s*[:=]\s*["']?)([^\s"',;]{4,})/gi, false],
  // Dados pessoais (LGPD)
  ['cpf', /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, false],
  ['cnpj', /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, false],
  ['email', /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, false],
];

/** Remove segredos/PII. `extraValues` = valores exatos (ex.: as próprias chaves do ambiente). */
export function sanitize(text, extraValues = []) {
  const counts = {};
  let fatal = false;
  let out = text;
  for (const v of extraValues) {
    if (v && v.length >= 8 && out.includes(v)) {
      counts['own-key'] = (counts['own-key'] || 0) + out.split(v).length - 1;
      out = out.split(v).join('[REDACTED:own-key]');
      fatal = true;
    }
  }
  for (const [name, re, isFatal] of SECRET_PATTERNS) {
    out = out.replace(re, (...m) => {
      counts[name] = (counts[name] || 0) + 1;
      if (isFatal) fatal = true;
      if (name === 'secret-assign') return `${m[1]}${m[2]}[REDACTED:${name}]`;
      return `[REDACTED:${name}]`;
    });
  }
  return { text: out, counts, fatal, redactions: Object.values(counts).reduce((a, b) => a + b, 0) };
}

/** Encerra o processo e os filhos (no Windows o .kill() só mata o pai e deixa netos vivos). */
export function killTree(child, plat = process.platform, run = spawnSync) {
  if (!child || !child.pid) return;
  if (plat === 'win32') run('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else { try { child.kill('SIGKILL'); } catch { /* já saiu */ } }
}

/** Cópia do ambiente sem as variáveis listadas. */
export function semVariaveis(env, nomes = []) {
  const e = { ...env };
  for (const n of nomes) delete e[n];
  return e;
}

/**
 * No Windows, CLIs instalados pelo npm (ex.: gemini, codex) são shims .cmd, que o spawn sem shell não acha (ENOENT).
 * Devolve { file, shim }: .exe/.com direto; .cmd/.bat marcados como shim (rodam via cmd.exe com argumentos restritos).
 */
export function resolverComando(cmd, plat = process.platform, run = spawnSync) {
  if (plat !== 'win32') return { file: cmd, shim: false };
  if (/\.(cmd|bat)$/i.test(cmd)) return { file: cmd, shim: true };
  if (/\.(exe|com)$/i.test(cmd)) return { file: cmd, shim: false };
  const r = run('where', [cmd], { encoding: 'utf8' });
  const achados = r.status === 0 ? String(r.stdout).split(/\r?\n/).map((s) => s.trim()).filter(Boolean) : [];
  const exe = achados.find((f) => /\.(exe|com)$/i.test(f));
  if (exe) return { file: exe, shim: false };
  const shim = achados.find((f) => /\.(cmd|bat)$/i.test(f));
  return shim ? { file: shim, shim: true } : { file: cmd, shim: false };
}

// Em shim .cmd o comando passa pelo cmd.exe: só caracteres inofensivos nos argumentos (o prompt nunca vai na linha de comando).
const ARG_SHIM = /^[\w@.:=,+\/\\ -]*$/;
const aspas = (x) => (/[ ]/.test(x) ? `"${x}"` : x);

/**
 * Tokeniza um comando de teste simples (ex.: `pytest -q "tests/meu teste.py"`) sem usar shell.
 * Recusa metacaracteres de encadeamento/redirecionamento (`; & | < > ` $ ( ) \r \n`).
 */
export function dividirComando(linha) {
  if (typeof linha !== 'string' || !linha.trim()) throw new Error('comando de teste vazio');
  if (/[;&|<>`$()\r\n]/.test(linha)) {
    throw new Error('comando de teste inválido: metacaracteres de shell (; & | < > ` $ ( )) não são permitidos');
  }
  const tokens = [];
  let atual = '', aspa = '';
  for (let i = 0; i < linha.length; i++) {
    const ch = linha[i];
    if (aspa) {
      if (ch === aspa) aspa = '';
      else atual += ch;
    } else if (ch === '"' || ch === "'") {
      aspa = ch;
    } else if (/\s/.test(ch)) {
      if (atual) { tokens.push(atual); atual = ''; }
    } else {
      atual += ch;
    }
  }
  if (aspa) throw new Error('comando de teste inválido: aspas não fechadas');
  if (atual) tokens.push(atual);
  if (!tokens.length) throw new Error('comando de teste vazio');
  return { cmd: tokens[0], args: tokens.slice(1) };
}

/** Enriquecimento de PATH e NODE_PATH para worktrees descartáveis acharem venv/node_modules do repositório original. */
export function envComRepo(env, topo) {
  const e = { ...env };
  // Evita que `node --test` filho herde contexto IPC de um `node --test` pai e mascare código de saída != 0.
  delete e.NODE_TEST_CONTEXT;
  const candidatos = [
    join(topo, 'node_modules', '.bin'),
    join(topo, '.venv', 'Scripts'),
    join(topo, 'venv', 'Scripts'),
    join(topo, '.venv', 'bin'),
    join(topo, 'venv', 'bin'),
  ].filter((p) => existsSync(p));
  if (candidatos.length) {
    const chavePath = Object.keys(e).find((k) => k.toUpperCase() === 'PATH') || 'PATH';
    e[chavePath] = [...candidatos, e[chavePath] || ''].filter(Boolean).join(delimiter);
  }
  const nm = join(topo, 'node_modules');
  if (existsSync(nm)) e.NODE_PATH = e.NODE_PATH ? `${nm}${delimiter}${e.NODE_PATH}` : nm;
  return e;
}

/**
 * Executa um comando local (ex.: suíte de testes na prova Red -> Green) num diretório específico, sem shell arbitrário.
 * Resolve sempre { code, out, err, timedOut }; nunca rejeita.
 */
export function runLocal({ cmd, args = [], cwd, timeoutMs = 120_000, env = process.env, plat = process.platform, run = spawnSync }) {
  const { file, shim } = resolverComando(cmd, plat, run);
  return new Promise((res) => {
    let child;
    let out = '', err = '', timedOut = false, fim = false, guarda;
    const done = (code) => {
      if (fim) return;
      fim = true; clearTimeout(t); clearTimeout(guarda);
      res({ code, out, err, timedOut });
    };
    const t = setTimeout(() => { timedOut = true; if (child) killTree(child); guarda = setTimeout(() => done(124), 10_000); }, timeoutMs);
    if (shim && args.some((x) => !ARG_SHIM.test(x))) {
      err = `${cmd} é um shim .cmd do Windows: argumentos aceitam apenas letras, números e . : = , + / \\ -`;
      return done(127);
    }
    try {
      child = shim
        ? spawn(`"${file}" ${args.map(aspas).join(' ')}`, { cwd, env, shell: true, stdio: ['ignore', 'pipe', 'pipe'] })
        : spawn(file, args, { cwd, env, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) { err = String(e); return done(127); }
    child.stdout.on('data', (c) => (out += c));
    child.stderr.on('data', (c) => (err += c));
    child.on('error', (e) => { err += String(e); done(127); });
    child.on('close', done);
  });
}

/**
 * Roda um CLI de IA em pasta temporária vazia (sem shell, salvo shim .cmd do Windows com entrada stdin).
 *  - entrada 'stdin': o prompt vai pelo stdin.
 *  - entrada 'arg': o marcador "{prompt}" em args é trocado pelo prompt (limite de linha de comando do SO).
 * Resolve sempre { code, out, err, timedOut }; nunca rejeita. Se o kill falhar, desiste em 10 s (code 124).
 */
export function runCli({ cmd, args = [], entrada = 'stdin', prompt, timeoutMs, env = process.env, plat = process.platform, run = spawnSync }) {
  const cwd = mkdtempSync(join(tmpdir(), 'conselho-'));
  const argv = entrada === 'arg' ? args.map((x) => (x === '{prompt}' ? prompt : x)) : args;
  const { file, shim } = resolverComando(cmd, plat, run);
  return new Promise((res) => {
    let child;
    let out = '', err = '', timedOut = false, fim = false, guarda;
    const done = (code) => {
      if (fim) return;
      fim = true; clearTimeout(t); clearTimeout(guarda);
      try { rmSync(cwd, { recursive: true, force: true }); } catch { /* arquivo ainda em uso */ }
      res({ code, out, err, timedOut });
    };
    const t = setTimeout(() => { timedOut = true; if (child) killTree(child); guarda = setTimeout(() => done(124), 10_000); }, timeoutMs);
    if (shim && (entrada !== 'stdin' || argv.some((x) => !ARG_SHIM.test(x)))) {
      err = `${cmd} é um shim .cmd do Windows: use entrada "stdin" e argumentos só com letras, números e . : = , + / \\ - (sem aspas, &, |, <, >, ^, %)`;
      return done(127);
    }
    try {
      child = shim
        ? spawn(`"${file}" ${argv.map(aspas).join(' ')}`, { cwd, env, shell: true, stdio: ['pipe', 'pipe', 'pipe'] })
        : spawn(file, argv, { cwd, env, shell: false, stdio: [entrada === 'stdin' ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
    } catch (e) { err = String(e); return done(127); }
    child.stdout.on('data', (c) => (out += c));
    child.stderr.on('data', (c) => (err += c));
    child.on('error', (e) => { err += String(e); done(127); });
    child.on('close', done);
    if (entrada === 'stdin') {
      child.stdin.on('error', () => { /* EPIPE: o CLI saiu antes de ler o prompt */ });
      child.stdin.end(prompt);
    }
  });
}
