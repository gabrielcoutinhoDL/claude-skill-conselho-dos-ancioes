// Utilidades do Conselho dos Anciões: filtro de segredos/PII, bloqueio de arquivos e execução de CLIs.
// Sem dependências. Autossuficiente: não importa nada fora desta pasta.
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { basename, resolve, join } from 'node:path';

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

/** Encerra o processo e os filhos (no Windows, child.kill() não derruba a árvore). */
export function killTree(child, plat = process.platform, run = spawnSync) {
  if (!child.pid) return;
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
 * Roda um CLI de IA sem shell, em pasta temporária vazia.
 *  - entrada 'stdin': o prompt vai pelo stdin.
 *  - entrada 'arg': o marcador "{prompt}" em args é trocado pelo prompt (limite de linha de comando do SO).
 * Resolve sempre { code, out, err, timedOut }; nunca rejeita. Se o kill falhar, desiste em 10 s (code 124).
 */
export function runCli({ cmd, args = [], entrada = 'stdin', prompt, timeoutMs, env = process.env }) {
  const cwd = mkdtempSync(join(tmpdir(), 'conselho-'));
  const argv = entrada === 'arg' ? args.map((x) => (x === '{prompt}' ? prompt : x)) : args;
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
    try {
      child = spawn(cmd, argv, { cwd, env, shell: false, stdio: [entrada === 'stdin' ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
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
