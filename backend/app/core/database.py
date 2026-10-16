from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base
from app.core.config import settings

engine = create_engine(settings.database_url, pool_pre_ping=True)


@event.listens_for(engine, "connect")
def _set_session_timeouts(dbapi_connection, _record):
    # If a client dies mid-transaction (network drop), don't leave row locks held on the server
    with dbapi_connection.cursor() as cur:
        cur.execute("SET idle_in_transaction_session_timeout = '2min'")
    dbapi_connection.commit()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
