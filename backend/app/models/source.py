from sqlalchemy import Column, String, Boolean, DateTime, Integer, Text
from sqlalchemy.sql import func
from app.core.database import Base
import uuid

def generate_uuid():
    return str(uuid.uuid4())

class Source(Base):
    __tablename__ = "sources"

    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    url = Column(String, nullable=False)
    type = Column(String) 
    category = Column(String) 
    country = Column(String)
    language = Column(String, default="en")
    feed_url = Column(String, unique=True)
    active = Column(Boolean, default=True, nullable=False)
    collection_method = Column(String, default="rss")
    last_collected_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Collection health, updated after every run
    last_status = Column(String, default="never")  # never | healthy | warning | error
    last_error = Column(Text)
    last_new_articles = Column(Integer, default=0)
    consecutive_failures = Column(Integer, default=0, nullable=False)
