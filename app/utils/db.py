import os
import logging
from supabase import create_client, Client

logger = logging.getLogger(__name__)

_client: Client = None


def get_supabase() -> Client:
    global _client
    if _client:
        return _client
    url = os.getenv("SUPABASE_URL", "")
    key = os.getenv("SUPABASE_SERVICE_KEY", os.getenv("SUPABASE_ANON_KEY", ""))
    if not url or not key:
        logger.warning("Supabase credentials missing – running in mock mode")
        return None
    _client = create_client(url, key)
    return _client


def db_insert(table: str, data: dict):
    sb = get_supabase()
    if not sb:
        return {"id": "mock-id", **data}
    return sb.table(table).insert(data).execute().data


def db_select(table: str, filters: dict = None, columns: str = "*"):
    sb = get_supabase()
    if not sb:
        return []
    q = sb.table(table).select(columns)
    if filters:
        for k, v in filters.items():
            q = q.eq(k, v)
    return q.execute().data


def db_update(table: str, filters: dict, data: dict):
    sb = get_supabase()
    if not sb:
        return data
    q = sb.table(table).update(data)
    for k, v in filters.items():
        q = q.eq(k, v)
    return q.execute().data


def db_delete(table: str, filters: dict):
    sb = get_supabase()
    if not sb:
        return {}
    q = sb.table(table).delete()
    for k, v in filters.items():
        q = q.eq(k, v)
    return q.execute().data
