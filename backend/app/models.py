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
    last_notifications_seen_at = Column(DateTime, nullable=True)

    portfolios = relationship("Portfolio", back_populates="owner", cascade="all, delete-orphan")
    watchlists = relationship("Watchlist", back_populates="owner", cascade="all, delete-orphan")
    broker_connection = relationship("BrokerConnection", back_populates="user", uselist=False, cascade="all, delete-orphan")


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
    asset_type = Column(String, nullable=False, default="equity")  # equity | option
    option_type = Column(String, nullable=True)  # call | put
    strike_distance_pct = Column(Float, nullable=True)  # positive = OTM, negative = ITM
    dte_min = Column(Integer, nullable=True)
    dte_max = Column(Integer, nullable=True)
    take_profit_pct = Column(Float, nullable=True)
    stop_loss_pct = Column(Float, nullable=True)
    max_days_held = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    portfolio_id = Column(Integer, ForeignKey("portfolios.id"), nullable=False)

    portfolio = relationship("Portfolio", back_populates="strategies")
    backtest_results = relationship("BacktestResult", back_populates="strategy", cascade="all, delete-orphan")
    paper_trades = relationship("PaperTrade", back_populates="strategy", cascade="all, delete-orphan")
    broker_deployment = relationship("BrokerDeployment", back_populates="strategy", uselist=False, cascade="all, delete-orphan")


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


class BrokerConnection(Base):
    __tablename__ = "broker_connections"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True)
    broker = Column(String, nullable=False, default="alpaca")
    api_key_encrypted = Column(Text, nullable=False)
    api_secret_encrypted = Column(Text, nullable=False)
    is_paper = Column(Boolean, nullable=False, default=True)
    alpaca_account_id = Column(String, nullable=True)
    alpaca_account_number = Column(String, nullable=True)
    connected_at = Column(DateTime, default=datetime.utcnow)
    kill_switch_active = Column(Boolean, nullable=False, default=False)
    kill_switch_activated_at = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="broker_connection")


class BrokerDeployment(Base):
    __tablename__ = "broker_deployments"

    id = Column(Integer, primary_key=True, index=True)
    strategy_id = Column(Integer, ForeignKey("strategies.id"), nullable=False, unique=True)
    status = Column(String, nullable=False, default="active")  # active | stopped | error
    started_at = Column(Date, nullable=False)
    last_tick_at = Column(DateTime, nullable=True)
    last_error = Column(Text, nullable=True)
    consecutive_failures = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    strategy = relationship("Strategy", back_populates="broker_deployment")
    orders = relationship("BrokerOrder", back_populates="deployment", cascade="all, delete-orphan")
    events = relationship("BrokerEvent", back_populates="deployment", cascade="all, delete-orphan")


class BrokerOrder(Base):
    __tablename__ = "broker_orders"
    __table_args__ = (UniqueConstraint("deployment_id", "trade_date", "side", name="uq_broker_order_dedupe"),)

    id = Column(Integer, primary_key=True, index=True)
    deployment_id = Column(Integer, ForeignKey("broker_deployments.id"), nullable=False)
    alpaca_order_id = Column(String, nullable=True)
    side = Column(String, nullable=False)  # BUY | SELL
    qty = Column(Float, nullable=False)
    order_type = Column(String, nullable=False, default="market")
    status = Column(String, nullable=True)
    filled_qty = Column(Float, nullable=True)
    filled_avg_price = Column(Float, nullable=True)
    trade_date = Column(Date, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    contract_symbol = Column(String, nullable=True)
    strike = Column(Float, nullable=True)
    expiration = Column(Date, nullable=True)
    option_type = Column(String, nullable=True)  # call | put

    deployment = relationship("BrokerDeployment", back_populates="orders")


class BrokerEvent(Base):
    __tablename__ = "broker_events"

    id = Column(Integer, primary_key=True, index=True)
    deployment_id = Column(Integer, ForeignKey("broker_deployments.id"), nullable=False)
    date = Column(String, nullable=False)
    type = Column(String, nullable=False)
    message = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    deployment = relationship("BrokerDeployment", back_populates="events")


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
    benchmark_equity_curve = Column(JSON)
    benchmark_return_pct = Column(Float)
    trades = Column(JSON)
    events = Column(JSON)
    events_truncated = Column(Boolean, default=False)
    ai_explanation = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    strategy = relationship("Strategy", back_populates="backtest_results")
