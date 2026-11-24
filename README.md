# Conselho dos Anciões v2.1 — 2 Agentes Rivais (`Jedy` ⚔️ `Sith`), Multi-Modelo & Prova Red → Green

Segunda opinião adversarial, debate estratégico e trava contra falsos verdes em segurança para **Claude Code**, **OpenBot** e arquiteturas multiagente.

Na **v2.1.0**, o Conselho dos Anciões combina:
1. **2 Agentes Rivais entre si (`Jedy` vs. `Sith`):** sem o agente orquestrador à frente do Conselho, confrontando **Claude Opus** + **Gemini Argon** (ou qualquer CLI em `--revisores`) com `--rival`.
2. **Prova Red → Green executável (`--exigir-falha-base`):** em diffs de segurança, roda o teste novo em *worktrees* descartáveis contra o commit base (exigindo falha comprovada = **Red**) e contra o código corrigido (exigindo aprovação = **Green**), bloqueando testes tautológicos (`exit 7`) antes de gastar cota de LLM e anexando a evidência real aos anciões.

---

## 1. A Visão dos 2 Agentes Rivais (`Jedy` ⚔️ `Sith`)

| Frente | Agente (`agents/`) | Filosofia & Lente de Julgamento | Pergunta Central |
|---|---|---|---|
| **Polo da Ordem (Tese)** | **Jedy** (`agents/jedy-ordem.md`) | Arquitetura limpa (SOLID/Clean Code), resiliência, contratos formais (RFC 7807), segurança estrutural (AppSec/LGPD), governança e sustentabilidade de 6 a 12 meses. | *"O que vai quebrar, vazar, gerar passivo ou destruir o projeto no longo prazo se cedermos à pressa imprudente?"* |
| **Polo da Ruptura (Antítese)** | **Sith** (`agents/sith-ruptura.md`) | Velocidade brutal de execução, alavancagem assimétrica, corte radical de escopo (Pareto 90/10), anti-burocracia, anti-overengineering e tração imediata. | *"Qual premissa fraca ou burocracia está travando o resultado hoje, o que cortamos pela metade agora e onde está a alavancagem máxima?"* |

### Fluxo do Debate Dialético (Sem o Orquestrador à Frente)
1. **Abertura (Tese vs. Antítese):** **Jedy** ataca riscos estruturais, segurança e dívida técnica; **Sith** ataca lentidão, gordura de escopo e complexidade desnecessária.
2. **Rebate Direto:** **Sith** desmonta onde a cautela de **Jedy** vira burocracia; **Jedy** bloqueia onde o atalho de **Sith** cria risco fatal.
3. **Veredito Dual para Decisão Humana:** Entrega os pontos de **Convergência Rara** (onde até Jedy e Sith concordam = ação imediata) e a **Divergência Irredutível** (o trade-off real entre fundação vs. velocidade para decisão soberana do usuário).

---

## 2. Instalação

1. Copie esta pasta para `~/.claude/skills/conselho-dos-ancioes/`.
2. **(Opcional / Recomendado) Ative os 2 Agentes Rivais:**
   - No **Claude Code**: copie `agents/jedy-ordem.md` e `agents/sith-ruptura.md` para `~/.claude/agents/` (ou `.claude/agents/` do seu repositório).
   - No **OpenBot / Sistema Multiagente**: crie os agentes **Jedy** e **Sith** usando os prompts de `agents/jedy-ordem.md` e `agents/sith-ruptura.md` e vincule esta skill a ambos.
3. Requer **Node 18+** e os CLIs dos anciões que você usar (`claude` e `agy` no par padrão). **Zero dependências externas npm**: a skill é 100% autossuficiente.

---

## 3. Uso do Motor CLI (`conselho.mjs`)

```bash
# Debate com Lentes Rivais (--rival): 1º ancião assume Ordem/Jedy e 2º assume Ruptura/Sith
node ~/.claude/skills/conselho-dos-ancioes/scripts/conselho.mjs --rival --arquivo plano.md --pedido "pedido original"

# Revisão de diff de segurança com Prova Red -> Green (--exigir-falha-base)
node ~/.claude/skills/conselho-dos-ancioes/scripts/conselho.mjs --rival --rev HEAD \
  --exigir-falha-base --teste-cmd "pytest -q tests/test_auth.py" --contexto "bloqueia acesso IDOR"

# Revisão técnica neutra (padrão clássico ou forçando --modo neutro)
node ~/.claude/skills/conselho-dos-ancioes/scripts/conselho.mjs --rev HEAD --contexto "1 frase"

# Usando modelos e lentes personalizados via JSON
node ~/.claude/skills/conselho-dos-ancioes/scripts/conselho.mjs --arquivo plano.md --pedido "..." --revisores meus-modelos.json
```

---

## 4. Outros Modelos e Lentes Customizadas (`--revisores`)

`--revisores arquivo.json` (ou a variável `CONSELHO_REVISORES`) substitui o par padrão. Cada ancião é um comando executado sem shell (o prompt nunca é interpretado) e aceita o campo opcional `"lente"` (`"ordem"`, `"ruptura"`, `"jedy"`, `"sith"` ou qualquer lente customizada):

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

`revisores.exemplo.json` traz configurações prontas (Claude e Gemini CLI **testados**; Codex e Ollama **não testados**). No Windows, CLIs do npm (shim `.cmd`) funcionam com `entrada: "stdin"`. Todo CLI deve responder só com texto, sem ferramentas, terminando com `VEREDITO: APROVA | APROVA COM RESSALVAS | REPROVA`.

---

## 5. Segurança & Prova Red → Green
- **Prova Red → Green (`--exigir-falha-base --teste-cmd "..."`):** executa o comando de teste sem shell arbitrário em `git worktree` temporário sobre o commit base (com apenas os arquivos de teste do alvo) e depois sobre o alvo completo. Bloqueia com `exit 7` se não houver teste, se o teste já passar na base (*falso verde*) ou se falhar no alvo.
- Arquivos sensíveis (`.env`, chaves) e lockfiles ficam fora do diff; patch com arquivo sensível é recusado.
- Lista de bloqueio própria: variável `CONSELHO_CAMINHOS_BLOQUEADOS` (regexes separadas por `;`) ou `~/.claude/conselho.bloqueios.json`.
- Segredos e dados pessoais (CPF, CNPJ, e-mail, tokens) são redigidos; chave privada aborta a execução (exit 3). `removerEnv` isola chaves do ambiente de cada ancião (o Opus roda pelo plano sem `ANTHROPIC_API_KEY`, salvo `--permitir-api`).
- O material vai entre delimitadores com sufixo aleatório (`<<<MATERIAL-nonce`), tratado estritamente como dado contra *prompt injection*. Artefato exige `--pedido`.
- Código de saída: `0` todos deram parecer válido, `5` só parte, `6` nenhum, `2/3/4` bloqueio (entrada/segredo/teto), `7` bloqueio na Prova Red → Green.

---

## 6. Testes
```bash
cd scripts && node --test
```
Não gastam cota de IA: os "modelos" dos testes são processos `node` locais.

## Créditos
Baseado na skill original de Danilo Gato ([@odanilogato](https://github.com/odanilogato), cpdf.ai); evoluído para Arquitetura de 2 Agentes Rivais (`Jedy` vs. `Sith`), motor CLI multi-modelo e Prova Red → Green por Gabriel Coutinho. Licença: MIT.
