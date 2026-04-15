import os
from pathlib import Path
from typing import Any, Dict

import mysql.connector
from mysql.connector import Error


def load_env_file() -> None:
    """Load key=value pairs from a local .env file if present."""
    env_path = Path(__file__).resolve().parent / ".env"
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            # Project-local .env should take precedence over inherited shell env vars.
            os.environ[key] = value


load_env_file()


def get_db_config() -> Dict[str, Any]:
    """Read database config from environment variables."""
    return {
        "host": os.getenv("DB_HOST", "localhost"),
        "port": int(os.getenv("DB_PORT", "3306")),
        "user": os.getenv("DB_USER", "root"),
        "password": os.getenv("DB_PASSWORD", ""),
        "database": os.getenv("DB_NAME", "food_waste_db"),
    }


def get_db_connection():
    """Create and return a MySQL connection."""
    config = get_db_config()
    try:
        return mysql.connector.connect(**config)
    except Error as exc:
        raise RuntimeError(f"Database connection failed: {exc}") from exc
