from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24  # 24 hours
    anthropic_api_key: str
    broker_encryption_key: str
    frontend_origins: str = "http://localhost:5173"
    allow_registration: bool = True

    class Config:
        env_file = ".env"


settings = Settings()
