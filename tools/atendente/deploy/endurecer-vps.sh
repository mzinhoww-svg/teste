#!/usr/bin/env bash
# Deixa a VPS mais segura. Pode rodar quantas vezes quiser. Rode como root:
#   bash endurecer-vps.sh
#
# O que faz, em português simples:
#  1. Instala o fail2ban (bloqueia quem erra a senha várias vezes).
#  2. Instala as atualizações automáticas de segurança.
#  3. Confere o firewall: só as portas 22 (acesso), 80 e 443 (site) ficam abertas.
#  4. OPCIONAL: troca a senha por chave SSH. Só acontece se você pedir e confirmar tudo.
set -u

parar() { echo; echo "PAROU: $*"; exit 1; }
passo() { echo; echo "==> $*"; }
ok()    { echo "    ok: $*"; }

[ "$(id -u)" -eq 0 ] || parar "rode como administrador (root)."
command -v apt-get >/dev/null 2>&1 || parar "este script é para Ubuntu/Debian (apt-get)."

passo "1/4 Instalando fail2ban e atualizações automáticas"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y >/dev/null 2>&1 || echo "    aviso: apt-get update falhou, tentando instalar mesmo assim"
apt-get install -y fail2ban unattended-upgrades ufw >/dev/null 2>&1 || parar "não consegui instalar os pacotes. Teste: apt-get install -y fail2ban unattended-upgrades ufw"
systemctl enable --now fail2ban >/dev/null 2>&1 || parar "o fail2ban não ligou. Veja: systemctl status fail2ban"
ok "fail2ban ligado"
echo 'APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";' > /etc/apt/apt.conf.d/20auto-upgrades
systemctl enable --now unattended-upgrades >/dev/null 2>&1 || true
ok "atualizações automáticas de segurança ligadas"

passo "2/4 Firewall (só 22, 80 e 443)"
# Libera o 22 ANTES de ligar, para você não ficar de fora.
ufw allow 22/tcp >/dev/null 2>&1
ufw allow 80/tcp >/dev/null 2>&1
ufw allow 443/tcp >/dev/null 2>&1
if ! ufw status | grep -q "Status: active"; then
  ufw --force enable >/dev/null 2>&1 || parar "não consegui ligar o firewall."
fi
ufw status | sed 's/^/    /'
extras="$(ufw status | grep -E '^[0-9]+' | grep -Ev '^(22|80|443)(/tcp)?[[:space:]]' || true)"
if [ -n "$extras" ]; then
  echo
  echo "    ATENÇÃO: o firewall tem outras portas abertas além de 22, 80 e 443:"
  echo "$extras" | sed 's/^/      /'
  echo "    Se não souber por que estão ali, me mostre esta tela antes de mexer."
else
  ok "firewall com só 22, 80 e 443"
fi
echo "    Obs.: portas que o Docker publica podem furar o ufw; por isso o atendente é publicado só em 127.0.0.1."

passo "3/4 Chave SSH (opcional)"
echo "    Entrar por chave é mais seguro que por senha. É OPCIONAL e você pode pular."
echo "    Se pular, nada muda no seu acesso. Para pular, só aperte ENTER."
read -r -p "    Quer configurar a chave SSH agora? Digite SIM para continuar, ENTER para pular: " quer </dev/tty
if [ "$quer" != "SIM" ]; then
  ok "pulado: o login por senha continua como estava"
  passo "4/4 Resumo"
  echo "    VPS endurecida (fail2ban, atualizações e firewall). Login por senha NÃO foi alterado."
  exit 0
fi

echo
echo "    No SEU computador, gere uma chave (se ainda não tiver) e copie a parte PÚBLICA:"
echo "      Windows (PowerShell):  ssh-keygen -t ed25519   e depois   type \$env:USERPROFILE\\.ssh\\id_ed25519.pub"
echo "      Mac/Linux:             ssh-keygen -t ed25519   e depois   cat ~/.ssh/id_ed25519.pub"
echo "    Ela começa com 'ssh-ed25519'. NUNCA cole a chave privada (a que não termina em .pub)."
read -r -p "    Cole aqui a chave pública (uma linha) e aperte ENTER: " chave </dev/tty
case "$chave" in
  ssh-ed25519\ *|ssh-rsa\ *|ecdsa-sha2-*\ *|sk-ssh-ed25519@openssh.com\ *) ;;
  *PRIVATE*) parar "isso parece uma chave PRIVADA. Não cole essa. Nada foi alterado.";;
  *) parar "isso não parece uma chave pública. Nada foi alterado.";;
esac

mkdir -p /root/.ssh && chmod 700 /root/.ssh
touch /root/.ssh/authorized_keys && chmod 600 /root/.ssh/authorized_keys
if grep -qxF "$chave" /root/.ssh/authorized_keys; then
  ok "a chave já estava em authorized_keys"
else
  printf '%s\n' "$chave" >> /root/.ssh/authorized_keys
  ok "chave gravada em /root/.ssh/authorized_keys"
fi
grep -qxF "$chave" /root/.ssh/authorized_keys || parar "a chave não ficou gravada. Nada foi alterado no SSH."

echo
echo "    AGORA, OUTRA JANELA: abra um segundo terminal e entre na VPS usando a chave (sem digitar senha)."
echo "    NÃO feche esta janela. Se o login por chave funcionar nessa outra janela, volte aqui."
read -r -p "    Testou o login por chave em OUTRA janela e funcionou? Digite SIM para continuar, ENTER para desistir: " testou </dev/tty
[ "$testou" = "SIM" ] || { ok "desistiu: o login por senha continua como estava"; exit 0; }
read -r -p "    ÚLTIMA CONFIRMAÇÃO: desligar o login por senha? Digite SIM em maiúsculas: " final </dev/tty
[ "$final" = "SIM" ] || { ok "desistiu: o login por senha continua como estava"; exit 0; }

mkdir -p /etc/ssh/sshd_config.d
ARQ=/etc/ssh/sshd_config.d/00-sem-senha.conf
COPIA=""
[ -f "$ARQ" ] && { COPIA="$ARQ.bak-$(date +%Y%m%d-%H%M%S)"; cp -p "$ARQ" "$COPIA"; }
cat > "$ARQ" <<'CONF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
CONF
if sshd -t 2>/tmp/sshd-teste.err; then
  systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || systemctl restart ssh 2>/dev/null || systemctl restart sshd 2>/dev/null \
    || parar "não consegui recarregar o SSH. Remova $ARQ se quiser desfazer."
  ok "login por senha desligado. Mantenha a outra janela aberta e confirme que ainda consegue entrar por chave."
else
  if [ -n "$COPIA" ]; then cp -p "$COPIA" "$ARQ"; else rm -f "$ARQ"; fi
  parar "o teste do SSH (sshd -t) falhou, desfiz a mudança: $(cat /tmp/sshd-teste.err)"
fi
echo
echo "    Para desfazer: rm $ARQ && systemctl reload ssh"
