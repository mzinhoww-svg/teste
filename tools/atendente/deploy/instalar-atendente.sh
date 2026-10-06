#!/usr/bin/env bash
# Instala (ou reinstala, sem estragar nada) o atendente do WhatsApp na VPS.
# Pode rodar quantas vezes quiser. Rode como root:  bash instalar-atendente.sh
#
# O que ele faz, em português simples:
#  1. Confere se o Docker e o WA-AKG estão no ar.
#  2. Baixa o código em /opt/atendente-src.
#  3. Pede as senhas e chaves (não aparecem na tela) e guarda em /opt/atendente/.env.
#  4. Liga o atendente (ele sobe em ESPERA: não responde nem envia nada sozinho).
#  5. Acrescenta os endereços no Caddy (com cópia de segurança).
#  6. Avisa o WA-AKG de onde mandar as respostas (webhook).
#  7. Importa os leads, se você tiver o arquivo.
set -u

REPO_URL="${REPO_URL:-https://github.com/mzinhoww-svg/teste.git}"
SRC="/opt/atendente-src"
PASTA_ENV="/opt/atendente"
ENV="$PASTA_ENV/.env"
COMPOSE="$SRC/tools/atendente/docker-compose.yml"
CADDYFILE="/etc/caddy/Caddyfile"
REDE="wa-akg_default"
# Endereço do WA-AKG visto da própria VPS (o Caddy já usa essa porta).
WA_LOCAL="${WA_LOCAL:-http://127.0.0.1:3000}"
LEADS_JSON="${LEADS_JSON:-/root/leads.json}"

parar() { echo; echo "PAROU: $*"; echo "Nada foi estragado. Resolva o que está escrito acima e rode este mesmo comando de novo."; exit 1; }
passo() { echo; echo "==> $*"; }
ok()    { echo "    ok: $*"; }

[ "$(id -u)" -eq 0 ] || parar "rode como administrador (root). Entre na VPS como root e tente de novo."

# ---------------------------------------------------------------- 1. conferências
passo "1/8 Conferindo o que já existe na VPS"
command -v docker >/dev/null 2>&1 || parar "o Docker não está instalado."
docker compose version >/dev/null 2>&1 || parar "o 'docker compose' não está disponível."
docker network inspect "$REDE" >/dev/null 2>&1 || parar "não achei a rede '$REDE'. O WA-AKG está ligado? Teste: cd /root/WA-AKG && docker compose up -d"
command -v git >/dev/null 2>&1 || { apt-get install -y git >/dev/null 2>&1 || parar "não consegui instalar o git."; }
command -v curl >/dev/null 2>&1 || { apt-get install -y curl >/dev/null 2>&1 || parar "não consegui instalar o curl."; }
command -v openssl >/dev/null 2>&1 || parar "o openssl não está instalado (apt-get install -y openssl)."
command -v python3 >/dev/null 2>&1 || { apt-get install -y python3 >/dev/null 2>&1 || parar "não consegui instalar o python3."; }
command -v caddy >/dev/null 2>&1 || parar "o Caddy não está instalado."
[ -f "$CADDYFILE" ] || parar "não achei $CADDYFILE."
ok "Docker, rede do WA-AKG e Caddy encontrados"

# ---------------------------------------------------------------- 2. código
passo "2/8 Baixando o código em $SRC"
if [ -d "$SRC/.git" ]; then
  git -C "$SRC" pull --ff-only || parar "não consegui atualizar o código em $SRC."
else
  [ -e "$SRC" ] && parar "$SRC existe mas não é uma cópia do repositório. Renomeie essa pasta e tente de novo."
  git clone "$REPO_URL" "$SRC" || parar "não consegui baixar $REPO_URL."
fi
[ -f "$COMPOSE" ] || parar "o arquivo $COMPOSE não existe nesta versão do código."
ok "código em dia"

