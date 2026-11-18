---
name: conselho-dos-ancioes
description: >
  Segunda opinião independente de dois modelos de famílias diferentes (Opus 5.5 pelo plano do Claude Code
  e Gemini 4 Argon pelo Antigravity) sobre um trabalho já feito: diff de código (correção, mudança de
  segurança) ou qualquer artefato (proposta, plano, roteiro, decisão, trabalho de outra IA) conferido
  contra o pedido original. Devolve pareceres curtos com gravidade e veredito; o ULTRON faz a síntese.
  Use em "chama o conselho dos anciões", "pede uma segunda opinião", ou por conta própria após mudança
  de RISCO (auth, schema, contrato de API, segurança, LGPD, deploy). Não use em mudança trivial.
author: Baseado na skill de Danilo Gato (@odanilogato, cpdf.ai); adaptada pelo ULTRON (ADR-012)
version: 1.0.0
---

# Conselho dos Anciões (Opus + Argon)

Dois revisores de famílias diferentes olham o mesmo material. O valor está onde **discordam**.
Complementa o Conselho do ADR-012 (pré-trabalho: Opus propõe, Argon critica). Este é pós-trabalho.
Não substitui `murphy`, `dementador` nem `ecc:code-reviewer` (que enxergam o repositório): entra **depois** deles.

## Quando usar
- Sim: mudança de auth/autorização, schema de banco, contrato de API, segurança, LGPD, checklist de deploy; proposta ou decisão com dinheiro; trabalho grande entregue por outra IA.
- Não: ajuste trivial, texto curto de baixo risco, qualquer coisa com dado sensível (ver regras).

## Regras (ADR-012)
1. **Dado sensível** (JMB, cliente, segredos, `.env`): **não use o Conselho**. O Argon é serviço externo. O script bloqueia `.env`, chaves e o vault JMB, e redige segredos e PII (CPF, CNPJ, e-mail), mas o filtro é por padrão de texto e não pega tudo. Em dúvida, rode `--dry-run` e leia o que sairia.
2. **Avise em uma linha** o que vai e para onde (o material sai da máquina) antes de chamar por conta própria.
3. **Chamada automática** só para mudança de risco. Nunca com API paga: o Argon usa a cota do plano Pro (agy) e o Opus usa o plano. Se `ANTHROPIC_API_KEY` existir, o `claude -p` pode cobrar por API: o script avisa.
4. **Teto:** 24.000 caracteres (limite do Argon via agy). Acima disso, o script bloqueia: divida por arquivo.
5. Parecer é opinião, não ordem. Divergência entre os modelos **sobe para o Gabriel**.

## Como rodar
```
node ~/.claude/skills/conselho-dos-ancioes/scripts/conselho.mjs <entrada> [--contexto "1 frase"]
```
- **Código (diff):** `--rev HEAD` (ou `a..b`), `--diff-file x.patch`, ou nada (usa `git diff HEAD`). `--repo DIR`.
- **Artefato:** `--arquivo a.md` (repetível) e/ou `--texto "..."` + **sempre** o pedido original: `--pedido "..."`, `--criterio "..."` ou `--pedido-arquivo f.txt`.
- **Opções:** `--only opus|argon`, `--effort low|medium|high` (Argon, padrão medium), `--claude-model id` (padrão `claude-opus-5-5`), `--timeout seg` (mín. 300), `--dry-run`.
- Os anciões rodam em pasta vazia, sem ferramentas (Opus `--tools ""`; Argon `--mode plan`) e só veem o prompt. Leva ~20 a 60 s.
- Log só de metadados em `~/.claude/logs/conselho.jsonl` (nunca o conteúdo).
- Fable 5.2 exige créditos de uso extras: não é o padrão. Para usar: `--claude-model claude-fable-5-2` (cobrado).

## Síntese (quem chamou escreve)
Cada ancião responde com pontos `[ALTA|MÉDIA|BAIXA] local - problema e correção` e `VEREDITO: APROVA | APROVA COM RESSALVAS | REPROVA`. Depois da saída:
1. **Concordam:** pontos dos dois. Confiança alta: corrigir.
2. **Discordam:** pontos de um só, ou vereditos diferentes. Ler o código e decidir; se não der, subir ao Gabriel.
3. **Veredito final:** seguir, corrigir antes, ou levar ao Gabriel.
Se um ancião falhar (`FALHOU`), o outro vale como parecer único: diga isso. Aviso: o síntese vem de um Claude e pode favorecer o Opus; confira o Argon com atenção.
