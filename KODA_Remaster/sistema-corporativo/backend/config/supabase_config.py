import os
from pydantic_settings import BaseSettings
from pydantic import Field
from functools import lru_cache

class SupabaseSettings(BaseSettings):
    supabase_url: str = Field(default="", alias="SUPABASE_URL")
    supabase_key: str = Field(default="", alias="SUPABASE_ANON_KEY")
    supabase_service_role_key: str = Field(default="", alias="SUPABASE_SERVICE_ROLE_KEY")

    # DB Fields
    database_url: str = Field(default="", alias="DATABASE_URL")
    supabase_db_url_env: str = Field(default="", alias="SUPABASE_DB_URL")
    supabase_db_host: str = Field(default="", alias="SUPABASE_DB_HOST")
    supabase_db_port: int = Field(default=5432, alias="SUPABASE_DB_PORT")
    supabase_db_name: str = Field(default="", alias="SUPABASE_DB_NAME")
    supabase_db_user: str = Field(default="", alias="SUPABASE_DB_USER")
    supabase_db_password: str = Field(default="", alias="SUPABASE_DB_PASSWORD")

    @property
    def resolved_database_url(self) -> str:
        # Preferred: DATABASE_URL. Backward-compatible fallback: SUPABASE_DB_URL.
        if self.database_url:
            return self.database_url
        if self.supabase_db_url_env:
            return self.supabase_db_url_env
        if self.supabase_db_host and self.supabase_db_name and self.supabase_db_user:
            return (
                f"postgresql://{self.supabase_db_user}:{self.supabase_db_password}"
                f"@{self.supabase_db_host}:{self.supabase_db_port}/{self.supabase_db_name}"
            )
        return ""

    @property
    def supabase_db_url(self) -> str:
        # Kept for compatibility with existing imports/usages.
        return self.resolved_database_url

    class Config:
        env_file = "backend/.env" if os.path.exists("backend/.env") else ".env"
        extra = "ignore"

@lru_cache()
def get_supabase_settings():
    return SupabaseSettings()