# ---------------------------------------------------------------- 3. segredos
valor_env() { grep -E "^$1=" "$ENV" 2>/dev/null | head -n1 | cut -d= -f2-; }

pedir_segredo() {  # pedir_segredo "texto" -> imprime o valor
  local v=""
  while [ -z "$v" ]; do
    read -r -s -p "$1: " v </dev/tty; echo >&2
    [ -z "$v" ] && echo "    (não pode ficar vazio)" >&2
  done
  printf '%s' "$v"
}
pedir_texto() {
  local v=""
  while [ -z "$v" ]; do
    read -r -p "$1: " v </dev/tty
    [ -z "$v" ] && echo "    (não pode ficar vazio)" >&2
  done
  printf '%s' "$v"
}
senha_ok() { case "$1" in *[\ \#\"\'\$,:\\]*) return 1;; esac; [ "${#1}" -ge 8 ]; }

passo "3/8 Segredos (guardados só em $ENV, modo 600)"
REFAZER=sim
if [ -f "$ENV" ]; then
  echo "    Já existe um $ENV de uma instalação anterior."
  read -r -p "    Manter o que já está lá? [S/n]: " r </dev/tty
  case "$r" in n|N|nao|não|NAO) REFAZER=sim;; *) REFAZER=nao;; esac
fi

if [ "$REFAZER" = "sim" ]; then
  mkdir -p "$PASTA_ENV" && chmod 700 "$PASTA_ENV"
  echo "    O que você digitar NÃO aparece na tela. É normal."
  WA_KEY="$(pedir_segredo "Chave do WA-AKG (a nova, que você gerou depois de trocar)")"
  WA_SESSAO="$(pedir_texto "Nome da sessão do WhatsApp no WA-AKG")"
  OR_KEY="$(pedir_segredo "Chave do OpenRouter")"
  USUARIOS=""
  while :; do
    nome="$(pedir_texto "Nome de quem vai entrar na tela (só letras minúsculas, sem espaço)")"
    case "$nome" in *[!a-z0-9]*) echo "    use só letras minúsculas e números."; continue;; esac
    while :; do
      senha="$(pedir_segredo "Senha de $nome (8 ou mais caracteres; sem espaço nem , : # \$ ' \" \\)")"
      senha_ok "$senha" && break
      echo "    senha fora das regras, tente outra."
    done
    USUARIOS="${USUARIOS:+$USUARIOS,}$nome:$senha"
    read -r -p "    Cadastrar mais alguém? [s/N]: " mais </dev/tty
    case "$mais" in s|S|sim) ;; *) break;; esac
  done
  while :; do
    NUMEROS="$(pedir_texto "Números da equipe para os avisos, com 55 e DDD, separados por vírgula (ex.: 55659999000NN)")"
    echo "$NUMEROS" | grep -Eq '^[0-9]{12,13}(,[0-9]{12,13})*$' && break
    echo "    formato errado: só números, com 55 e DDD, separados por vírgula, sem espaço."
  done
  WEBHOOK_SEGREDO="$(openssl rand -hex 32)"
  SEGREDO_SESSAO="$(openssl rand -hex 32)"
  umask 077
  cat > "$ENV.novo" <<ENVFIM
WA_AKG_URL=http://app:3000
WA_AKG_SESSION=$WA_SESSAO
WA_AKG_KEY=$WA_KEY
OPENROUTER_API_KEY=$OR_KEY
WEBHOOK_SEGREDO=$WEBHOOK_SEGREDO
SEGREDO_SESSAO=$SEGREDO_SESSAO
USUARIOS=$USUARIOS
AVISAR_NUMEROS=$NUMEROS
FOTOS_URL=https://reiners.agency/fotos-cenarios
ENVFIM
  chmod 600 "$ENV.novo"
  mv -f "$ENV.novo" "$ENV"
  chmod 600 "$ENV"
  unset WA_KEY OR_KEY USUARIOS senha
  ok "$ENV gravado (modo 600)"
