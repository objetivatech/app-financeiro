# Novidades (changelog)

Todas as mudanças relevantes do app, da mais recente para a mais antiga. O formato segue
[Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e as versões seguem [SemVer](https://semver.org/lang/pt-BR/).

## [0.13.0] — 2026-11-07

### Adicionado
- **Bot do Telegram** (`TELEGRAM_BOT_TOKEN`; vínculo do seu chat em Configurações → Telegram): /resumo, /saldo,
  /pagar, /impostos e /avisos; envio de extratos e faturas (PDF, OFX, CSV, foto) direto para a fila de importação,
  com aviso do resultado e pedido de senha para PDF protegido; perguntas livres ao consultor; bom dia com o que vence
  hoje e amanhã; avisos críticos na hora. Só responde ao chat vinculado e não precisa expor o app na internet.

## [0.12.1] — 2026-11-06

### Corrigido
- **Fator R logo depois de sair do MEI:** com menos de 12 meses de pró-labore, a folha passa a ser a média dos meses com
  folha × 12 (no primeiro mês, a do próprio mês × 12), como o PGDAS-D apurou o DAS real de set/2026 (Anexo III, 6%,
  R$ 458,32). Antes o app somava só os meses com pró-labore, caía no Anexo V e superestimava o DAS em cerca de 2,5×.

## [0.12.0] — 2026-11-05

### Adicionado
- **Impostos a pagar (dia 20)** em Impostos: o DAS e o INSS de cada competência (mês das notas), com vencimento no
  dia 20 do mês seguinte (antecipado em fim de semana e feriado), o próximo vencimento, o que já acumulou no mês em
  andamento e o cálculo aberto (receita, RBT12, Fator R, anexo, alíquota). Entram sozinhos em A pagar e no fluxo de
  caixa e dão baixa quando a guia aparece no extrato, mostrando a diferença entre o estimado e o pago.
- Notas com **ISS retido** pelo cliente (lido do Asaas) tiram a parte do ISS do DAS.
- **Taxas e tarifas** (`/taxas`, menu Empresa): tudo o que o Asaas e os bancos PJ cobram, por tipo (notificação, Pix,
  boleto, cartão, nota fiscal, transferência…), mês a mês, peso na receita e cada lançamento.

## [0.11.0] — 2026-11-05

### Adicionado
- **PDF com senha:** ao importar uma fatura protegida, o item mostra "precisa de senha" com um campo para digitá-la
  (os outros arquivos seguem). A senha pode ser **guardada cifrada** para abrir os próximos arquivos sozinho; a lista
  se apaga em Configurações → Senhas de PDF. O PDF é aberto no servidor e só o texto vai para a IA (a senha nunca).

## [0.10.0] — 2026-11-05

### Adicionado
- **Pagamento de fatura em várias vezes:** o app soma os pagamentos feitos entre um fechamento e o seguinte (no extrato
  da conta que paga ou como crédito na própria fatura) e mostra, em cada fatura, se está paga, paga em parte (e quanto
  falta) ou a pagar, com os pagamentos encontrados.
- **Marcar fatura como paga** (e desfazer) em Cartões → Faturas registradas, para pagamentos fora dos extratos.

### Corrigido
- Faturas antigas apareciam como vencidas e a "fatura em aberto" era a mais antiga: agora só a mais recente pode estar
  em aberto; a não quitada aparece como "passou para a fatura seguinte" e sai de A pagar.
- Limite usado e "parcelado a vencer" contavam parcelas em dobro (as que já estavam na fatura do mês e a mesma compra
  lida com descrição ou centavos diferentes em faturas diferentes).
- "Pagamento da fatura" no extrato passa a ser reconhecido como pagamento de fatura.

## [0.9.3] — 2026-11-05

### Corrigido
- **Leitura de PDF/foto pela IA** (ex.: faturas do cartão Asaas) falhava com erro 400 ("Schemas contains too many
  parameters with union types"): o formato pedido à IA passou do limite de campos opcionais da API ao ganhar o final do
  cartão por compra. Reduzido, com um teste que impede voltar a passar do limite.

## [0.9.2] — 2026-11-04

### Corrigido
- **Botões de salvar sem resposta** (ex.: editar conta em Contas): todos os formulários do app agora mostram
  "Salvando…" e depois "✓ Salvo" ou o motivo do erro, em vez de não fazer nada. Excluir sem marcar a confirmação avisa
  o que falta.
- Trocar uma conta ou cartão de PF/PJ não espera mais a reclassificação (que, com a IA, podia passar do limite de
  ~100 s da Cloudflare e derrubar o salvamento): ela roda em segundo plano. O mesmo vale para **Classificar com IA**.
- Atrás da Cloudflare, os formulários podiam ser recusados pelo servidor quando o túnel repassa outro endereço: nova
  variável `APP_DOMINIO` no `.env` (ver `docs/DEPLOY-VPS.md`).

## [0.9.1] — 2026-11-04

### Corrigido
- **Mercado Pago:** a sincronização parava com erro 403 (`PA_UNAUTHORIZED_RESULT_FROM_POLICIES`) quando o token não tinha
  acesso aos dados da conta. Agora ela segue com os pagamentos e o extrato (defina PF/PJ da conta em Contas) e, se o
  Mercado Pago recusar tudo, explica o que conferir no token. Manual com o passo a passo da criação da aplicação.

## [0.9.0] — 2026-11-04

### Adicionado
- **Integração com o Mercado Pago** (somente leitura): identifica se a conta é PF ou PJ pelo CPF/CNPJ, traz os
  **pagamentos recebidos** para A receber e o **extrato da conta** pelo Relatório de Liberações (recebimentos, tarifas,
  devoluções e saques, com tarifas e recebimentos já classificados). Sincroniza a cada 6 horas e pelo botão em
  Integrações (`MERCADOPAGO_ACCESS_TOKEN` no `.env`).
- **Importar** reconhece o CSV do Relatório de Liberações baixado do painel do Mercado Pago.

## [0.8.0] — 2026-11-04

### Adicionado
- **Retiradas reconhecidas pelo seu nome/CPF e pelo nome da empresa** (Configurações → "Como você e a empresa aparecem nos
  Pix"): Pix da empresa para você vira retirada (a definir: pró-labore ou lucro), Pix seu para a empresa vira aporte,
  mesmo com só um dos extratos importado. Ao salvar, as transações já importadas são revistas; há também o botão
  **Procurar retiradas nas transações**.
- **Enquadramento da empresa** (Configurações): "Foi MEI até" e "Pró-labore desde". O Fator R passa a usar a folha real
  (o MEI não tem pró-labore), mostra quantos meses de folha existem e qual será o Fator R ao completar 12 meses; nos meses
  de MEI, o DAS é o fixo do MEI. O consultor e os avisos levam isso em conta.
- **Cartões virtuais e adicionais** vinculados ao cartão físico: cadastro, ativo/cancelado, finais lidos da fatura (cada
  compra mostra o final usado), uso em 90 dias por virtual e aviso de **assinatura cobrada num virtual cancelado**.

### Corrigido
- Painel da empresa: "Foi para você" ficava zerado quando o Pix para o sócio só aparecia de um lado (era contado como
  despesa da empresa). O painel agora avisa quando nenhuma retirada foi encontrada e como resolver.

## [0.7.0] — 2026-11-04

### Adicionado
- **Consultor** (`/consultor`): chat que consulta os seus dados (panorama do mês, gastos, transações, recorrentes,
  dívidas, cartões, fluxo, impostos e avisos) e faz **simulações** com conta exata — financiamento do carro (Price,
  seguro, IPVA, manutenção), pró-labore × Fator R, quitação de dívidas (avalanche) e metas. Respostas em tempo real,
  com o que foi consultado e "O que fazer agora". Conversas salvas. Botão **Consultor** em todas as telas.
- **Inteligência interna (avisos)**: cerca de 25 regras gratuitas olham cada transação e o fluxo do dinheiro — mistura
  PF/PJ, retirada sem definição, juros e tarifas evitáveis, gasto fora do padrão, assinatura nova ou mais cara, compra
  parcelada nova, contas e dívidas vencidas, caixa negativo previsto, reservas baixas, parcelas acima de 30% da renda,
  retirada acima do resultado, Fator R, limite do cartão, cobranças vencidas, contas sem extrato.
- Os avisos aparecem numa **janela** ao abrir o app (urgentes e de atenção), **no topo dos painéis**, **junto da
  transação** e na **Central de avisos** (`/avisos`, com contador no menu); cada um traz o que fazer, atalho para
  resolver e para perguntar ao consultor. Dá para adiar 7 dias ou dispensar; quando a situação some, o aviso se resolve
  sozinho.
- **Carta da semana**: toda semana a IA resume a situação e as 3 prioridades (desliga com `CARTA_SEMANAL=0`).
- **Skill de gestão financeira** (PF + PJ no Simples): prioridades, referências e boas práticas usadas pelo consultor,
  pela carta e pelos avisos; visível em "Como o consultor pensa".

### Alterado
- Painel Consolidado: os alertas soltos do topo viraram os avisos do consultor.
- Configurações → IA mostra também os modelos do consultor e da carta.

## [0.6.0] — 2026-11-04

### Adicionado
- **Três painéis, cada um com seu link:** **Consolidado** (você + empresa, tela inicial), **Pessoal (PF)** e
  **Empresa (PJ)**.
- **Para onde foi o dinheiro:** diagrama de fluxo no Consolidado, dos clientes à empresa, de lá para você e até o custo
  de vida, as dívidas e o que sobrou em cada lado.
- **Indicadores:** margem, reserva da empresa em meses, dias de caixa, quanto do resultado foi para você, peso dos
  impostos, taxa de poupança, reserva de emergência, renda comprometida com parcelas e posição líquida (caixa + a
  receber − dívidas − cartões), com a referência de cada um no manual.
- **DRE gerencial** no painel da empresa: resultado antes de pagar você, o que foi para você e o que ficou.
- **Cartões** (`/cartoes`): cadastro com fechamento, vencimento, limite e conta que paga; **envio da fatura** com
  leitura de vencimento, total e mínimo; fatura lançada em A pagar e baixada quando o pagamento aparece no extrato;
  **parcelas a vencer** compra por compra; limite usado; juros e encargos; projeção das próximas faturas.
- Parcelas de cartão e faturas no **fluxo de caixa**; o pró-labore previsto que sai da PJ agora **entra na PF**.
- **Parcelamento da Receita (Selic)** ao cadastrar dívida: parcela básica + Selic + 1%, vencendo no último dia útil.
  Opção de "último dia útil" também para parcelas iguais.
- **Classificadores complementares**, antes da IA e de graça: seu histórico de correções, estabelecimentos brasileiros
  conhecidos e a atividade (CNAE) do CNPJ de quem recebeu, consultada na BrasilAPI (só CNPJ; desliga com
  `CONSULTA_CNPJ=0`). Análise das opções em `docs/CLASSIFICADORES.md`.

### Alterado
- **Menu lateral agrupado** (Painéis, Dia a dia, Empresa, Dados, Sistema); no celular, recolhido no topo.
- **Cálculos revistos:** pró-labore, lucros e retiradas agora contam como **renda da PF**; estornos abatem despesas em
  vez de virar receita; transferências PJ ↔ PF não contam em dobro; gasto da empresa pago por você entra como aporte.
- O **diagnóstico da IA** passa a receber as três visões e as dívidas.
- Na baixa automática, o valor efetivamente pago substitui o estimado.

### Corrigido
- Parcelas de compras parceladas em faturas de meses diferentes eram descartadas como duplicadas (a fatura repete a
  data da compra original).
- "-R$ 0,00" em alguns totais.

## [0.5.0] — 2026-11-03

### Adicionado
- **A pagar e dívidas** (`/pagar`): parcelas de dívidas, contas fixas mensais e contas avulsas, com baixa manual ou
  **automática pelo extrato** (mesmo valor até 7 dias do vencimento).
- **Dívidas:** parcelas iguais ou com valores diferentes, parcelas já pagas, juros ao mês/ano calculados a partir do
  valor recebido, progresso, data de término e **ordem de quitação** (primeiro o que não pode atrasar, depois o maior juro).
- **Alerta de atraso** para dívidas com tolerância (ex.: acordo judicial cancelado após 30 dias) e **lembrete depois
  de pagar** (ex.: enviar comprovante), também no Painel.
- **Contas fixas** (pró-labore, DAS, contabilidade…): previsão automática deste mês e dos três próximos.
- **Fluxo de caixa projetado** (`/fluxo`): 13 semanas, PJ e PF, a partir do último saldo conhecido de cada conta.
- Categorias "Parcelas de dívidas" (PF e PJ).

## [0.4.0] — 2026-11-03

### Alterado
- **IA bem mais barata.** Cada tarefa agora usa o modelo adequado: **Claude Haiku 5.5** para ler PDFs/fotos e
  classificar transações (cerca de 40× mais barato que o Opus) e **Claude Opus 5.5** só para o diagnóstico mensal.
  Os modelos podem ser trocados pelas variáveis `MODELO_EXTRACAO`, `MODELO_CLASSIFICACAO` e `MODELO_ANALISE`.
- **PDFs com texto são lidos no próprio servidor** e só o texto vai para a IA (antes ia o PDF inteiro, com a imagem
  de cada página). PDFs escaneados continuam indo como arquivo.

### Adicionado
- **Custo da IA** em Configurações: modelo de cada tarefa e gasto estimado no mês (chamadas, tokens e US$).
- **Versão instalada** no canto do menu (leva às novidades): para conferir se a atualização chegou à VPS.

## [0.3.0] — 2026-11-03

### Adicionado
- **Integração com o Asaas** (somente leitura): cobranças, clientes, notas fiscais, extrato da conta e saldo.
  Sincronização automática a cada 6 horas e botão "Sincronizar agora" em **Integrações**.
- **Contas a receber** (`/receber`): a receber em 30 dias, vencido, inadimplência, recebido no mês, atraso médio e
  dependência do maior cliente.
- **Conciliação automática:** a cobrança recebida é ligada à entrada correspondente no extrato do Asaas.
- **Impostos e Fator R** (`/impostos`): receita bruta mensal pelas notas fiscais, RBT12, Fator R, anexo (III/V),
  alíquota efetiva, DAS estimado do mês, economia do Fator R, pró-labore mínimo e receita máxima.
- **Dados financeiros e fiscais** em Configurações: pró-labore, custo fixo da empresa, e-mail para resumos.
- **Manual de uso** (`docs/MANUAL.md`), visível em **Ajuda** no app, com atalhos **?** em cada tela.
- Este **changelog**, também visível em Ajuda.

### Alterado
- Extratos vindos de integrações já chegam classificados quando o tipo do lançamento é conhecido (ex.: taxas do
  Asaas → "Taxas de meios de pagamento").
- Menu reorganizado: Painel, Transações, A receber, Impostos, Importar, Contas, Integrações, Configurações, Ajuda.

## [0.2.0] — 2026-11-02

### Adicionado
- **Fila de importação no servidor:** o envio termina na hora e os arquivos são lidos em segundo plano; dá para
  fechar a página. A fila é retomada se o servidor reiniciar.
- Botão **Cancelar fila**: interrompe a leitura em andamento (inclusive pela IA) e descarta o que esperava.

### Alterado
- Leitura de PDF/foto pela IA mais rápida (esforço de raciocínio menor para transcrição).
- A classificação roda uma vez ao fim do lote, e não a cada arquivo.

### Corrigido
- Com vários PDFs, a importação ficava presa em "processando…" e caía atrás da Cloudflare (limite de ~100 s).

## [0.1.0] — 2026-10-17

### Adicionado
- Piloto: importação de OFX, CSV, PDF e imagem; identificação de banco; deduplicação; contas PF/PJ/mista.
- Classificação em camadas (usuário, regras, transferências, heurísticas, IA) e regras aprendidas.
- Transferências entre contas próprias (retirada do sócio, aporte, pagamento de fatura) e detecção de mistura.
- Painel mensal, transações, contas, configurações e diagnóstico por IA.
- Deploy com Docker Compose, Cloudflare Tunnel/Access, login básico e backup criptografado.
