#!/usr/bin/env bash
# Atualiza o atendente para a versão mais nova do código. Pode rodar quantas vezes quiser.
# Uso (como root):  bash /opt/atendente-src/tools/atendente/deploy/atualizar.sh
#
# Ordem segura:
#  1. Baixa o código e guarda a imagem atual com o nome atendente:anterior.
#  2. CONSTRÓI a imagem nova (se falhar, o atendente que está no ar não foi tocado).
#  3. Troca o contêiner e confere /saude por até 30 segundos.
#  4. Se a versão nova não responder, volta sozinho para a anterior.
set -u
SRC="/opt/atendente-src"
COMPOSE="$SRC/tools/atendente/docker-compose.yml"

parar() { echo; echo "PAROU: $*"; exit 1; }
saudavel() { for _ in $(seq 1 15); do curl -fsS http://127.0.0.1:8088/saude >/dev/null 2>&1 && return 0; sleep 2; done; return 1; }

[ "$(id -u)" -eq 0 ] || parar "rode como administrador (root)."
command -v docker >/dev/null 2>&1 || parar "o Docker não está instalado."
[ -d "$SRC/.git" ] || parar "não achei o código em $SRC. Rode antes o instalar-atendente.sh."
[ -f /opt/atendente/.env ] || parar "não achei /opt/atendente/.env. Rode antes o instalar-atendente.sh."

echo "==> Baixando a versão mais nova"
git -C "$SRC" pull --ff-only || parar "não consegui atualizar o código (há alteração local em $SRC?). O atendente que estava ligado não foi tocado."

echo "==> Guardando a versão atual (atendente:anterior)"
# Guarda ANTES de construir, pelo nome da imagem: com o armazenamento de imagens do containerd, marcar pelo id que o
# contêiner informa ({{.Image}}) falha, e a versão anterior não ficava guardada.
TEM_ANTERIOR=nao
if docker inspect atendente >/dev/null 2>&1 && docker image inspect atendente:local >/dev/null 2>&1 \
   && docker tag atendente:local atendente:anterior 2>/dev/null; then
  TEM_ANTERIOR=sim
  echo "    ok: versão atual guardada"
else
  echo "    aviso: não achei um atendente ligado para guardar (se a versão nova falhar, não haverá versão anterior para voltar)."
fi

echo "==> Construindo a versão nova (o atendente atual continua ligado enquanto isso)"
docker compose -f "$COMPOSE" build || parar "a versão nova não foi construída. NADA foi alterado: o atendente que já estava ligado continua como estava. Veja a mensagem acima."

echo "==> Religando o atendente com a versão nova"
docker compose -f "$COMPOSE" up -d --no-build || echo "    aviso: o Docker reclamou ao religar; vou conferir se respondeu."

echo "==> Esperando responder (até 30 segundos)"
if saudavel; then
  echo "PRONTO: atendente atualizado e respondendo."
  exit 0
fi

echo
echo "A versão nova NÃO respondeu em 30 segundos."
if [ "$TEM_ANTERIOR" = "sim" ]; then
  echo "==> Voltando para a versão anterior"
  docker tag atendente:anterior atendente:local || parar "não consegui voltar a imagem anterior. Chame quem cuida do sistema; veja: docker compose -f $COMPOSE logs --tail 50"
  docker compose -f "$COMPOSE" up -d --no-build || parar "não consegui religar a versão anterior. Veja: docker compose -f $COMPOSE logs --tail 50"
  if saudavel; then
    parar "a versão nova falhou e eu VOLTEI para a anterior, que está respondendo. Nada ficou fora do ar. Veja o motivo: docker compose -f $COMPOSE logs --tail 50"
  fi
  parar "a versão nova falhou e a anterior também não respondeu. Veja: docker compose -f $COMPOSE logs --tail 50 e chame quem cuida do sistema."
fi
parar "a versão nova falhou e não havia versão anterior guardada. Veja: docker compose -f $COMPOSE logs --tail 50"
