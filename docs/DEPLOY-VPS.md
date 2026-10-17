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
nano .env    # preencha POSTGRES_PASSWORD, ANTHROPIC_API_KEY, APP_USUARIO/APP_SENHA
```

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
git pull
docker compose up -d --build
```
