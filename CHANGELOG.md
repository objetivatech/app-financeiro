# Novidades (changelog)

Todas as mudanças relevantes do app, da mais recente para a mais antiga. O formato segue
[Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e as versões seguem [SemVer](https://semver.org/lang/pt-BR/).

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
