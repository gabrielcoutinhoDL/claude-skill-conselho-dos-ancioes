# Conselho dos Anciões (skill para Claude Code)

Segunda opinião independente de dois modelos de famílias diferentes (Opus pelo plano do Claude Code e Gemini/Argon pelo Antigravity `agy`) sobre um trabalho já feito: diff de código ou qualquer artefato (proposta, plano, decisão), conferido contra o pedido original. Cada ancião devolve pontos com gravidade e um veredito; o valor está onde eles **discordam**.

## Instalação
Copie esta pasta para `~/.claude/skills/conselho-dos-ancioes/`. Requer Node 18+, `claude` CLI e `agy` (Antigravity).

## Uso
```
node ~/.claude/skills/conselho-dos-ancioes/scripts/conselho.mjs --rev HEAD --contexto "1 frase"
node ~/.claude/skills/conselho-dos-ancioes/scripts/conselho.mjs --arquivo plano.md --pedido "pedido original"
```
Segurança: arquivos sensíveis (`.env`, chaves) e lockfiles ficam fora do diff; o Opus roda sem `ANTHROPIC_API_KEY` (use `--permitir-api` para cobrar por API); artefato exige `--pedido`. Código de saída: 0 ok, 5 só um ancião respondeu, 6 nenhum.

Veja `SKILL.md` para todas as opções, regras e o formato da síntese. Use `--dry-run` para ver o que sairia da máquina.

## Aviso
O material enviado sai da máquina (Argon é serviço externo). O filtro de segredos/PII é por padrão de texto e não pega tudo. Não use com dados sensíveis.

## Testes
```
node --test scripts/conselho.test.mjs
```

## Créditos
Baseado na skill de Danilo Gato ([@odanilogato](https://github.com/odanilogato), cpdf.ai); reescrito e adaptado por Gabriel Coutinho. Licença: MIT.
