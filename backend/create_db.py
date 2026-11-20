"""Creates the MySQL database named in DATABASE_URL if it does not exist yet."""
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

from app.config import Config

url = make_url(Config.SQLALCHEMY_DATABASE_URI)
engine = create_engine(url._replace(database=None))  # connect to the server, not to a database
with engine.connect() as conn:
    conn.execute(text(f"CREATE DATABASE IF NOT EXISTS `{url.database}` CHARACTER SET utf8mb4"))
print(f"Database '{url.database}' is ready.")
