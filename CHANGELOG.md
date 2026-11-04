# Novidades (changelog)

Todas as mudanças relevantes do app, da mais recente para a mais antiga. O formato segue
[Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e as versões seguem [SemVer](https://semver.org/lang/pt-BR/).

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