else
  chmod 600 "$ENV"
  ok "mantendo o $ENV que já existe"
fi
for var in WA_AKG_SESSION WA_AKG_KEY OPENROUTER_API_KEY WEBHOOK_SEGREDO SEGREDO_SESSAO USUARIOS AVISAR_NUMEROS; do
  [ -n "$(valor_env "$var")" ] || parar "falta $var em $ENV. Apague o arquivo ($ENV) e rode de novo para refazer."
done

# ---------------------------------------------------------------- 4. subir
passo "4/8 Ligando o atendente (a primeira vez demora alguns minutos)"
docker compose -f "$COMPOSE" up -d --build || parar "o Docker não conseguiu ligar o atendente. Veja: docker compose -f $COMPOSE logs --tail 50"
ok "contêiner ligado"

passo "5/8 Esperando o atendente responder"
saudavel=nao
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8088/saude >/dev/null 2>&1; then saudavel=sim; break; fi
  sleep 2
done
[ "$saudavel" = "sim" ] || parar "o atendente não respondeu em 1 minuto. Veja: docker compose -f $COMPOSE logs --tail 50"
ok "atendente respondendo em http://127.0.0.1:8088/saude"

# ---------------------------------------------------------------- 6. Caddy
passo "6/8 Configurando os endereços no Caddy"
mudou=nao
COPIA="$CADDYFILE.bak-$(date +%Y%m%d-%H%M%S)"
copiou=nao
fazer_copia() { [ "$copiou" = "sim" ] || { cp -p "$CADDYFILE" "$COPIA" && copiou=sim && ok "cópia de segurança: $COPIA"; }; }

if ! grep -Eq '^[[:space:]]*wa\.reiners\.agency[[:space:]]*\{' "$CADDYFILE"; then
  parar "não achei o bloco 'wa.reiners.agency {' no $CADDYFILE. Nada foi alterado. Veja o modelo em $SRC/tools/atendente/Caddyfile.exemplo"
fi

if grep -Eq 'handle_path[[:space:]]+/central/\*' "$CADDYFILE"; then
  ok "wa.reiners.agency/central já configurado"
  grep -q 'X-Forwarded-Prefix' "$CADDYFILE" || echo "    AVISO: o bloco /central/ existente é de uma versão antiga (sem 'respond @webhook 404' e sem X-Forwarded-Prefix). Ajuste-o pelo modelo $SRC/tools/atendente/Caddyfile.exemplo."
