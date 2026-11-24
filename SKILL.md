---
name: conselho-dos-ancioes
description: >
  Conselho dos Anciões v2.1.0: arquitetura de debate dialético entre 2 Agentes Rivais entre si
  (Jedy — Polo da Ordem, Resiliência, Segurança e Longo Prazo vs. Sith — Polo da Ruptura, Velocidade,
  Assimetria e Corte Radical 90/10, operando sem o agente orquestrador à frente do Conselho) combinada
  com revisão multi-modelo via CLI (Opus 5.5 + Gemini 4 Argon ou outros modelos com --rival e --revisores)
  e Prova Red -> Green executável (--exigir-falha-base) contra falsos verdes em segurança.
  Use em todo planejamento estratégico, decisão de arquitetura, escopo de sprint, proposta comercial
  ou mudança de risco (auth, schema, contrato de API, segurança, LGPD, deploy).
author: Baseado na skill de Danilo Gato (@odanilogato, cpdf.ai); evoluída por Gabriel Coutinho para Debate Dual Jedy vs. Sith e Prova Red -> Green (ADR-012 / ADR-026 / ADR-030)
version: 2.1.0
---

# Conselho dos Anciões v2.1 — 2 Agentes Rivais (`Jedy` ⚔️ `Sith`), Motor Multi-Modelo & Prova Red → Green

O erro clássico de qualquer orquestração de IA tem duas camadas:
1. **Ponto cego cognitivo:** deixar o mesmo modelo que escreveu (ou o orquestrador principal) presidir a revisão do próprio trabalho.
2. **Ponto cego estático:** aprovar um `diff` de segurança porque ele contém um teste "verde", sem notar que o teste é **tautológico** (já passaria mesmo sem a correção).

Na **v2.1.0**, o Conselho dos Anciões une **dois agentes rivais entre si (`Jedy` vs. `Sith`, sem o orquestrador à frente)** + **motor CLI multi-modelo (`--rival`)** + **Prova Red → Green executável (`--exigir-falha-base`)**, que roda o teste novo em worktrees descartáveis contra o commit base (exigindo falha comprovada) e contra o código corrigido (exigindo aprovação) antes mesmo de enviar o diff aos anciões.

---

## 1. Visão Arquitetural: Como Montar os 2 Agentes Rivais

Esta skill traz em `agents/` os dois templates prontos para você instanciar os agentes rivais no seu ambiente (Claude Code `.claude/agents/`, OpenBot ou seu sistema multiagente):

| Polo | Agente & Template | Filosofia e Lente Adversarial | Pergunta Central |
|---|---|---|---|
| **Polo da Ordem (Tese)** | **Jedy** (`agents/jedy-ordem.md`) | Arquitetura limpa (SOLID/Clean Code), resiliência, contratos formais (RFC 7807), segurança desde o design (AppSec/LGPD), governança, proteção de caixa e sustentabilidade de 6 a 12 meses. | *"O que vai quebrar, vazar, gerar passivo jurídico ou destruir o projeto no longo prazo se cedermos à pressa imprudente?"* |
| **Polo da Ruptura (Antítese)** | **Sith** (`agents/sith-ruptura.md`) | Velocidade brutal de execução, alavancagem assimétrica, corte radical de escopo (Pareto 90/10), anti-burocracia, anti-overengineering, tração imediata e advogado do diabo contra premissas covardes. | *"Qual burocracia ou premissa fraca está travando o resultado hoje, o que cortamos pela metade agora e onde está a alavancagem máxima?"* |

### Como instalar os 2 Agentes Rivais
1. **No Claude Code CLI:** copie `agents/jedy-ordem.md` e `agents/sith-ruptura.md` para `~/.claude/agents/` (ou `.claude/agents/` do projeto).
2. **No OpenBot / Orquestrador Multiagente:** crie dois agentes independentes (`Jedy` e `Sith`) usando os prompts de `agents/jedy-ordem.md` e `agents/sith-ruptura.md`, instale a skill `conselho-dos-ancioes` em ambos e **retire o agente orquestrador da presidência do Conselho**.

---

## 2. Protocolo de Debate em 3 Atos (`Jedy` ⚔️ `Sith`)

Sempre que um plano, projeto, escopo de sprint, arquitetura ou estratégia precisar ser validado:

1. **Ato 1 — Abertura de Fogo (Tese vs. Antítese):**
   - **Jedy** disseca o plano caçando fragilidades estruturais, riscos ocultos de segurança/privacidade, dívida técnica e gargalos de longo prazo.
   - **Sith** disseca o mesmo plano atacando lentidão, excesso de complexidade, features sem retorno imediato e custo de oportunidade.
2. **Ato 2 — Rebate Direto entre os Rivais:**
   - **Sith** rebate onde a cautela de **Jedy** vira paralisia burocrática ou *overengineering*.
   - **Jedy** rebate onde o atalho de **Sith** cria risco fatal, vazamento de dados ou passivo impagável.
