# Manual de uso

Este manual explica cada tela do app e como os números são calculados. Ele é o mesmo texto que aparece em
**Ajuda** dentro do app (o ícone **?** ao lado do título de cada tela leva direto para a seção certa).

**Sumário:** [Conceitos](#conceitos) · [Painel](#painel) · [Transações](#transacoes) · [A receber](#receber) ·
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
4. **Heurísticas e integrações** (DAS do Simples, pagamento de fatura, taxas e recebimentos do Asaas…).
5. **IA**, que decide pela natureza do gasto e informa a confiança.
6. **Escopo da conta**, como palpite.

<a id="painel"></a>

## Painel

Mostra um mês (use as setas para navegar):

- **Empresa (PJ):** receitas, despesas e o resultado do mês.
- **Pessoal (PF):** custo de vida e quanto dele foi pago pela empresa.
- **Empresa → você:** retiradas (Pix para a PF, pró-labore, lucros) somadas aos gastos pessoais pagos pela PJ.
  O app avisa quando você tirou mais do que a empresa gerou.
- **Últimos meses:** resultado da empresa, custo de vida e retiradas, mês a mês.
- **Para onde foi o dinheiro:** despesas por categoria, PF e PJ.
- **Diagnóstico e dicas:** a IA analisa os totais do mês e sugere ações (precisa da chave da Anthropic).

<a id="transacoes"></a>

## Transações

Lista tudo o que entrou e saiu, com filtros por mês, conta, escopo, texto e "só para revisar".

- Linhas destacadas estão **para revisar**: a IA teve pouca confiança, é uma retirada do sócio a definir, ou há
  mistura PF/PJ.
- **está certo** confirma a classificação.
- **corrigir** abre a edição: de quem é (PF/PJ), categoria e natureza. Marque **"Aplicar a todas que contêm…"** para
  criar uma regra: ela vale para as transações parecidas que já existem e para as que vierem.
- **Classificar com IA** aparece quando há transações sem categoria.

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
- Use **Forçar conta** quando o app não reconhecer o banco ou cair na conta errada.

> **Asaas:** depois de conectar a integração, **não importe mais extratos do Asaas por arquivo** — o extrato chega
> sozinho.

<a id="contas"></a>

## Contas

Cada conta ou cartão que apareceu nos extratos. Em **editar**:

- **De quem é:** PF, PJ ou mista. Mudar o escopo refaz a classificação automática da conta (as correções manuais
  ficam).
- **Tipo:** conta corrente, de pagamento, poupança, cartão ou investimentos.
- **Quero encerrar:** marcação para organizar a limpeza das contas.
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
3. Importe os extratos das contas sem integração (ou a cada 15 dias).

**Todo mês**

1. No **Painel**, compare o resultado da empresa com o que saiu da empresa para você.
2. Em **Impostos**, confira o Fator R e o DAS estimado antes de a contabilidade enviar a guia.
3. Gere o **Diagnóstico e dicas** do mês.
