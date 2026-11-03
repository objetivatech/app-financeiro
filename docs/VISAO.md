# Visão do produto

## O problema

Donos de pequenas empresas — especialmente no Simples Nacional — costumam ter muitas contas e cartões, pessoais e da
empresa, e usam umas para pagar as coisas das outras. Os apps de finanças pessoais ignoram a empresa; os sistemas de
gestão empresarial ignoram o sócio. Ninguém responde as perguntas que importam:

- Quanto a empresa realmente sobrou este mês?
- Quanto eu tirei dela (somando Pix, pró-labore, lucros e as contas pessoais que ela pagou)?
- Estou retirando mais do que a empresa gera?
- Qual é o meu custo de vida de verdade?
- Onde estou misturando as coisas — e quanto isso custa?

## A proposta

Um único lugar que junta **todas** as contas, entende a **relação entre a pessoa e a empresa** e usa IA para
organizar e aconselhar.

### Piloto (agora)

- Uso pessoal, rodando numa VPS própria, sem publicação.
- Entrada de dados por arquivos (OFX, CSV, PDF, foto): funciona com qualquer banco, sem custo de Open Finance.
- Classificação PF/PJ, detecção de mistura, transferências entre contas próprias, regras aprendidas.
- Painel mensal e diagnóstico com dicas da IA.

### Depois do piloto

- Conexão automática via agregador de Open Finance (Pluggy, Belvo…), alimentando o mesmo modelo de dados.
- Conversa com a IA sobre os próprios números ("posso retirar R$ 5 mil este mês?").
- Contas a pagar/receber, metas, alertas semanais.
- Exportação organizada para o contador.
- Se fizer sentido, multiusuário e oferta comercial (exige LGPD, segurança e infraestrutura reforçadas).

## Princípios

1. **Os números vêm do banco de dados, não da IA.** A IA lê documentos, sugere classificações e escreve dicas sobre
   totais calculados pelo sistema — ela não inventa saldo.
2. **Correção do usuário é lei.** Nada automático sobrescreve o que você definiu à mão.
3. **Mínimo de dados sensíveis para fora.** CPF/CNPJ não vão para a IA na classificação nem nas dicas.
4. **Tributário é hipótese, não conselho.** Pontos de pró-labore, lucros e Fator R viram perguntas para o contador.
