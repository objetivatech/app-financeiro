@AGENTS.md

# Projeto: Financeiro PF + PJ

App de finanças pessoais + empresa (piloto de uso pessoal). Leia `docs/ARQUITETURA.md` antes de mexer no pipeline.

- Idioma do produto, do código de domínio e dos comentários: português do Brasil.
- Dinheiro sempre em centavos (inteiro, com sinal: + entrada, − saída; em cartão, compra é negativa).
- A natureza da transação (`src/lib/naturezas.ts`) é o centro do domínio PF×PJ; mudanças nela exigem migração.
- Classificação respeita prioridade de origem (`src/lib/classificacao/motor.ts`); correção do usuário nunca é sobrescrita.
- Não enviar CPF/CNPJ à IA fora da leitura de documentos.
- Verificação: `pnpm test`, `pnpm typecheck`, `pnpm lint`. Teste com banco: `TEST_DATABASE_URL=… pnpm test`.
- Migrações: altere `src/lib/db/schema.ts` e rode `pnpm db:gerar`; nunca edite SQL já aplicado.
