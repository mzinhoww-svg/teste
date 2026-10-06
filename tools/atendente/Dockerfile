# Contexto de build = RAIZ do repositório (na VPS: /opt/atendente-src).
# Build: docker compose -f tools/atendente/docker-compose.yml build
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app \
    DB_CAMINHO=/data/atendente.db \
    CONHECIMENTO_CAMINHO=/app/conhecimento.md

# Usuário comum (sem root) e pasta de dados.
RUN useradd --system --uid 10001 --home-dir /app --shell /usr/sbin/nologin atendente \
 && mkdir -p /app /data \
 && chown atendente:atendente /data

WORKDIR /app

COPY tools/atendente/atendente /app/atendente
COPY tools/prospeccao/scripts /app/scripts
COPY .claude/skills/disparar-wa/conhecimento-reiners.md /app/conhecimento.md

USER atendente
VOLUME ["/data"]
EXPOSE 8088

CMD ["python", "-m", "atendente"]
