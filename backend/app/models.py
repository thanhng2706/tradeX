from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Float, ForeignKey, JSON, Date, BigInteger, Text, UniqueConstraint, Boolean
from sqlalchemy.orm import relationship
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    portfolios = relationship("Portfolio", back_populates="owner", cascade="all, delete-orphan")
    watchlists = relationship("Watchlist", back_populates="owner", cascade="all, delete-orphan")


class Portfolio(Base):
    __tablename__ = "portfolios"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(String, default="")
    starting_balance = Column(Float, nullable=False, default=10000.0)
    created_at = Column(DateTime, default=datetime.utcnow)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    owner = relationship("User", back_populates="portfolios")
    strategies = relationship("Strategy", back_populates="portfolio", cascade="all, delete-orphan")


class Strategy(Base):
    __tablename__ = "strategies"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(String, default="")
    ticker = Column(String, nullable=False)
    buy_conditions = Column(JSON, nullable=False, default=lambda: {"logic": "AND", "rules": []})
    sell_conditions = Column(JSON, nullable=False, default=lambda: {"logic": "AND", "rules": []})
    position_size_pct = Column(Float, nullable=False, default=10.0)
    created_at = Column(DateTime, default=datetime.utcnow)
    portfolio_id = Column(Integer, ForeignKey("portfolios.id"), nullable=False)

    portfolio = relationship("Portfolio", back_populates="strategies")
    backtest_results = relationship("BacktestResult", back_populates="strategy", cascade="all, delete-orphan")
    paper_trades = relationship("PaperTrade", back_populates="strategy", cascade="all, delete-orphan")


class PriceData(Base):
    __tablename__ = "price_data"
    __table_args__ = (UniqueConstraint("ticker", "date", name="uq_price_data_ticker_date"),)

    id = Column(Integer, primary_key=True, index=True)
    ticker = Column(String, nullable=False, index=True)
    date = Column(Date, nullable=False)
    open = Column(Float)
    high = Column(Float)
    low = Column(Float)
    close = Column(Float)
    volume = Column(BigInteger)


class PaperTrade(Base):
    __tablename__ = "paper_trades"

    id = Column(Integer, primary_key=True, index=True)
    strategy_id = Column(Integer, ForeignKey("strategies.id"), nullable=False)
    started_at = Column(Date, nullable=False)
    status = Column(String, nullable=False, default="active")
    health_score = Column(Integer, nullable=True)
    health_report = Column(Text, nullable=True)
    health_checked_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    strategy = relationship("Strategy", back_populates="paper_trades")


class Watchlist(Base):
    __tablename__ = "watchlists"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    owner = relationship("User", back_populates="watchlists")
    assets = relationship("WatchlistAsset", back_populates="watchlist", cascade="all, delete-orphan")


class WatchlistAsset(Base):
    __tablename__ = "watchlist_assets"
    __table_args__ = (UniqueConstraint("watchlist_id", "symbol", name="uq_watchlist_asset"),)

    id = Column(Integer, primary_key=True, index=True)
    watchlist_id = Column(Integer, ForeignKey("watchlists.id"), nullable=False)
    symbol = Column(String, nullable=False)
    added_at = Column(DateTime, default=datetime.utcnow)

    watchlist = relationship("Watchlist", back_populates="assets")


class BacktestResult(Base):
    __tablename__ = "backtest_results"

    id = Column(Integer, primary_key=True, index=True)
    strategy_id = Column(Integer, ForeignKey("strategies.id"), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    starting_balance = Column(Float, nullable=False)
    final_balance = Column(Float)
    total_return_pct = Column(Float)
    annualized_return_pct = Column(Float)
    sharpe_ratio = Column(Float)
    max_drawdown_pct = Column(Float)
    win_rate = Column(Float)
    num_trades = Column(Integer)
    equity_curve = Column(JSON)
    trades = Column(JSON)
    events = Column(JSON)
    events_truncated = Column(Boolean, default=False)
    ai_explanation = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    strategy = relationship("Strategy", back_populates="backtest_results")
