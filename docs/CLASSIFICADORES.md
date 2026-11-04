# Classificadores de despesas: análise e decisão

Pesquisa feita em novembro de 2026 para complementar a classificação do app (regras + heurísticas + IA) com
classificadores de despesas pessoais e da empresa. O objetivo era **classificar melhor e gastar menos IA**, sem
abrir mão das regras do projeto: integrações só de leitura e CPF/CNPJ fora da IA.

## O que existe

| Opção | O que faz | Custo / acesso | Separa PF × PJ? | Encaixe aqui |
|---|---|---|---|---|
| **Pluggy — Transaction Enrichment** | Recebe até 5.000 transações por chamada e devolve categoria hierárquica + estabelecimento (nome, razão social, CNPJ). Aceita `isBusiness`, tipo de conta, MCC e CPF/CNPJ de pagador e recebedor; tem regras personalizadas | Recurso **premium**, liberado pelo time comercial; preço sob consulta | Indica se a conta é PJ (`isBusiness`), mas a categoria é única | Bom, mas pago e exige enviar descrições (e documentos) a terceiros. Fica como plano B |
| **Belvo — Categorization / Enrich your own data** | Categoria e subcategoria padronizadas + dados do estabelecimento (nome, logo, site); cobre o Brasil | Comercial | Não encontrei separação PF/PJ | Mesmo caso da Pluggy |
| **Salt Edge — Data enrichment** | Categorias com tipos **pessoais** e **empresariais** | Comercial; padrão do Reino Unido, precisaria configurar para o Brasil | Sim | Pouco aderente ao Brasil |
| **Plaid — Personal Finance Categories (PFCv2)** | Taxonomia pública (CSV) com ~16 categorias primárias e ~100 detalhadas | Taxonomia publicada; a API não atende o Brasil | Não | Referência de taxonomia, não de serviço |
| **MCC (código de categoria do estabelecimento)** | Código de 4 dígitos que o adquirente atribui à loja (ISO 18245; no Brasil, Cadastro Unificado da Abecs) | Gratuito, mas **só vem em algumas faturas/APIs** | Não | Útil quando o emissor informar; hoje as faturas em PDF quase nunca trazem |
| **CNPJ → CNAE (Receita Federal)** | A atividade econômica oficial da empresa que recebeu o pagamento. BrasilAPI expõe o cadastro de graça, sem chave | **Gratuito** | Não, mas a atividade diz muito (restaurante, farmácia, contabilidade…) | **Adotado** |
| **Tabela CNAE do IBGE** | Hierarquia oficial (seção, divisão, grupo, classe, subclasse) | Gratuita | — | Base do mapeamento CNAE → categoria |
| **Regras determinísticas (Firefly III, Actual)** | Motores de regra "descrição contém X → categoria", ordenados | Código aberto | — | O app já tem (regras aprendidas com correções) |
| **ML aberto (Transaction AI, Tally etc.)** | MCC + regras + classificador de embeddings + LLM como último recurso | Código aberto, projetos novos e pouco validados | — | A arquitetura em camadas confirma o desenho do app; não vale adicionar dependência |

## Decisão (v0.6.0)

Três camadas gratuitas **antes da IA**, todas explicáveis (o motivo aparece na transação):

1. **Histórico das suas correções**: o mesmo estabelecimento recebe a decisão que você já tomou à mão, se ela for
   consistente (≥ 80%). É o "aprendizado" mais barato e mais personalizado que existe.
2. **Dicionário de estabelecimentos brasileiros** (iFood, Uber, 99, postos, supermercados do RS, farmácias, CEEE/DMAE,
   operadoras, streaming, Hostinger, Registro.br, Google Ads, ferramentas de SEO…). Ferramentas de trabalho de uma
   agência de marketing/SEO vão para a **empresa** mesmo pagas na conta pessoal — e aí o app aponta a mistura.
3. **CNPJ do recebedor → CNAE** pela BrasilAPI, com cache local (cada CNPJ é consultado uma vez). Só CNPJ: CPF nunca
   é consultado, e nada disso vai para a IA. Pode ser desligado (`CONSULTA_CNPJ=0`).

O que sobra continua indo para a IA (Haiku 5.5), que agora recebe bem menos transações.

**Por que não Pluggy/Belvo agora:** são pagos, exigem contrato e mandariam descrições e documentos para fora — o
ganho sobre as três camadas acima não justifica no piloto. Se, com os extratos reais, a taxa de "sem categoria" ou
de correções continuar alta, a Pluggy é a candidata (aceita `isBusiness`, MCC e CPF/CNPJ, e tem regras próprias).

## Como medir

Na tela de Transações, o motivo mostra quem classificou ("Estabelecimento conhecido", "Igual a N lançamentos…",
"Atividade de quem recebeu (CNAE…)", ou a IA). Vale acompanhar, por mês: quantas foram para a IA, quantas você
corrigiu e de qual camada vieram as correções. Correção frequente num estabelecimento do dicionário = ajustar o
dicionário.

## Fontes

- Pluggy — [Enriquecimento de transações](https://docs.pluggy.ai/pt/docs/intelligence/transaction-enrichment) e
  [categorias](https://docs.pluggy.ai/reference/category)
- Belvo — [Enrich your own data](https://developers.belvo.com/docs/enrich-your-own-data) e
  [Transactions (OFDA)](https://developers.belvo.com/docs/transactions-ofda-data)
- Salt Edge — [Data enrichment](https://docs.saltedge.com/data_enrichment/)
- Plaid — [Taxonomia PFC](https://plaid.com/docs/transactions/pfc-migration/) e
  [anúncio da taxonomia](https://plaid.com/blog/transactions-categorization-taxonomy/)
- MCC — [Wikipedia](https://en.wikipedia.org/wiki/Merchant_category_code) e
  [Transfeera](https://transfeera.com/blog/mcc-merchant-category-code/)
- CNAE — [Subclasses da CNAE (IBGE/Concla)](https://cnae.ibge.gov.br/classificacoes/por-tema/atividades-economicas/subclasses-da-cnae-2-2)
- BrasilAPI CNPJ — endpoint `https://brasilapi.com.br/api/cnpj/v1/{cnpj}` (público, sem chave)
- Código aberto — [Transaction AI](https://transaction-ai.readthedocs.io),
  [Firefly III × Actual Budget](https://beancount.io/es/blog/2026/07/26/firefly-iii-vs-actual-budget-self-hosted-open-source-budgeting-guide)
- Asaas — [Extrato (`/financialTransactions`)](https://docs.asaas.com/reference/financial-transaction): mostra o que
  passa pelo saldo (inclusive o pagamento da fatura do cartão), mas não há endpoint de fatura nem das compras do
  Cartão Asaas.
- Parcelamento do Simples — regra da parcela (Selic acumulada + 1% no mês do pagamento; último dia útil):
  [Contábeis](https://www.contabeis.com.br/forum/tributos-federais/343747/juros-correcoes-mensais-parcelamento-simples-nacional/),
  [Sebrae](https://sebrae.com.br/Sebrae/Portal%20Sebrae/UFs/RJ/Sebrae%20de%20A%20a%20Z/Parcelamento.pdf)
