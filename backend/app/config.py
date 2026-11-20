import os
from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy.engine import URL

load_dotenv(Path(__file__).resolve().parent.parent / ".env")


def database_url():
    """Built from DB_HOST, DB_PORT, DB_NAME, DB_USER and DB_PASSWORD in .env.
    The password can contain any characters. DATABASE_URL, if set, is used as it is."""
    env = lambda name, default="": os.environ.get(name, default).strip()
    if env("DATABASE_URL"):
        return env("DATABASE_URL")
    if not env("DB_NAME"):
        return None
    return URL.create(
        "mysql+pymysql", username=env("DB_USER"), password=os.environ.get("DB_PASSWORD", ""),
        host=env("DB_HOST", "127.0.0.1"), port=int(env("DB_PORT", "3306")), database=env("DB_NAME"),
        query={"charset": "utf8mb4"},
    ).render_as_string(hide_password=False)


class Config:
    SQLALCHEMY_DATABASE_URI = database_url()
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SECRET_KEY = os.environ.get("SECRET_KEY")  # signs login tokens; must be set and kept private
    JWT_SECRET_KEY = SECRET_KEY
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=12)  # one login per working day