else
  fazer_copia
  awk '
    { print }
    !feito && /^[[:space:]]*wa\.reiners\.agency[[:space:]]*\{/ {
      print "\thandle_path /central/* {"
      print "\t\t@webhook path /webhook"
      print "\t\trespond @webhook 404"
      print "\t\treverse_proxy 127.0.0.1:8088 {"
      print "\t\t\theader_up X-Forwarded-Prefix /central"
      print "\t\t}"
      print "\t}"
      feito=1
    }' "$CADDYFILE" > "$CADDYFILE.novo" && cat "$CADDYFILE.novo" > "$CADDYFILE" && rm -f "$CADDYFILE.novo"
  mudou=sim
  ok "acrescentado /central/ dentro de wa.reiners.agency"
fi

if grep -Eq '^[[:space:]]*central\.reiners\.agency[[:space:]]*(\{|,)' "$CADDYFILE"; then
  ok "central.reiners.agency já configurado"
else
  fazer_copia
  {
    echo
    echo "central.reiners.agency {"
    echo "	@webhook path /webhook"
    echo "	respond @webhook 404"
    echo "	reverse_proxy 127.0.0.1:8088"
    echo "}"
  } >> "$CADDYFILE"
  mudou=sim
  ok "acrescentado o bloco central.reiners.agency"
fi

if [ "$mudou" = "sim" ]; then
  if caddy validate --config "$CADDYFILE" --adapter caddyfile >/dev/null 2>&1; then
    ok "o Caddy aprovou a configuração"
    if systemctl reload caddy 2>/dev/null || systemctl restart caddy 2>/dev/null; then
      ok "Caddy recarregado"
    else
      cp -p "$COPIA" "$CADDYFILE"
      parar "o Caddy não recarregou. Restaurei a cópia de segurança ($COPIA). Veja: systemctl status caddy"
    fi
  else
    cp -p "$COPIA" "$CADDYFILE"
    parar "o Caddy NÃO aprovou a configuração nova. Restaurei a cópia de segurança ($COPIA); o site continua como estava. Rode: caddy validate --config $CADDYFILE"
  fi
fi

# ---------------------------------------------------------------- 7. webhook
passo "7/8 Avisando o WA-AKG de onde mandar as respostas (webhook)"
WA_KEY_ENV="$(valor_env WA_AKG_KEY)"
WA_SESSAO_ENV="$(valor_env WA_AKG_SESSION)"
SEGREDO_ENV="$(valor_env WEBHOOK_SEGREDO)"
URL_HOOKS="$WA_LOCAL/api/webhooks/$WA_SESSAO_ENV"
URL_ATENDENTE="http://atendente:8088/webhook"
# Chave e segredo vão por arquivos temporários (modo 600) para não aparecerem na lista de processos (ps).
umask 077
CABECALHO="$(mktemp)"; CORPO="$(mktemp)"; SAIDA="$(mktemp)"
trap 'rm -f "$CABECALHO" "$CORPO" "$SAIDA"' EXIT
chmod 600 "$CABECALHO" "$CORPO" "$SAIDA"
printf 'X-API-Key: %s\n' "$WA_KEY_ENV" > "$CABECALHO"
unset WA_KEY_ENV
printf '{"name":"atendente","url":"%s","secret":"%s","events":["message.received","message.sent"]}' \
  "$URL_ATENDENTE" "$SEGREDO_ENV" > "$CORPO"
unset SEGREDO_ENV

chamar() {  # chamar METODO URL [corpo]  -> código HTTP em $codigo, resposta em $SAIDA
  local metodo="$1" url="$2" extra=()
  [ "$metodo" = "GET" ] || [ "$metodo" = "DELETE" ] || extra=(-H 'Content-Type: application/json' --data @"$CORPO")
  : > "$SAIDA"
  codigo="$(curl -sS -m 20 -o "$SAIDA" -w '%{http_code}' -X "$metodo" -H @"$CABECALHO" "${extra[@]}" "$url" 2>&1)"
}

chamar GET "$URL_HOOKS"
case "$codigo" in
  2??) ;;
  *)   parar "o WA-AKG em $WA_LOCAL não aceitou a consulta (código $codigo). A chave e o nome da sessão estão certos? Resposta: $(cat "$SAIDA" 2>/dev/null)";;
esac
# IDs dos webhooks que já apontam para o atendente (um por linha).
IDS="$(python3 -I -c '
import json, sys
alvo = sys.argv[1]
achados = []
def varrer(o):
    if isinstance(o, dict):
        if o.get("url") == alvo and o.get("id") is not None:
            achados.append(str(o["id"]))
        for v in o.values():
            varrer(v)
    elif isinstance(o, list):
        for v in o:
            varrer(v)
try:
    varrer(json.load(open(sys.argv[2])))
except Exception:
    sys.exit(3)
print("\n".join(dict.fromkeys(achados)))
' "$URL_ATENDENTE" "$SAIDA")" || parar "não consegui entender a lista de webhooks do WA-AKG. Resposta: $(head -c 300 "$SAIDA")"

if [ -z "$IDS" ]; then
  chamar POST "$URL_HOOKS"
  case "$codigo" in
    2??) ok "webhook registrado";;
    *)   parar "o WA-AKG recusou o registro do webhook (código $codigo): $(cat "$SAIDA" 2>/dev/null)";;
  esac
