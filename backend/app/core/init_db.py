"""Create tables, enable pgvector and add any columns that were added to the models since the table was created.

Safe to re-run. Run from backend/:  python app/core/init_db.py
(Lightweight stand-in for migrations; switch to Alembic once the schema settles.)
"""
import os
import sys

# Add backend dir to path so we can import 'app'
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from sqlalchemy import inspect, text

from app.core.database import engine, Base
import app.models  # noqa: F401  (registers all models on Base)

INDEXES = [
    # Approximate nearest-neighbour search for similar / duplicate articles
    "CREATE INDEX IF NOT EXISTS ix_articles_embedding_hnsw ON articles USING hnsw (embedding vector_cosine_ops)",
    "CREATE INDEX IF NOT EXISTS ix_articles_status ON articles (status)",
    "CREATE INDEX IF NOT EXISTS ix_articles_duplicate_of_id ON articles (duplicate_of_id)",
    "CREATE INDEX IF NOT EXISTS ix_trends_embedding_hnsw ON trends USING hnsw (embedding vector_cosine_ops)",
    # Fast "articles mentioning this celebrity/brand" lookups (entities->'celebrities' ?| aliases)
    "CREATE INDEX IF NOT EXISTS ix_articles_celebrities_gin ON articles USING gin ((entities->'celebrities'))",
    "CREATE INDEX IF NOT EXISTS ix_articles_brands_gin ON articles USING gin ((entities->'brands'))",
    "CREATE INDEX IF NOT EXISTS ix_articles_trends_linked_at ON articles (trends_linked_at)",
]


def add_missing_columns(conn):
    inspector = inspect(conn)
    for table in Base.metadata.sorted_tables:
        existing = {c["name"] for c in inspector.get_columns(table.name)}
        for column in table.columns:
            if column.name in existing:
                continue
            col_type = column.type.compile(dialect=conn.dialect)
            ddl = f'ALTER TABLE {table.name} ADD COLUMN IF NOT EXISTS "{column.name}" {col_type}'
            if column.server_default is not None:
                ddl += f" DEFAULT {column.server_default.arg}"
            for fk in column.foreign_keys:
                ddl += f" REFERENCES {fk.column.table.name}({fk.column.name})"
                if fk.ondelete:
                    ddl += f" ON DELETE {fk.ondelete}"
            print(f"  + {table.name}.{column.name} {col_type}")
            conn.execute(text(ddl))


def init_db():
    print("Creating database tables...")
    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        Base.metadata.create_all(bind=conn)
        add_missing_columns(conn)
        for ddl in INDEXES:
            conn.execute(text(ddl))
    print("Database tables created successfully!")

if __name__ == "__main__":
    init_db()
