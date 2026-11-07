# Roadmap

## Feito (fase 1 — base do piloto)

- [x] Importação OFX, CSV (heurístico + perfis conhecidos), PDF e imagem (IA)
- [x] Identificação de banco/emissor (catálogo com as instituições do piloto)
- [x] Deduplicação por arquivo e por transação, entre formatos
- [x] Contas criadas automaticamente; escopo PF / PJ / misto
- [x] Classificação em camadas + regras aprendidas com correções
- [x] Transferências entre contas próprias (retirada, aporte, pagamento de fatura)
- [x] Detecção de mistura PF×PJ
- [x] Painel mensal, série de 6 meses, despesas por categoria
- [x] Diagnóstico e dicas por IA
- [x] Deploy em Docker Compose para a VPS, com Cloudflare Tunnel/Access e backup

## Feito (fase 2.1 — Asaas e impostos) — v0.3.0

- [x] Integração com o Asaas: cobranças, clientes, notas fiscais, extrato e saldo, com sincronização automática
- [x] Contas a receber com inadimplência, atraso médio e concentração de clientes
- [x] Conciliação cobrança × extrato
- [x] Impostos e Fator R (Anexos III/V, DAS estimado, pró-labore mínimo, margem para crescer)
- [x] Manual em `docs/MANUAL.md` e em /ajuda; changelog

## Próximo (fase 2 — gestão)

- [x] **Dívidas e compromissos a pagar** (v0.5.0): alerta de atraso, lembrete pós-pagamento, juros, ordem de quitação
- [x] **Recorrências** (v0.5.0): previstos do mês, conciliados com o extrato
- [x] **Fluxo de caixa projetado** (v0.5.0): 13 semanas, PF e PJ
- [x] **Cartões de crédito** (v0.6.0): limite, fechamento e vencimento; leitura da fatura; parcelas futuras no fluxo
- [x] **Painéis separados** (v0.6.0): Consolidado (com fluxo do dinheiro), Pessoal (PF) e Empresa (PJ); menu agrupado
- [x] **Classificadores complementares** (v0.6.0): histórico, estabelecimentos conhecidos, CNPJ → CNAE (BrasilAPI)
- [ ] **Lançamento rápido** no navegador
- [x] Integração com o **Mercado Pago** (v0.9.0): pagamentos recebidos e extrato pelo Relatório de Liberações

## Fase 3 — consultora
- [x] Painel de indicadores (v0.6.0): taxa de poupança, reserva em meses, comprometimento de renda, dias de caixa, margem
- [x] "Skill" de gestão financeira + chat com consultas e simulações (carro, pró-labore × Fator R, quitação) (v0.7.0)
- [x] Inteligência interna: avisos proativos (janela, painéis, transações, central) e carta da semana (v0.7.0)
- [ ] Metas: troca de carro, reserva de caixa da PJ, reserva/investimentos PF

## Fase 4 — rotina
- [x] Bot no Telegram: /resumo, /saldo, /pagar, /impostos, /avisos, extratos por arquivo/foto, perguntas ao consultor e avisos diários (v0.13.0)
- [ ] E-mail semanal e mensal

## Ideias anteriores ainda válidas

### Fase 2 — completar a entrada de dados
- [ ] Planilhas Excel (XLSX) — BTG e XP exportam assim
- [ ] Importar o relatório do Registrato (CCS/SCR) para montar o inventário de contas e cartões automaticamente
- [x] Faturas: parcelas futuras projetadas (v0.6.0)
- [ ] Faturas: MCC (código de categoria do estabelecimento) quando o emissor informar
- [ ] Enriquecimento pago (Pluggy/Belvo) se os classificadores gratuitos não bastarem — ver `docs/CLASSIFICADORES.md`
- [ ] Testar e ajustar com extratos reais de cada instituição do piloto (Asaas, Mercado Pago, PagBank, Neon, Caixa,
      BTG, BS2, Nubank, Efí, XP, PayPal, Maree, 99Pay, Wise e cartões); confirmar os códigos COMPE do catálogo
- [ ] Wise/PayPal: transações em moeda estrangeira (conversão para BRL)

### Fase 3 — inteligência
- [x] Chat com os próprios dados ("quanto gastei com delivery este ano?") — ferramentas de consulta (v0.7.0)
- [ ] Pró-labore × distribuição de lucros: acompanhamento anual e simulação do Fator R
- [ ] Alertas semanais (e-mail/Telegram): gastos fora do padrão, mistura, contas a vencer
- [ ] Orçamento e metas por categoria

### Fase 4 — automação
- [ ] Open Finance via agregador (Pluggy/Belvo) alimentando o mesmo pipeline
- [ ] APIs próprias de contas PJ (ex.: BTG, Efí, Asaas têm APIs de extrato para o cliente)
- [ ] Exportação para o contador

### Antes de oferecer ao mercado
- [ ] Multiusuário com autenticação própria e isolamento por usuário (RLS)
- [ ] Criptografia de dados sensíveis em repouso, política de privacidade/LGPD, termos
- [ ] Infraestrutura gerenciada (banco com backup automático, monitoramento)
