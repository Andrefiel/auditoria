#!/usr/bin/env bash
# ==============================================================================
# Script de Backup Automático Criptografado - Auditoria Argos
# ==============================================================================
# Execução recomendada via crontab (diariamente às 23:00):
# 0 23 * * * /opt/Auditoria/scripts/backup-db.sh >> /var/log/auditoria-backup.log 2>&1
# ==============================================================================

set -e

BACKUP_DIR="/opt/Auditoria/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
RETENTION_DAYS=30

mkdir -p "$BACKUP_DIR"
cd /opt/Auditoria

echo "=== [$(date)] Iniciando rotina de backup do banco de dados ==="

# 1. Carregar variáveis do .env se existir
if [ -f .env ]; then
  # shellcheck disable=SC2046
  export $(grep -v '^#' .env | xargs)
fi

DB_USER="${POSTGRES_USER:-auditoria_app}"
DB_NAME="${POSTGRES_DB:-auditoria}"
ENCRYPT_PASS="${JWT_SECRET:-auditoria_argos_backup_key_2026}"

DUMP_FILE="${BACKUP_DIR}/auditoria_${TIMESTAMP}.sql.gz"
ENC_FILE="${DUMP_FILE}.enc"

# 2. Executa o dump comprimido via container Docker
echo "[1/3] Gerando dump do banco de dados..."
docker compose exec -T postgres pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$DUMP_FILE"

# 3. Criptografa o dump com OpenSSL AES-256-CBC
echo "[2/3] Criptografando backup com AES-256..."
openssl enc -aes-256-cbc -salt -pbkdf2 -in "$DUMP_FILE" -out "$ENC_FILE" -pass "pass:$ENCRYPT_PASS"
rm -f "$DUMP_FILE" # Remove a versão não criptografada

echo "✓ Backup salvo e criptografado: $ENC_FILE ($(du -h "$ENC_FILE" | cut -f1))"

# 4. Rotação de backups antigos (> 30 dias)
echo "[3/3] Limpando backups com mais de ${RETENTION_DAYS} dias..."
find "$BACKUP_DIR" -name "auditoria_*.sql.gz.enc" -type f -mtime +${RETENTION_DAYS} -delete

echo "=== [$(date)] Backup concluído com sucesso! ==="
