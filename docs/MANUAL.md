# Manual de uso

Este manual explica cada tela do app e como os números são calculados. Ele é o mesmo texto que aparece em
**Ajuda** dentro do app (o ícone **?** ao lado do título de cada tela leva direto para a seção certa).

**Sumário:** [Conceitos](#conceitos) · [Menu](#menu) · Painéis: [Consolidado](#painel), [Pessoal (PF)](#painel-pf),
[Empresa (PJ)](#painel-pj) · [Indicadores](#indicadores) · [Consultor](#consultor) · [Avisos](#avisos) · [Transações](#transacoes) · [Classificação automática](#classificacao) ·
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
| Consultor | **Conversar** (chat), **Avisos** (com o número de avisos ativos) |
| Dia a dia | Transações, A pagar e dívidas, A receber, Cartões, Fluxo de caixa |
| Empresa | Impostos e Fator R |
| Dados | Importar, Contas, Integrações |
| Sistema | Configurações, Ajuda |

No celular, o menu fica recolhido no topo (☰). O botão **Consultor**, no canto de baixo, abre o chat de qualquer tela.

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

> **"Foi para você" zerado?** O app reconhece o dinheiro da empresa para você quando (1) as duas pontas da transferência
> estão importadas (conta da empresa e sua conta pessoal), (2) a descrição cita pró-labore/lucros, ou (3) o Pix cita **o seu
> nome/CPF ou o nome da empresa**, que você informa em [Configurações](#configuracoes). Sem isso, um Pix para você parece
> despesa da empresa. Depois de informar, use **Procurar retiradas nas transações** — o app revê o que já foi importado
> (sem mexer no que você corrigiu à mão).

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

<a id="consultor"></a>

## Consultor

O consultor tem três formas de agir, todas seguindo a mesma **skill de gestão financeira** (o texto completo está na
tela do consultor, em **Como o consultor pensa**):

1. **Avisos automáticos** — a inteligência interna do app olha cada transação e o fluxo do dinheiro e avisa sozinha
   (veja [Avisos](#avisos)). Não usa IA: é grátis e funciona mesmo sem a chave da Anthropic.
2. **Conversa** (`/consultor`) — você pergunta e ele responde com os seus números.
3. **Carta da semana** — uma vez por semana a IA escreve um resumo com as 3 prioridades da semana; ela abre na janela
   de avisos.

### Conversar

- Pergunte do seu jeito: "como está minha situação?", "consigo trocar de carro?", "qual dívida quito primeiro?", "vale a
  pena mudar o pró-labore?". Há sugestões na tela de uma conversa nova.
- O consultor **consulta os dados do app** antes de responder (panorama do mês, gastos por categoria, transações,
  recorrentes, dívidas, cartões, fluxo de caixa, impostos e avisos) e faz **simulações** com conta exata:
  financiamento (Tabela Price, com seguro, IPVA e manutenção), pró-labore × Fator R (DAS e INSS), quitação de dívidas
  (avalanche, com meses a menos e economia) e metas (quanto tempo ou quanto guardar por mês). Embaixo de cada resposta
  aparece o que ele consultou.
- Toda resposta termina com **O que fazer agora**.
- As conversas ficam salvas (lista à esquerda); dá para apagar.
- Nos avisos e nas transações, **perguntar ao consultor** abre o chat com a pergunta pronta.
- **Privacidade:** as ferramentas não entregam CPF, CNPJ nem número de conta (aparecem como [CPF], [CNPJ]).
- **Custo:** usa o Claude Sonnet 5.5 (US$ 2 / US$ 10 por milhão de tokens); cada pergunta faz algumas consultas. O gasto
  aparece em Configurações. Para trocar o modelo: `MODELO_CONSULTOR` no `.env`.

<a id="avisos"></a>

## Avisos

O app acompanha tudo o que entra e avisa o que merece atenção — com o **que fazer**. Os avisos aparecem:

- numa **janela** ao abrir o app, quando há aviso novo urgente ou de atenção (e a carta da semana). **Entendi** fecha e
  não mostra de novo o mesmo aviso;
- no topo de cada painel (**O consultor está de olho**), filtrados para PF ou PJ;
- **junto da transação**, na lista de Transações (ex.: "gasto pessoal pago pela empresa");
- na **Central de avisos** (`/avisos`), com o número no menu.

| Aviso | Quando aparece |
|---|---|
| Dívida em risco (urgente) | Parcela atrasada de dívida com limite de atraso (ex.: acordo judicial) |
| Dívida atrasada / juros altos | Parcela vencida; juros acima de 3% ao mês (quite primeiro — método avalanche) |
| Conta vencida / vence em breve | Contas a pagar vencidas ou que vencem em até 3 dias; lembretes depois de pagar |
| Caixa negativo previsto | O fluxo de caixa projetado fica negativo (urgente se for nas próximas 4 semanas) |
| Gasto pessoal pago pela empresa / gasto da empresa pago por você | Mistura entre PF e PJ |
| Retirada sem definição | Pix da empresa para você ainda não marcado como pró-labore ou lucro |
| Juros, multas e tarifas | Encargos evitáveis numa conta ou cartão no mês |
| Gasto acima do normal | Gasto 3× acima do normal da categoria (mínimo R$ 300) |
| Nova cobrança recorrente / ficou mais cara | Assinatura nova ou reajuste de 10% ou mais |
| Nova compra parcelada | Parcelamento de 3 ou mais vezes que soma R$ 500 ou mais |
| Você tirou mais do que a empresa gerou / prejuízo | No último mês fechado |
| Reserva baixa (empresa ou pessoal) | Abaixo de 1 mês de custo (PJ) ou de 3 meses (PF) |
| Parcelas comprometem a renda | Parcelas acima de 30% da renda (urgente acima de 40%) |
| Gastou mais do que recebeu / custo de vida subiu | No último mês fechado |
| Fator R abaixo de 28% | Com 6+ meses de receita e pró-labore informado |
| Cartão: limite alto / sem configuração | Uso acima de 70% do limite; falta fechamento/vencimento |
| Cobranças vencidas / cliente concentrado | Recebíveis atrasados; um cliente com mais de 50% da receita |
| Importe o extrato | Conta sem lançamentos há mais de 20 dias; muitas transações para revisar |

**O que fazer com um aviso:** **resolver** leva à tela certa; **lembrar em 7 dias** adia; **já resolvi / não mostrar**
dispensa aquela situação de vez. Quando a situação deixa de existir (ex.: você corrigiu a transação ou pagou a conta), o
aviso **se resolve sozinho** e vai para "Resolvidos nos últimos 30 dias". Os avisos são revistos a cada importação,
sincronização, correção e, no máximo, de hora em hora; **Verificar agora** força.

**Carta da semana:** chega sozinha uma vez por semana (de manhã) se a chave da Anthropic estiver configurada; o botão
**Carta da semana agora** pede na hora. Para desligar: `CARTA_SEMANAL=0` no `.env`.

<a id="transacoes"></a>

## Transações

Lista tudo o que entrou e saiu, com filtros por mês, conta, escopo, texto e "só para revisar".

- Linhas destacadas estão **para revisar**: a IA teve pouca confiança, é uma retirada do sócio a definir, ou há
  mistura PF/PJ.
- **está certo** confirma a classificação.
- **corrigir** abre a edição: de quem é (PF/PJ), categoria e natureza. Marque **"Aplicar a todas que contêm…"** para
  criar uma regra: ela vale para as transações parecidas que já existem e para as que vierem.
- **Classificar com IA** aparece quando há transações sem categoria.
- Quando o consultor tem algo a dizer sobre uma transação (mistura, retirada sem definição, gasto fora do padrão,
  assinatura nova…), a mensagem aparece embaixo dela, com o que fazer e o atalho **perguntar**.

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

### Cartões virtuais e adicionais

Compras feitas com um **cartão virtual** (ou um adicional) caem na **mesma fatura** do cartão físico. Em **Cartões →
Cartões virtuais e adicionais**, cadastre o final de cada um (tipo, final e um nome, como "Virtual assinaturas"). Os
finais que aparecem nas faturas entram sozinhos ali. Com isso:

- a fatura vai para o cartão certo mesmo se o app ler o final de um virtual;
- cada compra mostra o final usado ("cartão final 4321") e a lista mostra quanto cada virtual comprou em 90 dias;
- ao cancelar um virtual no app do banco, clique em **marcar como cancelado**: se havia **assinatura** cobrada nele, o
  consultor avisa para você trocar o cartão no serviço antes da próxima cobrança.

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

### Saída do MEI

Se a empresa foi MEI (informe **Foi MEI até** em [Configurações](#configuracoes)):

- A **receita do período MEI entra na RBT12** (é o mesmo CNPJ).
- O **MEI não tem pró-labore**: a folha do Fator R soma o pró-labore só a partir do início como ME (ou do mês informado em
  **Pró-labore desde**). Logo depois da saída do MEI, o Fator R fica mais baixo; a tela mostra quantos meses de folha
  existem, quando completa 12 e qual será o Fator R com o pró-labore atual nos 12 meses.
- Nos meses de MEI o DAS é o valor fixo do MEI, não o percentual do Simples.
- Esta é uma estimativa para planejar: **confirme com a contabilidade** como o PGDAS-D está tratando os meses de MEI.

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

> **Asaas e Mercado Pago:** depois de conectar a integração, **não importe mais extratos deles por arquivo** — o extrato
> chega sozinho. O **Relatório de Liberações** do Mercado Pago (CSV) é reconhecido no Importar, para quem não conectou.

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

### Mercado Pago

Traz automaticamente, só lendo (o app nunca cria cobranças nem move dinheiro):

- **De quem é a conta:** pelo CPF ou CNPJ cadastrado no Mercado Pago, a conta "Mercado Pago" vira PF ou PJ.
- **Pagamentos recebidos** (Pix, boleto, cartão) → [A receber](#receber), com valor líquido e data de liberação.
- **Extrato da conta** → pelo **Relatório de Liberações** do Mercado Pago: recebimentos, tarifas, devoluções, saques para o
  banco. Tarifas e recebimentos já chegam classificados; saques são pareados com a entrada no banco.
- **Empréstimos do Mercado Crédito** não têm API: cadastre em **A pagar → Nova dívida** (as parcelas pagas pelo saldo
  aparecem no extrato e dão baixa sozinhas).

**Como conectar**

1. Entre em **mercadopago.com.br/developers** com a conta que quer acompanhar → **Suas integrações** → **Criar
   aplicação** (qualquer nome). Não existe aplicação "só de consulta": escolha **Checkout Pro** e a API sugerida
   (Orders ou Preferences, tanto faz) — é só um rótulo; o app nunca cria cobranças.
2. Em **Produção → Credenciais de produção**, ative as credenciais (ramo de atividade e site) e copie o **Access Token**
   (começa com `APP_USR-`). As credenciais de **teste** não servem: apontam para uma conta fictícia.
3. Na VPS, no `.env`: `MERCADOPAGO_ACCESS_TOKEN=APP_USR-...`, depois `docker compose up -d` e **Integrações →
   Sincronizar agora**.

**Como funciona**

- A primeira sincronização busca 13 meses; depois, roda **a cada 6 horas** (1 minuto e meio após o servidor subir).
  `MERCADOPAGO_SINCRONIZACAO_AUTOMATICA=0` desliga a automática.
- O extrato vem **até ontem**. O Mercado Pago gera o relatório em segundo plano: se não ficar pronto em cerca de 1 minuto,
  ele entra na **próxima** sincronização (a tela mostra "gerando…").
- Se o extrato pela API falhar, a tela avisa e o resto (pagamentos) continua funcionando. **Alternativa manual:** no
  painel do Mercado Pago, baixe o **Relatório de Liberações** em CSV e envie em [Importar](#importar) — o app reconhece
  o arquivo.
- Nada duplica com extratos do Mercado Pago que você já tenha importado por arquivo.
- **Erro 403 (`PA_UNAUTHORIZED_RESULT_FROM_POLICIES`):** o Mercado Pago recusou o token para aquela consulta. Se só os
  dados da conta forem recusados, o app segue com os pagamentos e o extrato — defina em [Contas](#contas) se a conta
  "Mercado Pago" é PF ou PJ. Se tudo for recusado: confira se é o token de **produção**, se as credenciais de produção
  foram **ativadas** e se a aplicação foi criada **logado na mesma conta** que você quer acompanhar.
- O Access Token dá acesso à conta: guarde-o só no `.env` da VPS. Se vazar, renove nas credenciais da aplicação.

<a id="configuracoes"></a>

## Configurações

- **Dados financeiros e fiscais:** pró-labore mensal (base do Fator R e do INSS), custo fixo mensal da empresa (base
  da reserva de caixa), e-mail para os resumos e se a atividade principal está sujeita ao Fator R.
- **Enquadramento da empresa:** **Foi MEI até** (mês) — o mês seguinte passa a ser o início como ME no Simples — e
  **Pró-labore desde** (mês). Veja [Impostos](#impostos).
- **Como você e a empresa aparecem nos Pix:** seu nome, CPF (opcional; fica só no banco do app, nunca vai para a IA) e os
  nomes da empresa (razão social; nome fantasia). Com eles, o app reconhece **retiradas** (empresa → você), **aportes**
  (você → empresa) e transferências entre contas da empresa mesmo quando só um dos extratos foi importado. Ao salvar,
  as transações já importadas são revistas; o botão **Procurar retiradas nas transações** faz isso na hora.
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
| Consultor (chat) | Claude Sonnet 5.5 | Conversa com várias consultas por pergunta: equilíbrio entre custo e qualidade |
| Carta da semana | Claude Opus 5.5 | Uma chamada por semana |

Referência de preço (por milhão de tokens): Haiku 5.5 US$ 0,10 de entrada e US$ 0,50 de saída; Sonnet 5.5 US$ 2 e US$ 10;
Opus 5.5 US$ 4 e US$ 20. Os avisos automáticos não usam IA.

**Como gastar ainda menos**

- Prefira **OFX ou CSV**: são lidos pelo app, sem IA nenhuma.
- **PDF baixado do banco** (com texto) é lido no servidor e só o texto vai para a IA. **Foto e PDF escaneado** vão
  inteiros e custam mais.
- Integrações (como o **Asaas**) não usam IA para trazer os dados.
- Crie **regras** ao corrigir transações: o que a regra resolve não vai para a IA.

**Trocar o modelo de uma tarefa:** no `.env`, defina `MODELO_EXTRACAO`, `MODELO_CLASSIFICACAO`, `MODELO_ANALISE` (também
usado pela carta da semana) ou `MODELO_CONSULTOR`
(ex.: `MODELO_ANALISE=claude-sonnet-5-5`) e rode `docker compose up -d`.

O quadro em **Configurações → Inteligência artificial** mostra o gasto estimado do mês. O valor oficial fica no
console da Anthropic, onde também dá para definir um **limite mensal de gasto**.

<a id="rotina"></a>

## Rotina sugerida

**Toda semana (10 minutos)**

1. Leia a **carta da semana** e resolva os **avisos** urgentes.
2. Abra **A receber**: cobre quem está vencido.
3. Abra **Transações → só para revisar** e resolva os destaques (principalmente retiradas do sócio e mistura).
4. Importe os extratos das contas sem integração (ou a cada 15 dias) e as **faturas** que fecharam.

**Todo mês**

1. No **Consolidado**, veja o fluxo do dinheiro e a posição líquida.
2. No painel **Empresa (PJ)**, compare o resultado antes de pagar você com o que foi para você (indicador "Foi para
   você") e a reserva da empresa.
3. No painel **Pessoal (PF)**, acompanhe taxa de poupança, reserva de emergência e renda comprometida com parcelas.
4. Em **Impostos**, confira o Fator R e o DAS estimado antes de a contabilidade enviar a guia.
5. Gere o **Diagnóstico e dicas** do mês.
