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

## Próximos passos sugeridos

### Fase 2 — completar a entrada de dados
- [ ] Planilhas Excel (XLSX) — BTG e XP exportam assim
- [ ] Importar o relatório do Registrato (CCS/SCR) para montar o inventário de contas e cartões automaticamente
- [ ] Faturas: tratar parcelas futuras como compromissos (contas a pagar)
- [ ] Testar e ajustar com extratos reais de cada instituição do piloto (Asaas, Mercado Pago, PagBank, Neon, Caixa,
      BTG, BS2, Nubank, Efí, XP, PayPal, Maree, 99Pay, Wise e cartões); confirmar os códigos COMPE do catálogo
- [ ] Wise/PayPal: transações em moeda estrangeira (conversão para BRL)

### Fase 3 — inteligência
- [ ] Chat com os próprios dados ("quanto gastei com delivery este ano?") — IA com ferramentas de consulta SQL só-leitura
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