3. **Ato 3 — Síntese para Decisão Soberana do Usuário:**
   - **Tese Jedy (Ordem & Longo Prazo):** Riscos `[ALTA|MÉDIA|BAIXA]` + blindagem exigida + `VEREDITO JEDY`.
   - **Antítese Sith (Ruptura & Velocidade):** Cortes radicais `[ALTA|MÉDIA|BAIXA]` + rota assimétrica 80/20 + `VEREDITO SITH`.
   - **Convergência Rara:** Onde até Jedy e Sith concordam (ação obrigatória e imediata).
   - **Divergência Irredutível:** O trade-off real entre fundação/segurança vs. velocidade/alavancagem para decisão final do humano.

---

## 3. Quando Usar
- **Sim:** Todo planejamento de projeto, estratégia de produto/negócio, definição de escopo de sprint, arquitetura, além de mudanças de risco (auth/autorização, schema de banco, contrato de API, segurança, LGPD, checklist de deploy, decisão financeira).
- **Em diffs de segurança (auth, RBAC/IDOR/RLS, segredos, certificados, logs/PII):** rode **sempre** com `--exigir-falha-base --teste-cmd "..."` para impedir falsos verdes.
- **Não:** Ajuste trivial de formatação ou qualquer envio ao script externo `conselho.mjs` contendo dado sensível (ver regras de segurança abaixo).

---

## 4. Regras Inegociáveis de Segurança
1. **Dado sensível** (dados de clientes, segredos, `.env`): **não envie ao script externo `conselho.mjs`**. Os anciões de CLI são serviços externos. O script bloqueia `.env`, chaves e os caminhos da lista de bloqueio (também em diffs: o arquivo sensível sai do envio e vira aviso; em `--diff-file` o patch inteiro é recusado) e redige segredos e PII (CPF, CNPJ, e-mail), mas o filtro é por nome e por padrão de texto e não pega tudo (ex.: `.env` renomeado E reescrito quase todo vira apagar+criar e o arquivo novo passa; renomeação pura é pega). Em dúvida, rode `--dry-run` e leia o que sairia.
2. **Avise em uma linha** o que vai e para onde (o material sai da máquina) antes de rodar `conselho.mjs`.
3. **Chamada de CLI sem API paga:** O Argon usa a cota do plano Pro (`agy`) e o Opus usa o plano do Claude Code. O script remove `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN` do ambiente do Opus (usa o plano); só `--permitir-api` mantém a chave e cobra por API.
4. **Teto do script CLI:** O menor `maxChars` entre os anciões ativos (Argon: 24.000 caracteres, limite do `agy`; Opus: 200.000). Acima disso o script bloqueia: divida por arquivo ou use `--only` num ancião com teto maior. `--max-chars` acima do teto é recusado.
5. **Soberania:** Parecer é opinião, não ordem. Divergência entre **Jedy** e **Sith** (ou entre os modelos do CLI) sobe diretamente para o usuário decidir.

---

## 5. Como Rodar o Motor Multi-Modelo (`scripts/conselho.mjs`)

```bash
# Modo Rival (--rival): 1º ancião julga com a lente Ordem/Jedy e 2º ancião com a lente Ruptura/Sith
node ~/.claude/skills/conselho-dos-ancioes/scripts/conselho.mjs --rival --arquivo plano.md --pedido "pedido original"

# Revisão de diff de segurança com Prova Red -> Green obrigatória (--exigir-falha-base)
node ~/.claude/skills/conselho-dos-ancioes/scripts/conselho.mjs --rival --rev HEAD \
  --exigir-falha-base --teste-cmd "pytest -q tests/test_auth.py" --contexto "bloqueia acesso IDOR"

# Modo Neutro (padrão clássico sem lentes rivais, ou forçando --modo neutro)
node ~/.claude/skills/conselho-dos-ancioes/scripts/conselho.mjs --rev HEAD --contexto "1 frase"
```

- **Prova Red → Green (`--exigir-falha-base` + `--teste-cmd "<comando>"`):**
  - Cria dois `git worktree` descartáveis fora do repositório (zero alteração na sua árvore de trabalho):
    1. **RED:** código de produção no commit base (`--base-rev`, ou base automática de `--rev` / `HEAD`) + apenas os arquivos de teste adicionados/alterados no alvo (`--teste-arquivo` ou detecção automática). Exige que o teste **falhe** (`exit != 0`). Se passar, bloqueia imediatamente com **exit 7 (`FALSO VERDE`)** sem gastar cota de LLM.
    2. **GREEN:** código completo corrigido no alvo. Exige que o mesmo teste **passe** (`exit 0`). Se falhar, bloqueia com **exit 7**.
  - Quando Red falha e Green passa, anexa o resumo sanitizado da execução (`=== PROVA RED -> GREEN EXECUTADA ===`) ao material para que os anciões confirmem se a falha na base veio realmente da brecha/regra corrigida (e não de `ImportError`/sintaxe).
  - Se um `diff` tocar termos de segurança (`auth`, `jwt`, `token`, `idor`, `rls`, `certificado`, `pii`, `webhook`, etc.) sem `--exigir-falha-base`, o script emite `AVISO` sugerindo ativar a trava.
