# Colocando na VPS

Configuração testada para a VPS do piloto (2 vCPU, 4 GB RAM, 60 GB SSD). Tudo roda em Docker; o app só escuta em
`127.0.0.1` e o acesso de fora é pelo **Cloudflare Tunnel** (sem abrir portas no firewall) protegido pelo
**Cloudflare Access** (só o seu e-mail entra).

## 1. Preparar a VPS

```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # saia e entre de novo na sessão SSH
git clone https://github.com/objetivatech/app-financeiro.git
cd app-financeiro
cp .env.example .env
nano .env    # preencha conforme a tabela abaixo
```

### De onde vem cada valor do `.env`

Nenhum desses dados existe pronto em algum lugar: você cria cada um. O arquivo `.env` fica **só na VPS**
(nunca vai para o GitHub).

| Variável | O que é | Como obter |
|---|---|---|
| `APP_DOMINIO` | Endereço público do app, sem `https://` (ex.: `financas.seudominio.com.br`). | O mesmo *Public hostname* do passo 3. Sem ele, atrás da Cloudflare os botões de salvar podem ser recusados. Depois de mudar, rode o `docker compose ... up -d --build` (o valor entra no build). |
| `POSTGRES_PASSWORD` | Senha do banco de dados. Só o app usa; você não vai digitá-la no dia a dia. | Invente, ou gere na VPS com `openssl rand -base64 24` e cole o resultado. |
| `ANTHROPIC_API_KEY` | Chave para o app usar a IA (Claude). | Crie uma conta em [console.anthropic.com](https://console.anthropic.com), adicione créditos em *Billing* e gere a chave em *Settings → API Keys* (começa com `sk-ant-`). É uma cobrança separada da assinatura do Claude.ai. Defina um limite mensal de gasto em *Limits*. |
| `APP_USUARIO` / `APP_SENHA` | Login e senha que o navegador vai pedir ao abrir o app. | Você escolhe. Use uma senha forte e diferente das outras. |
| `ASAAS_API_KEY` | Chave da API do Asaas (leitura de cobranças, notas e extrato). | No Asaas: *Minha conta → Integrações → Chave de API*. Coloque entre aspas simples: `ASAAS_API_KEY='$aact_...'` (a chave começa com `$`). Opcional; sem ela a integração fica desligada. |
| `MERCADOPAGO_ACCESS_TOKEN` | Access Token da API do Mercado Pago (leitura de pagamentos recebidos e do extrato). | Em mercadopago.com.br/developers → *Suas integrações* → criar aplicação → *Credenciais de produção* (começa com `APP_USR-`). Opcional. |
| `CONSULTA_CNPJ` | Opcional. `0` desliga a consulta pública do CNPJ de quem recebeu um pagamento (BrasilAPI), usada para classificar gastos. | Deixe sem definir para manter ligada. Só CNPJ é consultado; CPF nunca. |
| `MODELO_CONSULTOR` / `CARTA_SEMANAL` | Opcionais. Modelo do chat do consultor (padrão Sonnet 5.5) e `CARTA_SEMANAL=0` para desligar a carta da semana. | Deixe sem definir para usar o padrão. |
| `CLOUDFLARE_TUNNEL_TOKEN` | Liga a VPS à Cloudflare sem abrir portas. | Gerado no passo 3, ao criar o túnel. Pode deixar vazio por enquanto. |

Sem a `ANTHROPIC_API_KEY` o app funciona com OFX e CSV, mas não lê PDF/fotos nem gera dicas.

## 2. Subir o app

```bash
docker compose up -d --build
docker compose logs -f app       # Ctrl+C para sair
curl -I http://127.0.0.1:3000    # deve responder 401 (pede login) ou 200
```

O serviço `migrar` roda as migrações e termina; o `app` só sobe depois dele.

## 3. Acesso seguro pela Cloudflare

Pré-requisito: um domínio seu gerenciado pela Cloudflare.

1. No painel **Cloudflare Zero Trust → Networks → Tunnels**, crie um túnel (tipo *cloudflared*). Copie o token para
   `CLOUDFLARE_TUNNEL_TOKEN` no `.env`.
2. No túnel, adicione um *Public hostname*: ex. `financas.seudominio.com.br` → serviço `http://app:3000`.
3. Em **Access → Applications**, crie uma aplicação *Self-hosted* para esse hostname com uma política
   *Allow* só para o seu e-mail.
4. Suba o túnel:

```bash
docker compose --profile tunel up -d
```

Pronto: `https://financas.seudominio.com.br` pede o login da Cloudflare (código por e-mail) e, depois, o
usuário/senha do `.env`.

## 4. Backup

```bash
sudo apt install -y gnupg
openssl rand -base64 32 > ~/.backup-financeiro-senha && chmod 600 ~/.backup-financeiro-senha
./scripts/backup.sh
crontab -e   # adicione: 0 3 * * * /home/SEU_USUARIO/app-financeiro/scripts/backup.sh
```

Guarde a senha do backup fora da VPS (gerenciador de senhas). Copie os backups para fora da VPS de tempos em tempos
(ex.: Cloudflare R2 ou Google Drive com `rclone`).

## Atualizar

```bash
cd ~/app-financeiro
git pull
docker compose up -d --build
```

Se usa o túnel da Cloudflare, rode `docker compose --profile tunel up -d --build` (o perfil mantém o
`cloudflared` junto).

As migrações do banco rodam sozinhas (serviço `migrar`) antes de o app subir. Veja o que mudou em `CHANGELOG.md`
ou em **Ajuda → Novidades** no app.

### A atualização não apareceu?

O número da versão fica no canto direito do menu do app (ex.: `v0.4.0`). Se ele não mudou:

```bash
cd ~/app-financeiro
git branch --show-current      # em qual branch a VPS está
git log --oneline -1           # último commit baixado
git status --short             # arquivos alterados localmente impedem o pull
docker compose ps              # o app foi recriado agora há pouco?
docker compose logs --tail 30 migrar app
```

- Se o `git log` não mostra o commit mais recente do GitHub, o `git pull` não trouxe nada: confira se a VPS está
  no branch padrão do repositório (o mesmo do GitHub).
- Se o commit está certo mas a versão não mudou, a imagem não foi refeita: rode de novo com `--build`.
- No navegador, recarregue com Ctrl+Shift+R para não usar a página guardada em cache.

### Um botão de salvar mostra erro?

Todo botão de salvar mostra "Salvando…" e depois "✓ Salvo" ou o motivo do erro.

- **"O app foi atualizado depois que esta página abriu"**: recarregue a página (F5). Acontece com abas abertas
  antes de uma atualização.
- **"O servidor não conseguiu concluir"**: rode `docker compose logs --tail 50 app`. Se aparecer
  `Invalid Server Actions request` ou `x-forwarded-host ... does not match origin`, falta o `APP_DOMINIO` no `.env`
  (o mesmo endereço do túnel). Preencha e rode `docker compose --profile tunel up -d --build`.
