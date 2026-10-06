"""Valida a implantação: sintaxe dos scripts, compose, e que nada sensível vai para o repositório público."""
import os
import re
import shutil
import subprocess

import pytest

AQUI = os.path.dirname(os.path.abspath(__file__))
ATENDENTE = os.path.dirname(AQUI)                       # tools/atendente
RAIZ = os.path.dirname(os.path.dirname(ATENDENTE))      # raiz do repositório
DEPLOY = os.path.join(ATENDENTE, "deploy")
SCRIPTS = [os.path.join(DEPLOY, n) for n in
           ("instalar-atendente.sh", "atualizar.sh", "endurecer-vps.sh")]

PASTAS_VARRIDAS = [
    ATENDENTE,
    os.path.join(RAIZ, "docs", "superpowers", "plans"),
    os.path.join(RAIZ, "docs", "superpowers", "specs"),
]
IGNORAR_DIRS = {"__pycache__", ".pytest_cache", "node_modules", ".git"}
EXTENSOES_BINARIAS = (".pyc", ".db", ".png", ".jpg", ".jpeg", ".gif", ".ico", ".woff", ".woff2")

# Celular brasileiro: 55 + DDD + 9 + 8 dígitos, com ou sem máscara/DDI.
CELULAR = re.compile(r"(?<!\d)(?:\+?55[\s.-]?)?\(?\d{2}\)?[\s.-]?9[\s.-]?\d{4}[\s.-]?\d{4}(?!\d)")
CHAVE = re.compile(r"\b(?:wag_|sk-or-)[A-Za-z0-9_-]{4,}")
# Números fictícios aceitos: 55659999000NN (NN = 2 dígitos) e o exemplo 5565999991111 da documentação.
FICTICIOS = (re.compile(r"^(?:55)?659999000\d{2}$"), re.compile(r"^(?:55)?65999991111$"))


def _arquivos(pasta):
    for base, dirs, nomes in os.walk(pasta):
        dirs[:] = [d for d in dirs if d not in IGNORAR_DIRS]
        for n in nomes:
            if n.endswith(EXTENSOES_BINARIAS):
                continue
            yield os.path.join(base, n)


def _ficticio(achado):
    digitos = re.sub(r"\D", "", achado)
    return any(p.match(digitos) for p in FICTICIOS)


def test_scripts_existem_e_sao_bash():
    for s in SCRIPTS:
        assert os.path.isfile(s), s
        with open(s, encoding="utf-8") as f:
            assert f.readline().startswith("#!/usr/bin/env bash"), s


def test_scripts_sintaxe_ok():
    for s in SCRIPTS:
        r = subprocess.run(["bash", "-n", s], capture_output=True, text=True)
        assert r.returncode == 0, f"{s}: {r.stderr}"


@pytest.mark.skipif(shutil.which("shellcheck") is None, reason="shellcheck não instalado")
def test_scripts_shellcheck():
    for s in SCRIPTS:
        r = subprocess.run(["shellcheck", "-S", "error", s], capture_output=True, text=True)
        assert r.returncode == 0, f"{s}: {r.stdout}"


def test_nenhum_telefone_ou_chave_no_repositorio():
    problemas = []
    for pasta in PASTAS_VARRIDAS:
        for caminho in _arquivos(pasta):
            try:
                with open(caminho, encoding="utf-8") as f:
                    texto = f.read()
            except (UnicodeDecodeError, OSError):
                continue
            rel = os.path.relpath(caminho, RAIZ)
            for m in CELULAR.finditer(texto):
                if not _ficticio(m.group(0)):
                    problemas.append(f"{rel}: telefone? {m.group(0)!r}")
            for m in CHAVE.finditer(texto):
                if re.search(r"FICTICI|FAKE|EXEMPLO|COLE_AQUI", m.group(0), re.I):
                    continue          # chaves de mentira usadas nos testes
                problemas.append(f"{rel}: chave? {m.group(0)[:8]}...")
    assert not problemas, "\n".join(problemas)


def test_regex_de_telefone_pega_o_que_deve():
    # Exemplos montados por partes para este arquivo não casar com a própria varredura.
    assert CELULAR.search("55119" + "87654321")
    assert CELULAR.search("+55 (11) 9" + "8765-4321")
    assert CELULAR.search("(11) 9" + "8765-4321")
    assert CHAVE.search("wag" + "_abcdef123456")
    assert CHAVE.search("sk-or" + "-v1-abcdef")
    assert _ficticio("55659999000" + "11")
    assert not CELULAR.search("55659999000NN")


