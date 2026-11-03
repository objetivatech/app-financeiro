# Financeiro PF + PJ

Finanças pessoais e da empresa no mesmo app, **sem misturar**. Você importa extratos e faturas de todas as contas
(OFX, CSV, PDF ou foto), o app identifica banco, conta e transações, separa o que é pessoal (PF) do que é da empresa
(PJ), encontra transferências entre suas contas (retiradas, pró-labore, aportes) e aponta onde as duas coisas estão se
misturando. Uma IA lê os PDFs/fotos, classifica o que as regras não resolvem e gera dicas para o seu fluxo financeiro.

> Projeto piloto de uso pessoal. Veja a visão completa em [docs/VISAO.md](docs/VISAO.md).

## Como funciona

1. **Importar** — arraste arquivos. OFX e CSV são lidos por parsers próprios (sem custo de IA); PDF, imagens e CSVs de
   layout desconhecido são lidos pela IA. Arquivos repetidos e períodos sobrepostos não duplicam transações.
2. **Contas** — cada arquivo cai na conta certa (criada automaticamente na primeira vez). Você diz se a conta é PF,
   PJ ou mista.
3. **Classificação** — em camadas: suas correções › regras aprendidas › transferências entre contas próprias ›
   heurísticas (DAS, fatura, pró-labore…) › IA › escopo da conta.
4. **Painel** — resultado da empresa, custo de vida, quanto saiu da empresa para você, gastos misturados e
   diagnóstico com dicas da IA.

## Rodando localmente

Requisitos: Node 22, pnpm 10, PostgreSQL 16.

```bash
pnpm install
cp .env.example .env.local     # preencha DATABASE_URL e, se quiser IA, ANTHROPIC_API_KEY
pnpm db:migrar                 # cria as tabelas e as categorias
pnpm dev                       # http://localhost:3000
```

## Testes

```bash
pnpm test                      # unitários (parsers, motor de classificação)
TEST_DATABASE_URL=postgres://…/financeiro_teste pnpm test   # inclui o teste de ponta a ponta com banco
pnpm typecheck && pnpm lint
```

## Colocando na VPS

Veja [docs/DEPLOY-VPS.md](docs/DEPLOY-VPS.md): Docker Compose (Postgres + app), acesso por Cloudflare Tunnel +
Cloudflare Access e backup criptografado.

## Estrutura

```
src/lib/importacao/     detecção de formato, parsers OFX/CSV, persistência e deduplicação
src/lib/instituicoes/   catálogo de bancos/emissores (código COMPE + apelidos)
src/lib/classificacao/  categorias, motor de regras/heurísticas/transferências, classificação por IA
src/lib/ia/             cliente do Claude, extração de PDF/imagem, análise e dicas
src/lib/db/             schema (Drizzle) e conexão
src/app/                telas (Next.js App Router) e rota de importação
drizzle/                migrações SQL
```

Mais detalhes em [docs/ARQUITETURA.md](docs/ARQUITETURA.md) e próximos passos em [docs/ROADMAP.md](docs/ROADMAP.md).