- **Lentes Rivais (`--rival` ou `--modo rival|neutro`):**
  - Com `--rival` (ou `--modo rival`), o motor injeta automaticamente a lente **Polo da Ordem (`Ordem/Jedy`)** no 1º ancião e **Polo da Ruptura (`Ruptura/Sith`)** no 2º ancião (ou usa a propriedade `"lente"` definida em cada item de `--revisores`).
  - Com `--modo neutro`, qualquer lente configurada é desativada para uma revisão técnica neutra.
- **Código (diff):** `--rev HEAD` (ou `a..b`; `:` é proibido, `HEAD:arquivo` leria o blob e furaria o filtro), `--diff-file x.patch`, ou nada (usa `git diff HEAD`). `--repo DIR`.
- **Artefato (Plano, Estratégia, Proposta, Spec):** `--arquivo a.md` (repetível) e/ou `--texto "..."` + **sempre** o pedido original: `--pedido "..."`, `--criterio "..."` ou `--pedido-arquivo f.txt`.
- **Artefato sem pedido é bloqueado** (exit 2); `--sem-pedido` força.
- **Diff:** lockfiles e arquivos sensíveis ficam fora e aparecem como `AVISO`. Arquivos novos não rastreados ficam fora (aviso); `--incluir-novos` os inclui (até 100 KB cada).
- **Opções:** `--rival`, `--modo rival|neutro`, `--exigir-falha-base`, `--teste-cmd "..."`, `--base-rev REV`, `--teste-arquivo REL`, `--revisores arquivo.json`, `--only nome`, `--permitir-api`, `--incluir-novos`, `--sem-pedido`, `--max-chars N`, `--effort low|medium|high` (Argon, padrão medium), `--claude-model id` (padrão `claude-opus-5-5`), `--timeout seg` (mín. 300, com aviso se subir), `--dry-run`.
- **Código de saída:** `0` = todos deram parecer válido; `5` = só parte (resposta sem veredito conta como falha); `6` = nenhum; `2/3/4` = bloqueio antes de enviar (entrada, segredo, teto); `7` = bloqueio na Prova Red → Green (sem teste, falso verde na base ou falha no alvo).
- O material vai entre marcadores aleatórios e o ancião é instruído a tratá-lo como dado, não como ordem. Cada ponto deve citar trecho do material.
- Os anciões rodam em pasta vazia, sem ferramentas (Opus `--tools ""`; Argon `--mode plan`) e só veem o prompt. Leva ~20 a 60 s. No timeout o processo e os filhos são encerrados (`taskkill /T /F` no Windows).
- Log só de metadados em `~/.claude/logs/conselho.jsonl` (nunca o conteúdo).

---

## 6. Outros Modelos e Lentes Customizadas via `--revisores`

`--revisores arquivo.json` (ou a variável `CONSELHO_REVISORES`) **substitui** o par padrão. Cada ancião aceita o campo opcional `"lente"` (`"ordem"`, `"ruptura"`, `"jedy"`, `"sith"` ou qualquer instrução de lente customizada):

```json
[
  {
    "nome": "jedy-opus",
    "lente": "ordem",
    "cmd": "claude",
    "args": ["-p", "--model", "claude-opus-5-5", "--tools", ""],
    "entrada": "stdin",
    "maxChars": 200000,
    "removerEnv": ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"]
  },
  {
    "nome": "sith-gemini",
    "lente": "ruptura",
    "cmd": "gemini",
    "args": ["-m", "gemini-4-hydrogen", "--skip-trust", "--approval-mode", "plan", "-p", "Responda ao conteudo recebido por stdin."],
    "entrada": "stdin",
    "maxChars": 100000,
    "removerEnv": ["GEMINI_FREE_KEY", "GEMINI_PAID_KEY", "GOOGLE_API_KEY"],
    "definirEnv": { "GEMINI_API_KEY": "GEMINI_FREE_KEY" }
  }
]
```

- `lente`: `"ordem"` (ou `"jedy"`), `"ruptura"` (ou `"sith"`), ou uma frase customizada (ex.: `"Julgue exclusivamente sob a ótica de FinOps e corte de custos de nuvem"`).
- `entrada: "stdin"`: o prompt vai pelo stdin. `entrada: "arg"`: um item de `args` deve ser exatamente `{prompt}` (o Windows limita a linha de comando a ~32K: use `maxChars` ≤ 24000).
- `removerEnv`: variáveis que o ancião **não** recebe. `definirEnv`: `{ "VAR_DO_ANCIAO": "VAR_DO_SEU_AMBIENTE" }` copia o valor de outra variável (só nomes, nunca valores no JSON). Os valores também são redigidos da saída.
- **Windows:** CLIs do npm (`gemini`, `codex`) são shims `.cmd`; o script os acha com `where` e roda via `cmd.exe`, mas só com `entrada: "stdin"` e argumentos sem `& | < > ^ % "` (o prompt nunca vai na linha de comando).
- Lista de bloqueio própria: variável `CONSELHO_CAMINHOS_BLOQUEADOS` (regexes separadas por `;`) ou `~/.claude/conselho.bloqueios.json` (array de regexes).

---

## 7. Testes Automatizados
`node --test` na pasta `scripts/` (sem gastar cota: os "modelos" dos testes são processos `node`).
