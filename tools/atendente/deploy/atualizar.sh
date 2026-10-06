#!/usr/bin/env bash
# Atualiza o atendente para a versão mais nova do código. Pode rodar quantas vezes quiser.
# Uso (como root):  bash /opt/atendente-src/tools/atendente/deploy/atualizar.sh
set -u
SRC="/opt/atendente-src"
COMPOSE="$SRC/tools/atendente/docker-compose.yml"

parar() { echo; echo "PAROU: $*"; echo "O atendente que já estava ligado não foi desligado por este script."; exit 1; }

[ "$(id -u)" -eq 0 ] || parar "rode como administrador (root)."
command -v docker >/dev/null 2>&1 || parar "o Docker não está instalado."
[ -d "$SRC/.git" ] || parar "não achei o código em $SRC. Rode antes o instalar-atendente.sh."
[ -f /opt/atendente/.env ] || parar "não achei /opt/atendente/.env. Rode antes o instalar-atendente.sh."

echo "==> Baixando a versão mais nova"
git -C "$SRC" pull --ff-only || parar "não consegui atualizar o código (há alteração local em $SRC?)."

echo "==> Reconstruindo e religando o atendente"
docker compose -f "$COMPOSE" up -d --build || parar "o Docker não conseguiu religar. Veja: docker compose -f $COMPOSE logs --tail 50"

echo "==> Esperando responder"
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8088/saude >/dev/null 2>&1; then
    echo "PRONTO: atendente atualizado e respondendo."
    exit 0
  fi
  sleep 2
done
parar "o atendente não respondeu em 1 minuto. Veja: docker compose -f $COMPOSE logs --tail 50"
