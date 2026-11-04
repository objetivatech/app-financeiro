# Arquitetura

## Visão geral

```
Navegador ──(Cloudflare Access + Tunnel)──► Next.js (VPS, Docker) ──► PostgreSQL (VPS, Docker)
                                                   │
                                                   └──► API do Claude (leitura de PDF/imagem, classificação, dicas)
```

- **Next.js 16 (App Router, TypeScript)** — telas e uma rota de importação (`/api/importar`). Componentes de servidor
  leem o banco direto; mutações via Server Actions.
- **PostgreSQL 16 + Drizzle ORM** — schema em `src/lib/db/schema.ts`, migrações em `drizzle/`.
- **Claude (Anthropic)** — via `@anthropic-ai/sdk`, com saída estruturada (schemas Zod). Modelo por tarefa
  (`ia/cliente.ts`): Haiku 5.5 para extração e classificação, Opus 5.5 para a análise mensal; fallback de recusa
  (`fallbacks: "default"`) só nos modelos que suportam. Cada chamada registra tokens e custo estimado em `uso_ia`.
  PDFs com camada de texto são lidos localmente (`unpdf`) e só o texto vai para a IA.

A VPS (2 vCPU / 4 GB) roda app e banco com folga para um usuário. Rodar um modelo de IA local nessa máquina não vale a
pena: os modelos que cabem em 4 GB são lentos e fracos em português e em raciocínio financeiro.

## Pipeline de importação (`src/lib/importacao`)

1. `detectar.ts` — formato pela assinatura dos bytes (PDF, PNG, JPEG, WEBP, GIF, ZIP/XLSX, HEIC) e, para texto, OFX ou
   CSV. Formatos ainda não suportados recebem mensagem explicando o que fazer.
2. Leitura:
   - `parsers/ofx.ts` — OFX 1.x (SGML) e 2.x (XML); banco pelo `BANKID` (código COMPE) ou `ORG`.
   - `parsers/csv.ts` — heurístico: acha a linha de cabeçalho, mapeia colunas por sinônimos (data, descrição, valor,
     crédito/débito, D/C), entende valores no padrão brasileiro, Windows-1252, preâmbulos e faturas com sinal
     invertido. Reconhece assinaturas conhecidas (ex.: Nubank).
   - `ia/extrator.ts` — PDF, imagem ou CSV desconhecido vão para o Claude, que devolve o extrato no formato
     normalizado (`tipos.ts`).
3. `persistir.ts` — identifica/cria o titular (CPF/CNPJ do extrato) e a conta; grava a importação e as transações.

### Deduplicação

- **Arquivo:** SHA-256 do conteúdo; o mesmo arquivo não entra duas vezes.
- **Transação:** chave `(conta, data, valor, ordem da ocorrência daquele par no arquivo)`. É independente da
  descrição, então o mesmo mês importado em OFX e depois em PDF não duplica, e duas compras iguais no mesmo dia
  continuam sendo duas.

## Classificação (`src/lib/classificacao`)

Cada transação tem **escopo** (PF/PJ), **categoria** e **natureza** — a natureza é o diferencial PF×PJ:
`retirada_socio`, `pro_labore`, `distribuicao_lucros`, `aporte_socio`, `despesa_pessoal_na_pj`, `despesa_pj_na_pf`,
`transferencia_interna`, `pagamento_fatura`, `imposto`, `investimento`, `estorno`, `comum`.

Ordem de prioridade (uma etapa nunca sobrescreve outra de prioridade maior):

| Prioridade | Origem | Exemplo |
|---|---|---|
| 6 | usuário | correção manual |
| 5 | regra | "descrição contém NETFLIX → PF, Assinaturas" (criada a partir de correções) |
| 4 | transferência | mesmo valor saindo de uma conta e entrando em outra sua em até 3 dias |
| 3 | heurística | DAS do Simples, pagamento de fatura, pró-labore, aplicação/resgate; e os classificadores complementares |
| 2 | IA | categoria + escopo pela natureza do gasto, com confiança |
| 1 | conta | palpite inicial pelo escopo da conta |

**Classificadores complementares** (`classificacao/enriquecimento.ts`, puro; `classificacao/cnpj.ts`, rede + cache),
aplicados com origem "heurística" depois do pareamento de transferências e antes da IA, só no que ainda está sem
categoria: (1) histórico das correções manuais pela chave do estabelecimento (≥ 80% de concordância); (2) dicionário de
estabelecimentos brasileiros (`TipoGasto` → categoria por escopo; ferramentas de trabalho forçam PJ); (3) CNPJ da
contraparte → CNAE pela BrasilAPI, com cache na tabela `empresas` (só CNPJ; `CONSULTA_CNPJ=0` desliga; nos testes,
desligado). Análise das alternativas em `docs/CLASSIFICADORES.md`.

