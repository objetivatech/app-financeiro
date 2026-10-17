#!/bin/sh
# Backup diário do banco, compactado e criptografado com uma senha (gpg simétrico).
# Agende na VPS com:  crontab -e  →  0 3 * * * /caminho/app-financeiro/scripts/backup.sh
# Restaurar:  gpg -d arquivo.sql.gz.gpg | gunzip | docker compose exec -T db psql -U financeiro financeiro
set -eu
cd "$(dirname "$0")/.."
DESTINO="${BACKUP_DIR:-$HOME/backups-financeiro}"
SENHA_ARQUIVO="${BACKUP_SENHA_ARQUIVO:-$HOME/.backup-financeiro-senha}"
mkdir -p "$DESTINO"
ARQUIVO="$DESTINO/financeiro-$(date +%F).sql.gz.gpg"
docker compose exec -T db pg_dump -U financeiro financeiro \
  | gzip \
  | gpg --batch --yes --symmetric --cipher-algo AES256 --passphrase-file "$SENHA_ARQUIVO" -o "$ARQUIVO"
# Mantém os últimos 30 dias.
find "$DESTINO" -name 'financeiro-*.sql.gz.gpg' -mtime +30 -delete
echo "Backup salvo em $ARQUIVO"
