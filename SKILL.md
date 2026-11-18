---
name: conselho-dos-ancioes
description: >
  Segunda opinião independente de dois ou mais modelos de IA de famílias diferentes (padrão: Opus 5.5 pelo plano
  do Claude Code e Gemini 4 Argon pelo Antigravity; qualquer outro modelo com CLI entra por um arquivo de
  configuração) sobre um trabalho já feito: diff de código (correção, mudança de segurança) ou qualquer
  artefato (proposta, plano, roteiro, decisão, trabalho de outra IA) conferido contra o pedido original.
  Devolve pareceres curtos com gravidade e veredito; o ULTRON faz a síntese.
  Use em "chama o conselho dos anciões", "pede uma segunda opinião", ou por conta própria após mudança
  de RISCO (auth, schema, contrato de API, segurança, LGPD, deploy). Não use em mudança trivial.
author: Baseado na skill de Danilo Gato (@odanilogato, cpdf.ai); adaptada pelo ULTRON (ADR-012)
version: 1.3.0
---

# Conselho dos Anciões (Opus + Argon, ou os modelos que você configurar)

Revisores de famílias diferentes olham o mesmo material. O valor está onde **discordam**.
Complementa o Conselho do ADR-012 (pré-trabalho: Opus propõe, Argon critica). Este é pós-trabalho.
Não substitui `murphy`, `dementador` nem `ecc:code-reviewer` (que enxergam o repositório): entra **depois** deles.

## Quando usar
- Sim: mudança de auth/autorização, schema de banco, contrato de API, segurança, LGPD, checklist de deploy; proposta ou decisão com dinheiro; trabalho grande entregue por outra IA.
- Não: ajuste trivial, texto curto de baixo risco, qualquer coisa com dado sensível (ver regras).

## Regras (ADR-012)
1. **Dado sensível** (JMB, cliente, segredos, `.env`): **não use o Conselho**. Os anciões são serviços externos. O script bloqueia `.env`, chaves e os caminhos da lista de bloqueio (também em diffs: o arquivo sensível sai do envio e vira aviso; em `--diff-file` o patch inteiro é recusado) e redige segredos e PII (CPF, CNPJ, e-mail), mas o filtro é por nome e por padrão de texto e não pega tudo (ex.: `.env` renomeado E reescrito quase todo vira apagar+criar e o arquivo novo passa; renomeação pura é pega). Em dúvida, rode `--dry-run` e leia o que sairia.
2. **Avise em uma linha** o que vai e para onde (o material sai da máquina) antes de chamar por conta própria.
3. **Chamada automática** só para mudança de risco. Nunca com API paga: o Argon usa a cota do plano Pro (agy) e o Opus usa o plano. O script remove `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN` do ambiente do Opus (usa o plano); só `--permitir-api` mantém a chave e cobra por API.
4. **Teto:** o menor `maxChars` entre os anciões ativos (Argon: 24.000 caracteres, limite do agy; Opus: 200.000). Acima disso o script bloqueia: divida por arquivo ou use `--only` num ancião com teto maior. `--max-chars` acima do teto é recusado.
5. Parecer é opinião, não ordem. Divergência entre os modelos **sobe para o Gabriel**.

## Como rodar
```
node ~/.claude/skills/conselho-dos-ancioes/scripts/conselho.mjs <entrada> [--contexto "1 frase"]
```
- **Código (diff):** `--rev HEAD` (ou `a..b`; `:` é proibido, `HEAD:arquivo` leria o blob e furaria o filtro), `--diff-file x.patch`, ou nada (usa `git diff HEAD`). `--repo DIR`.
- **Artefato:** `--arquivo a.md` (repetível) e/ou `--texto "..."` + **sempre** o pedido original: `--pedido "..."`, `--criterio "..."` ou `--pedido-arquivo f.txt`.
- **Artefato sem pedido é bloqueado** (exit 2); `--sem-pedido` força.
- **Diff:** lockfiles e arquivos sensíveis ficam fora e aparecem como `AVISO`. Arquivos novos não rastreados ficam fora (aviso); `--incluir-novos` os inclui (até 100 KB cada).
- **Opções:** `--revisores arquivo.json`, `--only nome`, `--permitir-api`, `--incluir-novos`, `--sem-pedido`, `--max-chars N`, `--effort low|medium|high` (Argon, padrão medium), `--claude-model id` (padrão `claude-opus-5-5`), `--timeout seg` (mín. 300, com aviso se subir), `--dry-run`.
- **Código de saída:** 0 = todos deram parecer válido; 5 = só parte (resposta sem veredito conta como falha); 6 = nenhum; 2/3/4 = bloqueio antes de enviar (entrada, segredo, teto).
- O material vai entre marcadores aleatórios e o ancião é instruído a tratá-lo como dado, não como ordem. Cada ponto deve citar trecho do material.
- Os anciões rodam em pasta vazia, sem ferramentas (Opus `--tools ""`; Argon `--mode plan`) e só veem o prompt. Leva ~20 a 60 s. No timeout o processo e os filhos são encerrados (`taskkill /T /F` no Windows).
- Log só de metadados em `~/.claude/logs/conselho.jsonl` (nunca o conteúdo).
- Fable 5.2 exige créditos de uso extras: não é o padrão. Para usar: `--claude-model claude-fable-5-2` (cobrado).