def test_env_exemplo_nao_tem_valores_reais():
    caminho = os.path.join(ATENDENTE, ".env.exemplo")
    chaves = set()
    with open(caminho, encoding="utf-8") as f:
        for linha in f:
            linha = linha.strip()
            if not linha or linha.startswith("#"):
                continue
            assert "=" in linha, linha
            k, v = linha.split("=", 1)
            chaves.add(k)
            if k in ("WA_AKG_URL", "FOTOS_URL"):
                continue
            if k == "AVISAR_NUMEROS":
                assert v == "55659999000NN", linha
                continue
            assert "COLE_AQUI" in v, f"{k} deve ser um marcador, não um valor"
    esperadas = {"WA_AKG_URL", "WA_AKG_SESSION", "WA_AKG_KEY", "OPENROUTER_API_KEY", "WEBHOOK_SEGREDO",
                 "SEGREDO_SESSAO", "USUARIOS", "AVISAR_NUMEROS", "FOTOS_URL"}
    assert esperadas <= chaves


def _yaml_ou_none():
    try:
        import yaml
        return yaml
    except ImportError:
        return None


def test_compose_valido():
    caminho = os.path.join(ATENDENTE, "docker-compose.yml")
    yaml = _yaml_ou_none()
    if yaml is not None:
        dados = yaml.safe_load(open(caminho, encoding="utf-8"))
        svc = dados["services"]["atendente"]
        assert svc["ports"] == ["127.0.0.1:8088:8088"]
        assert svc["mem_limit"] == "256m"
        assert svc["restart"] == "unless-stopped"
        assert svc["env_file"] == "/opt/atendente/.env"
        assert "atendente_data:/data" in svc["volumes"]
        assert "wa-akg_default" in svc["networks"]
        assert dados["networks"]["wa-akg_default"]["external"] is True
    else:
        texto = open(caminho, encoding="utf-8").read()
        for trecho in ("127.0.0.1:8088:8088", "mem_limit: 256m", "unless-stopped",
                       "/opt/atendente/.env", "atendente_data:/data", "wa-akg_default", "external: true"):
            assert trecho in texto, trecho
    if shutil.which("docker"):
        # Cópia temporária: troca o env_file de produção por um falso e o contexto por caminho absoluto.
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            env = os.path.join(tmp, "env")
            open(env, "w").close()
            texto = open(caminho, encoding="utf-8").read()
            texto = texto.replace("/opt/atendente/.env", env).replace("context: ../..", "context: " + RAIZ)
            copia = os.path.join(tmp, "docker-compose.yml")
            open(copia, "w", encoding="utf-8").write(texto)
            r = subprocess.run(["docker", "compose", "-f", copia, "config", "-q"], capture_output=True, text=True)
        if r.returncode != 0 and "docker daemon" in r.stderr.lower():
            pytest.skip("Docker sem daemon nesta máquina")
        assert r.returncode == 0, r.stderr


def test_dockerfile_segue_as_regras():
    t = open(os.path.join(ATENDENTE, "Dockerfile"), encoding="utf-8").read()
    assert "FROM python:3.12-slim" in t
    assert "COPY tools/atendente/atendente /app/atendente" in t
    assert "COPY tools/prospeccao/scripts /app/scripts" in t
    assert "COPY tools/prospeccao/msg /app/msg" in t
    assert "COPY .claude/skills/disparar-wa/conhecimento-reiners.md /app/conhecimento.md" in t
    assert re.search(r"^USER\s+(?!root)\S+", t, re.M)
    assert 'CMD ["python", "-m", "atendente"]' in t
    assert "DB_CAMINHO=/data/atendente.db" in t
    assert "CONHECIMENTO_CAMINHO=/app/conhecimento.md" in t


def test_instalador_tem_as_travas_combinadas():
    t = open(os.path.join(DEPLOY, "instalar-atendente.sh"), encoding="utf-8").read()
    assert "read -r -s" in t
    assert t.count("openssl rand -hex 32") == 2
    assert "chmod 600" in t
    assert "caddy validate" in t and t.index("caddy validate") < t.index("systemctl reload caddy")
    assert 'cp -p "$COPIA" "$CADDYFILE"' in t
    assert "/api/webhooks/" in t and "X-API-Key" in t
    assert '"events":["message.received","message.sent"]' in t
    assert "python -m atendente.importar /data/leads.json" in t
    assert "--data @" in t and '-d "$corpo"' not in t          # segredo fora do ps
    assert "-X PUT" not in t and "chamar PUT" in t and "chamar DELETE" in t
    assert "@webhook path /webhook" in t and "respond @webhook 404" in t
    assert "header_up X-Forwarded-Prefix /central" in t
    assert "ESPERA" in t and "Ligar atendente" in t


def test_endurecer_nunca_desliga_senha_por_padrao():
    t = open(os.path.join(DEPLOY, "endurecer-vps.sh"), encoding="utf-8").read()
    assert "fail2ban" in t and "unattended-upgrades" in t
    assert "sshd -t" in t
    assert t.index("authorized_keys") < t.index("PasswordAuthentication no")
    assert t.count('= "SIM"') >= 3