else
  PRIMEIRO="$(printf '%s\n' "$IDS" | head -n1)"
  # Atualiza com o segredo atual do .env: se o segredo mudou numa reinstalação, sem isto todo webhook daria 401.
  chamar PUT "$URL_HOOKS/$PRIMEIRO"
  case "$codigo" in
    2??) ok "webhook já existia: atualizado com o segredo atual";;
    *)   parar "o WA-AKG recusou a atualização do webhook (código $codigo): $(cat "$SAIDA" 2>/dev/null)";;
  esac
  printf '%s\n' "$IDS" | tail -n +2 | while IFS= read -r extra_id; do
    [ -n "$extra_id" ] || continue
    chamar DELETE "$URL_HOOKS/$extra_id"
    case "$codigo" in
      2??) echo "    ok: webhook duplicado apagado";;
      *)   echo "    AVISO: não consegui apagar um webhook duplicado (código $codigo). Pode apagar depois pelo painel do WA-AKG.";;
    esac
  done
fi
rm -f "$CABECALHO" "$CORPO" "$SAIDA"

# ---------------------------------------------------------------- 8. leads
passo "8/8 Importando os leads"
SEM_LEADS=nao
if [ -f "$LEADS_JSON" ]; then
  docker cp "$LEADS_JSON" atendente:/data/leads.json 2>/dev/null || parar "não consegui copiar $LEADS_JSON para o atendente."
  docker exec -u 0 atendente chmod 644 /data/leads.json >/dev/null 2>&1
  saida_imp="$(docker compose -f "$COMPOSE" run --rm -T atendente python -m atendente.importar /data/leads.json 2>&1)"
  rc_imp=$?
  docker exec -u 0 atendente rm -f /data/leads.json >/dev/null 2>&1
  linha_imp="$(printf '%s\n' "$saida_imp" | grep -E 'importados=' | tail -n1)"
  [ -n "$linha_imp" ] || linha_imp="$(printf '%s\n' "$saida_imp" | tail -n1)"
  if [ "$rc_imp" -ne 0 ]; then
    echo
    echo "ERRO: nenhum lead foi importado (código $rc_imp)."
    echo "    Resultado: $linha_imp"
    echo "    O atendente está instalado e em ESPERA, mas SEM leads. NÃO ligue o atendente ainda."
    echo "    Confira se o arquivo $LEADS_JSON é o certo (o Claude entrega o leads.json atualizado) e rode este script de novo."
    echo "    Detalhes: docker compose -f $COMPOSE run --rm -T atendente python -m atendente.importar /data/leads.json"
    exit 1
  fi
  ok "importação concluída: $linha_imp (cópia temporária apagada do atendente)"
else
  SEM_LEADS=sim
  echo "    AVISO: o arquivo $LEADS_JSON não foi encontrado. O atendente ficou SEM leads."
  echo "    Para importar depois: copie o leads.json (o Claude entrega o atualizado) para $LEADS_JSON na VPS e rode este script de novo"
  echo "    (na pergunta sobre o .env, aperte ENTER para manter o que já existe)."
fi

echo
if [ "$SEM_LEADS" = "sim" ]; then
  echo "INSTALADO, mas SEM LEADS (veja o aviso acima)."
else
  echo "INSTALADO."
fi
echo
echo "O atendente está instalado e em ESPERA. Ele só começa a responder e enviar quando você clicar em"
echo "\"Ligar atendente\" no painel (central.reiners.agency ou wa.reiners.agency/central/), depois que o"
echo "Claude confirmar que parou o lado dele. NÃO clique antes."
echo
echo "Teste de saúde (deve mostrar {\"ok\": true}):"
echo "    curl http://127.0.0.1:8088/saude"
echo "Tela: https://wa.reiners.agency/central/   (e https://central.reiners.agency depois de criar o registro DNS)"
