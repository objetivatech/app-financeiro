# Manual de uso

Este manual explica cada tela do app e como os números são calculados. Ele é o mesmo texto que aparece em
**Ajuda** dentro do app (o ícone **?** ao lado do título de cada tela leva direto para a seção certa).

**Sumário:** [Conceitos](#conceitos) · [Menu](#menu) · Painéis: [Consolidado](#painel), [Pessoal (PF)](#painel-pf),
[Empresa (PJ)](#painel-pj) · [Indicadores](#indicadores) · [Transações](#transacoes) · [Classificação automática](#classificacao) ·
[A receber](#receber) · [A pagar e dívidas](#pagar) · [Cartões](#cartoes) · [Fluxo de caixa](#fluxo) ·
[Impostos e Fator R](#impostos) · [Importar](#importar) · [Contas](#contas) · [Integrações](#integracoes) ·
[Configurações](#configuracoes) · [Custo da IA](#custos-ia) · [Rotina sugerida](#rotina) · [Novidades](#novidades)

<a id="conceitos"></a>

## Conceitos

### PF, PJ e conta mista

Cada transação pertence à vida **pessoal (PF)** ou à **empresa (PJ)**, não importa por qual conta passou. Cada
conta também tem um escopo padrão: PF, PJ ou **mista** (quando você usa a mesma conta para as duas coisas). O
escopo da conta é só o palpite inicial; a classificação pode discordar, e é aí que o app detecta **mistura**.

### Natureza da transação

Além da categoria, toda transação tem uma **natureza**, que diz se é dinheiro de verdade entrando ou saindo
(receita, despesa) ou só mudando de bolso:

| Natureza | Quando |
|---|---|
| Comum | Receita ou despesa normal |
| Entre contas próprias | Transferência entre duas contas suas do mesmo lado (PF→PF, PJ→PJ) |
| Retirada do sócio (definir) | Dinheiro saiu da conta PJ para uma conta PF. Defina se foi pró-labore ou distribuição de lucros |
| Pró-labore / Distribuição de lucros | Retirada já identificada |
| Aporte do sócio | Dinheiro pessoal colocado na empresa |
| Gasto pessoal pago pela empresa | Despesa PF que saiu de conta PJ (mistura) |
| Gasto da empresa pago pela PF | Despesa PJ que saiu de conta PF (mistura) |
| Pagamento de fatura | Pagamento do cartão de crédito (a despesa real são as compras da fatura) |
| Imposto, Estorno, Investimento | Autoexplicativos |

Movimentações entre bolsos (transferências, faturas, investimentos, retiradas e aportes) **não contam** como
receita nem despesa nos totais.

### Ordem de classificação

O app classifica cada transação em camadas. Uma camada nunca desfaz a decisão de outra mais forte:

1. **Você** (correção manual) — nunca é alterada automaticamente.
2. **Regras** criadas a partir das suas correções ("descrição contém X → Y").
3. **Transferências** entre contas suas (mesmo valor, sinais opostos, até 3 dias, com indício de Pix/TED).
4. **Heurísticas e integrações** (DAS do Simples, pagamento de fatura, taxas e recebimentos do Asaas…) e os
   **classificadores complementares**: seu histórico, estabelecimentos conhecidos e a atividade (CNAE) de quem
   recebeu — veja [Classificação automática](#classificacao).
5. **IA**, que decide pela natureza do gasto e informa a confiança.
6. **Escopo da conta**, como palpite.

### Como os números são contados

- **Regime de caixa:** vale o que entrou e saiu das contas no mês. **Exceção:** compras no cartão contam na **data da
  compra**; o pagamento da fatura não é gasto (senão a compra contaria duas vezes).
- **O dinheiro da empresa que vai para você** (pró-labore, lucros, retiradas e gastos pessoais pagos pela empresa) é
  **saída da PJ e renda da PF**. Se as duas contas foram importadas, a transferência não conta em dobro; se só uma
  foi, vale a que existe.
- **Gasto da empresa pago com o seu dinheiro** é despesa da PJ e, para a PF, dinheiro colocado na empresa.
- **Estornos** abatem a despesa (ou a receita, quando é uma venda estornada); não são receita.
- Por isso vale sempre: **ficou na empresa + sobrou para você = resultado consolidado**.
- Lançamentos **sem PF/PJ definido** ficam fora dos totais até você classificar (o painel avisa quantos são).

<a id="menu"></a>

## Menu

| Grupo | Telas |
|---|---|
| Painéis | **Consolidado** (você + empresa), **Pessoal (PF)**, **Empresa (PJ)** |
| Dia a dia | Transações, A pagar e dívidas, A receber, Cartões, Fluxo de caixa |
| Empresa | Impostos e Fator R |
| Dados | Importar, Contas, Integrações |
| Sistema | Configurações, Ajuda |

No celular, o menu fica recolhido no topo (☰).

<a id="painel"></a>

## Painel consolidado (PF + PJ)

A visão integrada: você e a empresa juntos, no mês escolhido (setas no canto). É a tela inicial.

- **Alertas:** dívida atrasada com risco, lembretes depois de pagar, contas dos próximos 7 dias, transações para revisar.
- **Resultado do mês (PF + PJ):** tudo o que entrou de fora (clientes + outras rendas) menos impostos, despesas da
  empresa, custo de vida e parcelas de dívidas. É a soma de **Ficou na empresa** com **Sobrou para você**.
- **Posição líquida hoje:** caixa das contas (PF + PJ) + a receber em 30 dias − todas as parcelas de dívidas que faltam
  − cartões (fatura em aberto + parcelas futuras). Mostra se, acertando tudo hoje, sobraria ou faltaria dinheiro.
- **Para onde foi o dinheiro:** diagrama de fluxo. À esquerda, de onde veio (clientes, aportes, outras rendas); no
  meio, a empresa e você; à direita, o destino (impostos, despesas, dívidas, custo de vida e o que sobrou). A espessura
  de cada faixa é o valor; passe o mouse para ver o número, ou abra **ver em tabela**. Quando saiu mais do que entrou,
  aparece **“Do caixa”**: a diferença veio do saldo ou de crédito.
- **Posição de curto prazo:** a conta da posição líquida, linha a linha.
- **Mistura entre PF e PJ:** gastos pessoais pagos pela empresa, gastos da empresa pagos por você, retiradas ainda sem
  definição (pró-labore ou lucro) e lançamentos em conta mista sem PF/PJ.
- **Últimos meses** e **Diagnóstico e dicas** (a IA analisa as três visões e sugere ações; precisa da chave da
  Anthropic).

<a id="painel-pf"></a>

## Painel pessoal (PF)

Sua vida financeira, incluindo o que vem da empresa.

- **Resumo do mês:** pró-labore, lucros, retiradas, gastos pessoais pagos pela empresa e outras rendas = **renda
  total**; menos custo de vida, parcelas de dívidas e o que você colocou na empresa = **sobrou**.
- **Para onde foi o dinheiro pessoal:** gastos por categoria (com estornos abatidos).
- Indicadores: renda, custo de vida, taxa de poupança, reserva de emergência, renda comprometida com parcelas, quanto
  veio da empresa e quanto foi investido (veja a tabela em [Indicadores](#indicadores)).
- **Dívidas e cartões** do lado pessoal, com atalhos para as telas completas.

<a id="painel-pj"></a>

## Painel da empresa (PJ)

O negócio olhado sozinho.

<a id="dre"></a>

### Resultado do mês (DRE gerencial)

| Linha | O que entra |
|---|---|
| Receita de serviços | Entradas da empresa (recebimentos de clientes), menos vendas estornadas |
| Outras receitas | Entradas classificadas como "Outras receitas da empresa" |
| (−) Impostos | DAS e outros impostos pagos no mês |
| (−) Despesas da operação | Demais gastos da empresa, inclusive os que você pagou com dinheiro pessoal; estornos abatem |
| (−) Parcelas de dívidas | Parcelamentos e empréstimos da empresa |
| **Resultado antes de pagar você** | O que a operação gerou |
| (−) Pró-labore, lucros, retiradas a definir, gastos pessoais pagos pela empresa | O que foi para você |
| (+) Aportes e gastos pagos por você | Dinheiro seu que entrou na empresa |
| **Ficou na empresa** | O que sobrou no caixa da empresa |

É uma visão **gerencial de caixa**, para decidir — não substitui a DRE contábil feita pela contabilidade.

Também mostra despesas por categoria, os últimos 6 meses (receita, resultado e o que foi para você), dívidas e cartões da
empresa.

<a id="indicadores"></a>

## Indicadores

| Indicador | Como é calculado | Referência usada nas cores |
|---|---|---|
| Margem (PJ) | Resultado antes de pagar você ÷ receita | ✓ 20% ou mais · ! de 0 a 20% · ⚠ negativa |
| Reserva da empresa | Caixa PJ ÷ custo mensal (média de 3 meses de impostos + despesas + parcelas + pró-labore) | ✓ 3 meses ou mais · ! 1 a 3 · ⚠ menos de 1 |
| Dias de caixa | Caixa PJ ÷ custo mensal × 30 | ✓ 90+ · ! 30 a 90 · ⚠ menos de 30 |
| Foi para você | O que foi para você ÷ resultado do mês | ✓ até 80% · ! 80 a 100% · ⚠ acima de 100% (tirou mais do que a empresa gerou) |
| Peso dos impostos | Impostos pagos ÷ receita do mês | — |
| Fator R | Ver [Impostos](#impostos) | ✓ 28% ou mais |
| Taxa de poupança (PF) | Sobra ÷ renda total | ✓ 20% ou mais · ! 0 a 20% · ⚠ negativa |
| Reserva de emergência (PF) | Caixa PF ÷ média de 3 meses do custo de vida + parcelas | ✓ 6 meses ou mais · ! 3 a 6 · ⚠ menos de 3 |
| Renda comprometida com parcelas | (Próxima parcela de cada dívida + parcelas de cartão do próximo mês) ÷ renda média de 3 meses | ✓ até 30% · ! 30 a 40% · ⚠ acima de 40% |
| Posição líquida (consolidado) | Caixa + a receber 30 dias − dívidas − cartões | ✓ positiva |

As referências são regras práticas de educação financeira, não metas obrigatórias. O símbolo (✓, !, ⚠) acompanha a cor,
para não depender só dela.

<a id="transacoes"></a>

## Transações

Lista tudo o que entrou e saiu, com filtros por mês, conta, escopo, texto e "só para revisar".

- Linhas destacadas estão **para revisar**: a IA teve pouca confiança, é uma retirada do sócio a definir, ou há
  mistura PF/PJ.
- **está certo** confirma a classificação.
- **corrigir** abre a edição: de quem é (PF/PJ), categoria e natureza. Marque **"Aplicar a todas que contêm…"** para
  criar uma regra: ela vale para as transações parecidas que já existem e para as que vierem.
- **Classificar com IA** aparece quando há transações sem categoria.

<a id="classificacao"></a>

## Classificação automática

Antes de chamar a IA (que custa), o app tenta três classificadores gratuitos, nesta ordem:

1. **Seu histórico:** se você já corrigiu à mão lançamentos do mesmo estabelecimento (o app compara o nome sem "Pix
   enviado", datas e códigos), repete a sua decisão — desde que você tenha decidido igual em pelo menos 80% das vezes.
2. **Estabelecimentos conhecidos:** uma lista de lojas e serviços brasileiros (iFood, Uber, 99, postos, supermercados,
   farmácias, energia, água, telefonia, streaming, Hostinger, Registro.br, Google Ads, ferramentas de SEO…). Ferramentas
   de trabalho (anúncios, hospedagem, domínio, SEO, contabilidade) vão para a **empresa** mesmo pagas na conta pessoal —
   e aí o app aponta a mistura. Gastos de consumo (mercado, restaurante) numa conta da empresa ficam para a IA, porque
   costumam ser gasto pessoal.
3. **Atividade de quem recebeu (CNAE):** quando o extrato traz o **CNPJ** do recebedor (comum em Pix), o app consulta o
   cadastro público da Receita pela BrasilAPI (gratuita) e usa a atividade da empresa (restaurante, farmácia,
   contabilidade…). A consulta fica guardada; cada CNPJ é consultado uma vez. **Só CNPJ** é consultado — CPF nunca — e
   nada disso vai para a IA. Para desligar, use `CONSULTA_CNPJ=0` no `.env`.

Entradas vindas de um **cliente cadastrado** (pelo CPF/CNPJ das cobranças do Asaas) viram receita da empresa.

O que nenhum deles resolve vai para a IA. Quanto mais você corrige, mais o histórico acerta sozinho.

<a id="receber"></a>

## A receber

Contas a receber da empresa, vindas das cobranças do **Asaas** (veja [Integrações](#integracoes)).

| Indicador | Como é calculado |
|---|---|
| A receber em 30 dias | Cobranças em aberto com vencimento nos próximos 30 dias |
| Vencido | Cobranças vencidas e não pagas |
| Inadimplência | Vencido ÷ (vencido + recebido nos últimos 90 dias) |
| Recebido este mês | Cobranças pagas no mês corrente (pela data em que o cliente pagou) |
| Atraso médio | Média de dias entre vencimento e pagamento, nos últimos 90 dias |
| Dependência do maior cliente | Participação do maior cliente na receita dos últimos 12 meses. Acima de 30% fica em destaque: perder esse cliente afetaria muito o caixa |

Quando o recebimento aparece no extrato do Asaas, o app **concilia** automaticamente: liga a cobrança à entrada
no extrato.

<a id="pagar"></a>

## A pagar e dívidas

Reúne tudo o que vai sair: **parcelas de dívidas**, **contas fixas** (todo mês) e **contas avulsas** (uma vez).

- **Alertas no topo:** dívida com regra de atraso (ex.: acordo judicial que é cancelado depois de 30 dias) aparece em
  vermelho assim que uma parcela atrasa, com quantos dias faltam para o limite. Lembretes depois de pagar (ex.:
  "enviar comprovante ao escritório") ficam em amarelo até você clicar em **feito**.
- **Próximos 30 dias:** o que vence (e o que já venceu). **pago** dá baixa manual com a data escolhida; as pagas nos
  últimos 15 dias podem ser **desfeitas**.
- **Baixa automática (conciliação):** quando aparece no extrato uma saída do **mesmo valor** até **7 dias** do
  vencimento (na conta escolhida, se você informou uma), o app marca como paga e classifica a transação com a
  categoria da conta. Para contas fixas de valor variável (luz, água), informe o **texto no extrato**: com ele, o app
  aceita até 5% de diferença.

### Cadastrar uma dívida

Em **Cadastrar → Nova dívida**:

- **Parcelas iguais:** valor, quantidade e 1º vencimento (as datas seguem no mesmo dia dos meses seguintes; em meses
  curtos, o último dia). **Já pagas** marca as primeiras como quitadas.
- **Valores diferentes** (ex.: SParcelado da Shopee): uma linha por parcela com data e valor, como
  `20/11/2026 639,88`.
- **Parcelamento da Receita (Selic):** para parcelamentos de DAS do Simples/MEI. Informe a **parcela básica**, o número
  de parcelas, o vencimento da 1ª e quantas já pagou. As seguintes vencem no **último dia útil** de cada mês e o valor
  estimado é a parcela básica + a Selic acumulada + 1% no mês do pagamento (a Selic ao mês é uma estimativa: confira no
  DAS). Na baixa automática, o app aceita até 5% de diferença quando a saída no extrato é de guia de imposto (DAS, DARF,
  Receita) e passa a usar o valor efetivamente pago.
- Nas parcelas iguais, marque **"vence no último dia útil"** quando for o caso.
- **Valor que você recebeu:** com ele o app calcula os **juros ao mês e ao ano** e a ordem de quitação.
- **Atraso máximo tolerado** e **o que acontece se passar:** ativam o alerta vermelho.
- **Lembrete depois de pagar:** aparece a cada parcela paga, até você marcar como feito.
- Uma dívida com dois recebedores (ex.: parcelas ao credor e honorários aos advogados) pode ser cadastrada como **duas
  dívidas**, cada uma com seu valor e prazo.

<a id="dividas"></a>

### Cartões de dívida e ordem de quitação

Cada dívida mostra o que falta pagar, parcelas pagas, a próxima parcela, quando termina e os juros. Embaixo, a **ordem
de quitação**: primeiro as dívidas que **não podem atrasar** (pagar em dia), depois as de **maior juro** — se sobrar
dinheiro, antecipe essas primeiro (método "avalanche": é o que mais economiza).

### Contas fixas

Pró-labore, DAS, INSS do pró-labore, contabilidade, aluguel, escola… Cadastre uma vez com valor aproximado e dia do mês;
o app cria a previsão deste mês e dos próximos três. Pode ser **a pagar** ou **a receber**. O **pró-labore** (categoria
"Movimentação sócio ↔ empresa" ou descrição com "pró-labore") cadastrado como a pagar da PJ **já entra no fluxo como
receita da PF**: não cadastre de novo do lado pessoal. **Encerrar** remove os meses futuros e mantém o histórico.
Na baixa automática, o valor real do extrato substitui o estimado.

> **Compra parcelada em cartão** (ex.: DAS parcelado no cartão): se você **envia as faturas** desse cartão, as parcelas
> já aparecem em [Cartões](#cartoes) — não cadastre como dívida. Se não envia, cadastre como dívida com a **conta = o
> cartão**: quando uma fatura daquele mês for lançada, o fluxo conta só a fatura.

<a id="cartoes"></a>

## Cartões

Cadastre cada cartão e envie as faturas; o app calcula o resto.

**Cadastrar:** nome, emissor, de quem é (PF, PJ ou misto), final, **dia do fechamento**, **dia do vencimento**,
**limite** e a **conta que paga a fatura**. Cartões que já vieram de importações aparecem aqui: complete os dados em
**Editar cartão**.

**Enviar fatura:** o botão em cada cartão abre o Importar já com o cartão escolhido. Do PDF, o app lê as compras, as
parcelas ("3/10"), o **vencimento**, o **total** e o **mínimo**, e lança a fatura em [A pagar](#pagar). Quando o
pagamento aparece no extrato da conta que paga o cartão, a fatura é baixada e a saída vira "pagamento de fatura" (não é
gasto: as compras já foram contadas). Sem o PDF, use **Lançar fatura à mão** (vencimento e total).

**O que a tela mostra**

- **Fatura em aberto**, **parcelado a vencer** (parcelas que ainda vão cair, compra por compra) e **limite usado**
  (fatura em aberto + parcelas futuras ÷ limite; o ideal é ficar em até 30%).
- **Próximas faturas:** a fatura conhecida ou, nos meses seguintes, só as parcelas já contratadas. As compras novas vêm
  por cima — a **média de compras à vista** dá a ideia de quanto.
- **Juros e encargos** dos últimos 3 meses (juros, IOF, multa, anuidade, rotativo): qualquer valor aqui é dinheiro
  jogado fora.
- As parcelas futuras entram no [Fluxo de caixa](#fluxo) no dia de vencimento do cartão.

> **Cartão Asaas:** a API do Asaas não informa a fatura nem as compras do cartão — só o pagamento da fatura sai no
> extrato da conta. Para ter as parcelas, envie a fatura (ou cadastre a compra parcelada como dívida, como explicado
> acima).

<a id="fluxo"></a>

## Fluxo de caixa

Projeção das próximas **13 semanas**, separada em PJ e PF:

- **Saldo inicial:** o último saldo conhecido de cada conta (fim do último extrato importado que informa saldo, ou o
  saldo do Asaas pela integração). Contas mistas contam como PF. Contas sem saldo conhecido ficam de fora e são
  avisadas.
- **Entra:** cobranças em aberto (Asaas), contas a receber e, na PF, o pró-labore previsto que sai da PJ. **Sai:**
  parcelas, contas fixas e avulsas a pagar, faturas de cartão conhecidas e, nos meses seguintes, as parcelas de cartão
  já contratadas. Atrasados entram na primeira semana.
- O quadro mostra o **menor saldo previsto** e em que semana ele acontece; saldo negativo fica em vermelho.

Gastos do dia a dia que não estão cadastrados (mercado, compras novas no cartão) não entram: use o saldo projetado como
teto, não como garantia.

<a id="impostos"></a>

## Impostos e Fator R

Estimativa do Simples Nacional para empresas de serviços. **O valor oficial é o do PGDAS-D**, calculado pela
contabilidade; esta tela serve para planejar.

### Como é calculado

- **Receita bruta mensal:** soma das notas fiscais **autorizadas** do Asaas. Nos meses sem nota, usa as cobranças
  recebidas.
- **RBT12:** receita dos 12 meses **anteriores** ao mês atual (regra do Simples).
- **Folha (12 meses):** pró-labore cadastrado em [Configurações](#configuracoes) × 12.
- **Fator R** = folha ÷ RBT12. Com **28% ou mais**, atividades como marketing/publicidade e desenvolvimento de
  software são tributadas pelo **Anexo III** (a partir de 6%). Abaixo disso, pelo **Anexo V** (a partir de 15,5%).
- **Alíquota efetiva** = (RBT12 × alíquota nominal − parcela a deduzir) ÷ RBT12, pelas tabelas da LC 123/2006.
- **DAS estimado do mês** = receita do mês até agora × alíquota efetiva.

### Os três quadros

- **Fator R:** o percentual atual e se está acima ou abaixo de 28%.
- **DAS estimado:** quanto deve vir de DAS sobre o que já foi faturado no mês, o INSS do pró-labore (11%) e quanto
  seria no outro anexo — a diferença é o que o Fator R está economizando.
- **Margem para crescer:** até quanto a receita **média** mensal pode subir mantendo o Fator R com o pró-labore
  atual, e qual o pró-labore mínimo para a receita de hoje. Se a média passar do limite, aumente o pró-labore
  (converse com a contabilidade antes).

> Enquanto o histórico não tiver 12 meses de receita registrada, a RBT12 e o Fator R ficam distorcidos. A primeira
> sincronização do Asaas já traz 13 meses de notas.

<a id="importar"></a>

## Importar

Para contas que não têm integração: arraste extratos e faturas (OFX, CSV, PDF, PNG ou JPG, até 25 MB cada).

- **OFX e CSV** são lidos pelo próprio app, sem custo. **PDF e fotos** são lidos pela IA e podem levar alguns minutos.
- O app identifica o banco, a conta e as transações; cria a conta na primeira vez.
- Os arquivos vão para uma **fila no servidor**: pode fechar a página que a importação continua. **Cancelar fila**
  interrompe o arquivo em leitura e descarta os que esperavam (o que já entrou, continua).
- **Nada duplica:** o mesmo arquivo é recusado, e o mesmo período em outro formato (OFX e depois PDF) não repete
  transações.
- Use **Forçar conta** quando o app não reconhecer o banco ou cair na conta errada. O botão **Enviar fatura** de
  [Cartões](#cartoes) já abre com o cartão escolhido.
- **Faturas de cartão:** além das compras, o app lê vencimento, total e mínimo e lança a fatura em A pagar. Parcelas
  ("3/10") de faturas de meses diferentes não são confundidas com duplicatas, mesmo repetindo a data da compra.

> **Asaas:** depois de conectar a integração, **não importe mais extratos do Asaas por arquivo** — o extrato chega
> sozinho.

<a id="contas"></a>

## Contas

Cada conta ou cartão que apareceu nos extratos. Em **editar**:

- **De quem é:** PF, PJ ou mista. Mudar o escopo refaz a classificação automática da conta (as correções manuais
  ficam).
- **Tipo:** conta corrente, de pagamento, poupança, cartão ou investimentos.
- **Quero encerrar:** marcação para organizar a limpeza das contas.
- Cartões de crédito: fechamento, vencimento, limite e conta que paga ficam em [Cartões](#cartoes).
- **Excluir:** apaga a conta e todas as transações dela (dá para reimportar depois).

O quadro **Descobrir todas as contas no seu nome** explica como usar o Registrato (Banco Central) para achar contas
esquecidas no CPF e no CNPJ.

<a id="integracoes"></a>

## Integrações

### Asaas

Traz automaticamente, só lendo (o app nunca cria cobranças nem movimenta dinheiro):

- **Cobranças** → [A receber](#receber).
- **Notas fiscais** → receita bruta para [Impostos e Fator R](#impostos).
- **Extrato da conta** → transações da conta "Asaas · PJ", com recebimentos e taxas já classificados.
- **Saldo** atual.

**Como conectar**

1. No Asaas: **Minha conta → Integrações → Chave de API** → gerar chave de **produção**.
2. Na VPS, no arquivo `.env` do app, adicione a linha abaixo (com aspas simples, porque a chave começa com `$`):

   ```
   ASAAS_API_KEY='$aact_...sua_chave...'
   ```

3. Rode `docker compose up -d` e abra **Integrações → Sincronizar agora**.

**Como funciona a sincronização**

- A **primeira** traz 13 meses de cobranças e notas e o extrato desde o fim do que você já tinha importado por
  arquivo (para não duplicar). Pode levar alguns minutos; a tela mostra o andamento.
- Depois, roda **sozinha a cada 6 horas** (e 1 minuto após o servidor subir). O botão força na hora.
- O extrato vem **até ontem** (dias completos). Lançamentos de hoje aparecem na próxima sincronização do dia seguinte;
  as cobranças, por outro lado, são atualizadas na hora.
- A chave do Asaas dá acesso amplo à conta: guarde-a só no `.env` da VPS. Se vazar, revogue no Asaas e gere outra.

<a id="configuracoes"></a>

## Configurações

- **Dados financeiros e fiscais:** pró-labore mensal (base do Fator R e do INSS), custo fixo mensal da empresa (base
  da reserva de caixa), e-mail para os resumos e se a atividade principal está sujeita ao Fator R.
- **Sobre você e sua empresa:** texto livre usado pela IA para classificar e aconselhar melhor.
- **Inteligência artificial:** modelos usados, gasto estimado no mês e o que é enviado (CPF/CNPJ nunca vão na
  classificação nem nas dicas). Veja [Custo da IA](#custos-ia).
- **Regras aprendidas:** as regras criadas a partir das correções; dá para excluir.

<a id="custos-ia"></a>

## Custo da IA

A IA é cobrada pela Anthropic por **tokens** (pedaços de texto) enviados e recebidos. Para gastar pouco:

| Tarefa | Modelo padrão | Por quê |
|---|---|---|
| Ler PDFs e fotos de extrato | Claude Haiku 5.5 | Muito volume e tarefa simples (transcrever) |
| Classificar transações | Claude Haiku 5.5 | Muito volume, decisões curtas |
| Diagnóstico mensal | Claude Opus 5.5 | Uma chamada por mês, precisa de raciocínio melhor |

Referência de preço (por milhão de tokens): Haiku 5.5 US$ 0,10 de entrada e US$ 0,50 de saída; Opus 5.5 US$ 4 e
US$ 20.

**Como gastar ainda menos**

- Prefira **OFX ou CSV**: são lidos pelo app, sem IA nenhuma.
- **PDF baixado do banco** (com texto) é lido no servidor e só o texto vai para a IA. **Foto e PDF escaneado** vão
  inteiros e custam mais.
- Integrações (como o **Asaas**) não usam IA para trazer os dados.
- Crie **regras** ao corrigir transações: o que a regra resolve não vai para a IA.

**Trocar o modelo de uma tarefa:** no `.env`, defina `MODELO_EXTRACAO`, `MODELO_CLASSIFICACAO` ou `MODELO_ANALISE`
(ex.: `MODELO_ANALISE=claude-sonnet-5-5`) e rode `docker compose up -d`.

O quadro em **Configurações → Inteligência artificial** mostra o gasto estimado do mês. O valor oficial fica no
console da Anthropic, onde também dá para definir um **limite mensal de gasto**.

<a id="rotina"></a>

## Rotina sugerida

**Toda semana (10 minutos)**

1. Abra **A receber**: cobre quem está vencido.
2. Abra **Transações → só para revisar** e resolva os destaques (principalmente retiradas do sócio e mistura).
3. Importe os extratos das contas sem integração (ou a cada 15 dias) e as **faturas** que fecharam.

**Todo mês**

1. No **Consolidado**, veja o fluxo do dinheiro e a posição líquida.
2. No painel **Empresa (PJ)**, compare o resultado antes de pagar você com o que foi para você (indicador "Foi para
   você") e a reserva da empresa.
3. No painel **Pessoal (PF)**, acompanhe taxa de poupança, reserva de emergência e renda comprometida com parcelas.
4. Em **Impostos**, confira o Fator R e o DAS estimado antes de a contabilidade enviar a guia.
5. Gere o **Diagnóstico e dicas** do mês.