Depois, `marcarMistura` sinaliza gasto PF em conta PJ (e vice-versa). Transferências PJ→PF viram `retirada_socio`
para você definir se foi pró-labore ou distribuição de lucros (o tratamento tributário é diferente).

## Integrações (`src/lib/integracoes`)

Somente leitura. Cada integração grava o estado em `integracoes` (status, última sincronização, até onde o
extrato já foi trazido) e roda sozinha pelo agendador em `src/instrumentation.ts` (a cada 6 h).

**Asaas** (`integracoes/asaas`): cliente HTTP da API v3 (`access_token` no cabeçalho, paginação de 100 em 100,
nova tentativa em 429/5xx) e sincronização em quatro passos:

1. Saldo (`/finance/balance`).
2. Cobranças (`/payments`) → `compromissos` (tipo *receber*, escopo PJ), com cliente (`/customers/{id}` → `clientes`).
3. Notas fiscais (`/invoices`) → `notas_fiscais` (receita bruta para o Simples).
4. Extrato (`/financialTransactions`, dias completos até ontem) → `transacoes` da conta "Asaas · PJ", pelo mesmo
   `gravarExtrato` usado pelos arquivos. Tipos conhecidos (recebimento, taxas, fatura do cartão Asaas) já chegam
   classificados; recebimentos são conciliados com a cobrança (`compromissos.transacao_id`).

Na primeira sincronização: 13 meses de cobranças e notas; o extrato começa depois do último lançamento já
importado por arquivo nessa conta, para não duplicar.

## Compromissos e fiscal

- `compromissos`: o que vai entrar ou sair (hoje, cobranças do Asaas; depois, recorrências, dívidas e lançamentos
  manuais). Status `aberto`, `vencido`, `pago`, `cancelado`.
- `src/lib/fiscal/simples.ts`: tabelas dos Anexos III e V, alíquota efetiva, Fator R e diagnóstico (pró-labore
  mínimo, receita máxima). `fiscal/indicadores.ts`: receita mensal (notas autorizadas, ou recebimentos), RBT12 e
  indicadores de contas a receber.

## Cartões (`src/lib/cartoes`)

- `contas` de tipo cartão guardam `dia_fechamento`, `dia_vencimento`, `limite_centavos` e `conta_pagamento_id`.
- `faturas` (uma por cartão e vencimento) vêm da leitura do PDF (a IA devolve vencimento, fechamento, total e mínimo)
  ou do lançamento manual; cada uma gera um compromisso *pagar* (origem `fatura`, categoria `mov_fatura`) na conta que
  paga o cartão. A conciliação marca a saída como `pagamento_fatura`.
- `calculo.ts` (puro): fatura de uma compra pelo fechamento/vencimento e projeção de parcelas futuras (a parcela mais
  recente de cada compra, identificada pela descrição sem o "3/10", valor e total de parcelas).
- A deduplicação inclui o número da parcela no hash, porque a fatura repete a data da compra original todo mês.
- O fluxo de caixa soma as parcelas futuras nos meses sem fatura conhecida; compromissos cadastrados no cartão (ex.:
  compra parcelada lançada como dívida) saem do fluxo nos meses com fatura conhecida.

## Painéis e análise (`src/lib/visoes`)

- `consultas.ts`: uma consulta agrega o mês em "somas" (receita, impostos, despesas, dívidas, cada natureza do fluxo
  sócio ↔ empresa, investimentos…), separadas por escopo e sinal.
- `calculo.ts` (puro): transforma as somas nas visões **PJ** (DRE gerencial de caixa), **PF** (renda, custo de vida,
  sobra) e **consolidada**. Regras: transferências PJ ↔ PF contam uma vez (maior das duas pernas); gasto pessoal pago
  pela PJ é saída da PJ e renda + custo da PF; gasto da PJ pago pela PF é despesa da PJ e aporte da PF; estornos abatem.
  Invariante testada: ficou na empresa + sobrou para você = resultado consolidado.
- `paineis.ts`: junta visões, saldos, dívidas, cartões, recebíveis e Fator R para as três telas, e monta os nós do
  diagrama de fluxo (`components/fluxo-dinheiro.tsx`, Sankey em SVG renderizado no servidor).

Movimentações entre bolsos (transferências, faturas, investimentos) não contam como receita/despesa. `src/lib/ia/analise.ts` manda à IA só dados agregados (as três
visões, categorias, dívidas, recorrentes, maiores saídas) e recebe diagnóstico, alertas, dicas e perguntas para o contador.

## Privacidade

| Vai para a API do Claude | Não vai |
|---|---|
| PDFs e imagens de extrato (para leitura) | CPF/CNPJ na classificação e nas dicas |
| Data, descrição, valor e tipo da conta (classificação) | Número de conta e agência na classificação e nas dicas |
| Totais e maiores saídas do mês (dicas) | Nada é enviado se a chave não estiver configurada |

A consulta de CNPJ (BrasilAPI) envia só o CNPJ da empresa que recebeu um pagamento — dado público. CPF nunca é
consultado.
