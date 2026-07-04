#!/bin/sh
set -eu

if [ -z "${SEARXNG_SECRET_KEY:-}" ]; then
  echo "SEARXNG_SECRET_KEY is required. Generate one with: openssl rand -hex 32" >&2
  exit 1
fi

python - <<'PY'
import os
from pathlib import Path

config_dir = Path("/etc/searxng")
template = (config_dir / "settings.template.yml").read_text(encoding="utf-8")
settings = (
    template
    .replace("__SEARXNG_SECRET_KEY__", os.environ["SEARXNG_SECRET_KEY"])
    .replace("__SEARXNG_INSTANCE_NAME__", os.environ.get("INSTANCE_NAME", "Vultr Audit Search"))
)
(config_dir / "settings.yml").write_text(settings, encoding="utf-8")
PY

exec /usr/local/searxng/entrypoint.sh
