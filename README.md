# Conselho dos Anciões (skill para Claude Code)

Segunda opinião independente de dois ou mais modelos de IA de famílias diferentes sobre um trabalho já feito: diff de código ou qualquer artefato (proposta, plano, decisão), conferido contra o pedido original. Cada ancião devolve pontos com gravidade e um veredito; o valor está onde eles **discordam**.

Padrão: Opus (pelo plano do Claude Code) + Gemini Argon (pelo Antigravity `agy`). **Qualquer outro modelo com CLI** entra por um arquivo de configuração (`--revisores`).

## Instalação
Copie esta pasta para `~/.claude/skills/conselho-dos-ancioes/`. Requer Node 18+ e os CLIs dos anciões que você usar (`claude` e `agy` no par padrão). **Sem outras dependências**: a skill é autossuficiente.

## Uso
```
node ~/.claude/skills/conselho-dos-ancioes/scripts/conselho.mjs --rev HEAD --contexto "1 frase"
node ~/.claude/skills/conselho-dos-ancioes/scripts/conselho.mjs --arquivo plano.md --pedido "pedido original"
node ~/.claude/skills/conselho-dos-ancioes/scripts/conselho.mjs --arquivo plano.md --pedido "..." --revisores meus-modelos.json
```

## Outros modelos
`--revisores arquivo.json` (ou a variável `CONSELHO_REVISORES`) substitui o par padrão. Cada ancião é um comando, sem shell (o prompt nunca é interpretado):
```json
[
  { "nome": "alfa", "cmd": "meu-cli", "args": ["--sem-ferramentas"], "entrada": "stdin", "maxChars": 100000, "removerEnv": ["MINHA_CHAVE"] },
  { "nome": "beta", "cmd": "outro-cli", "args": ["--print", "{prompt}"], "entrada": "arg", "maxChars": 24000 }
]
```
`revisores.exemplo.json` traz pontos de partida (Claude, Gemini CLI, Codex, Ollama; os três últimos **não testados**, confira os argumentos no `--help` do seu CLI). O CLI deve responder só com texto, sem ferramentas, terminando com `VEREDITO: APROVA | APROVA COM RESSALVAS | REPROVA`.

## Segurança
- Arquivos sensíveis (`.env`, chaves) e lockfiles ficam fora do diff; patch com arquivo sensível é recusado.
- Lista de bloqueio própria: variável `CONSELHO_CAMINHOS_BLOQUEADOS` (regexes separadas por `;`) ou `~/.claude/conselho.bloqueios.json`.
- Segredos e dados pessoais são redigidos; chave privada aborta. `removerEnv` tira chaves do ambiente de cada ancião (o Opus roda sem `ANTHROPIC_API_KEY`, salvo `--permitir-api`).
- O material vai entre marcadores aleatórios, tratado como dado. Artefato exige `--pedido`.
- O material sai da máquina (os anciões são serviços externos). O filtro é por nome e por padrão de texto e não pega tudo. Não use com dados sensíveis; em dúvida, `--dry-run`.

Código de saída: 0 todos deram parecer válido, 5 só parte, 6 nenhum, 2/3/4 bloqueio antes de enviar. Veja `SKILL.md` para todas as opções, regras e o formato da síntese.

## Testes
```
cd scripts && node --test
```
Não gastam cota: os "modelos" dos testes são processos `node`.

## Créditos
Baseado na skill de Danilo Gato ([@odanilogato](https://github.com/odanilogato), cpdf.ai); reescrito e adaptado por Gabriel Coutinho. Licença: MIT.