## Outros modelos (qualquer IA com CLI)
`--revisores arquivo.json` (ou a variável `CONSELHO_REVISORES`) **substitui** o par padrão. Cada ancião é um comando; sem shell, então o prompt nunca é interpretado:
```json
[
  { "nome": "alfa", "cmd": "meu-cli", "args": ["--sem-ferramentas"], "entrada": "stdin", "maxChars": 100000, "removerEnv": ["MINHA_CHAVE"] },
  { "nome": "beta", "cmd": "outro-cli", "args": ["--print", "{prompt}"], "entrada": "arg", "maxChars": 24000 }
]
```
- `entrada: "stdin"`: o prompt vai pelo stdin. `entrada: "arg"`: um item de `args` deve ser exatamente `{prompt}` (o Windows limita a linha de comando a ~32K: use `maxChars` ≤ 24000).
- `removerEnv`: variáveis que o ancião **não** recebe (chaves de outros serviços, para não cobrar API paga por engano). `definirEnv`: `{ "VAR_DO_ANCIAO": "VAR_DO_SEU_AMBIENTE" }` copia o valor de outra variável (só nomes, nunca valores no JSON; ex.: `GEMINI_API_KEY` a partir de `GEMINI_FREE_KEY`). Os valores também são redigidos da saída.
- **Windows:** CLIs do npm (gemini, codex) são shims `.cmd`; o script os acha com `where` e roda via `cmd.exe`, mas só com `entrada: "stdin"` e argumentos sem `& | < > ^ % "` (o prompt nunca vai na linha de comando).
- O CLI precisa responder só com texto, sem ferramentas, e terminar com `VEREDITO: APROVA | APROVA COM RESSALVAS | REPROVA`. Resposta sem veredito conta como falha.
- `--only nome` roda um ancião da lista (sem diferenciar maiúsculas). `revisores.exemplo.json` traz modelos de partida. **Testados:** Claude (`claude -p`) e Gemini CLI (`gemini -m gemini-4-hydrogen`, chave free, ~106 s). **Não testados:** Codex e Ollama (confira os argumentos no `--help` do seu CLI).
- Lista de bloqueio própria (pastas de clientes etc.): variável `CONSELHO_CAMINHOS_BLOQUEADOS` (regexes separadas por `;`) ou `~/.claude/conselho.bloqueios.json` (array de regexes). Aqui já bloqueia o vault e o perfil da JMB.

## Síntese (quem chamou escreve)
Cada ancião responde com pontos `[ALTA|MÉDIA|BAIXA] local - problema e correção` e `VEREDITO: APROVA | APROVA COM RESSALVAS | REPROVA`. Depois da saída:
1. **Concordam:** pontos de mais de um ancião. Confiança alta: corrigir.
2. **Discordam:** pontos de um só, ou vereditos diferentes. Ler o código e decidir; se não der, subir ao Gabriel.
3. **Veredito final:** seguir, corrigir antes, ou levar ao Gabriel.
Se um ancião falhar (`FALHOU`), os outros valem como parecer parcial: diga isso. Aviso: a síntese vem de um Claude e pode favorecer o Opus; confira os outros modelos com atenção.

## Testes
`node --test` na pasta `scripts/` (sem gastar cota: os "modelos" dos testes são processos `node`).