def test_caddyfile_exemplo_bloqueia_webhook_e_marca_prefixo():
    t = open(os.path.join(ATENDENTE, "Caddyfile.exemplo"), encoding="utf-8").read()
    assert t.count("@webhook path /webhook") == 2 and t.count("respond @webhook 404") == 2
    assert t.count("header_up X-Forwarded-Prefix /central") == 1
    for bloco in t.split("respond @webhook 404")[1:]:
        assert bloco.lstrip().startswith("reverse_proxy"), "respond precisa vir antes do reverse_proxy"


def test_endurecer_libera_portas_do_ssh_antes_do_ufw():
    t = open(os.path.join(DEPLOY, "endurecer-vps.sh"), encoding="utf-8").read()
    assert "sshd -T" in t and "ss -tlnp" in t
    assert t.index("ufw allow") < t.index("ufw --force enable")
    assert "ufw allow 22/tcp" not in t


def test_atualizar_constroi_antes_e_volta_se_falhar():
    t = open(os.path.join(DEPLOY, "atualizar.sh"), encoding="utf-8").read()
    assert "up -d --build" not in t
    assert t.index(" build ||") < t.index("docker tag \"$ATUAL\" atendente:anterior") < t.index("up -d --no-build")
    assert "/saude" in t and "docker tag atendente:anterior atendente:local" in t


def test_leigo_explica_espera_e_aviso_previo():
    t = open(os.path.join(DEPLOY, "LEIGO.md"), encoding="utf-8").read()
    assert "Ligar atendente" in t and "ESPERA" in t
    assert "vou instalar" in t
    assert "Não clique antes" in t or "Não clique antes".lower() in t.lower()


def _copias_do_dockerfile():
    """(origem relativa à raiz do repositório, destino absoluto no contêiner) de cada COPY."""
    copias = []
    for linha in open(os.path.join(ATENDENTE, "Dockerfile"), encoding="utf-8"):
        partes = linha.split()
        if partes and partes[0] == "COPY":
            assert len(partes) == 3, linha
            copias.append((partes[1], partes[2]))
    return copias


def test_layout_do_conteiner_importa_o_servico(tmp_path):
    """Monta exatamente o layout do Dockerfile (/app) e importa o serviço como o CMD faria."""
    copias = _copias_do_dockerfile()
    assert ("tools/prospeccao/msg", "/app/msg") in copias      # wa_akg.py importa msg.fotos
    app = tmp_path / "app"
    app.mkdir()
    for origem, destino in copias:
        assert destino.startswith("/app/"), destino
        alvo = tmp_path / destino.lstrip("/")
        alvo.parent.mkdir(parents=True, exist_ok=True)
        fonte = os.path.join(RAIZ, origem)
        assert os.path.exists(fonte), fonte
        if os.path.isdir(fonte):
            shutil.copytree(fonte, alvo, ignore=shutil.ignore_patterns("__pycache__"))
        else:
            shutil.copy(fonte, alvo)
    env = {k: v for k, v in os.environ.items() if k not in ("PYTHONPATH", "PYTHONHOME")}
    env["PYTHONPATH"] = str(app)
    r = subprocess.run(
        ["python3", "-c",
         "import atendente.__main__, atendente.servidor, atendente.planejador, atendente.nucleo"],
        capture_output=True, text=True, env=env, cwd=str(app))   # WORKDIR /app, como no contêiner
    assert r.returncode == 0, r.stderr


def test_instalador_limpa_caracteres_invisiveis_do_que_foi_colado(tmp_path):
    """No Terminal do Mac, colar uma chave pode trazer marcadores invisíveis (ESC[200~ ... ESC[201~); o servidor
    recusa o cabeçalho com 400 e resposta vazia. O instalador precisa limpar isso antes de gravar."""
    import subprocess
    script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "deploy", "instalar-atendente.sh")
    trecho = subprocess.run(["sed", "-n", "/^limpar_entrada()/,/^}/p", script], capture_output=True, text=True).stdout
    assert "limpar_entrada" in trecho, "função limpar_entrada não existe no instalador"
    casos = {
        "wag_FICTICIO123": "wag_FICTICIO123",
        "\x1b[200~wag_FICTICIO123\x1b[201~": "wag_FICTICIO123",
        "[200~wag_FICTICIO123[201~": "wag_FICTICIO123",
        "  wag_FICTICIO123\r\n": "wag_FICTICIO123",
        "wag_FICT\tICIO123": "wag_FICTICIO123",
    }
    for entrada, esperado in casos.items():
        r = subprocess.run(["bash", "-c", trecho + '\nprintf "%s" "$1" | limpar_entrada', "x", entrada],
                           capture_output=True, text=True)
        assert r.stdout == esperado, (entrada, r.stdout, r.stderr)


def test_instalador_valida_o_formato_da_chave_e_da_sessao():
    texto = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "deploy", "instalar-atendente.sh"), encoding="utf-8").read()
    assert "limpar_entrada" in texto and "chave_ok" in texto and "sessao_ok" in texto
