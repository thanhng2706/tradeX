from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.auth.router import router as auth_router
from app.portfolios.router import router as portfolios_router
from app.strategies.router import router as strategies_router
from app.backtesting.router import router as backtesting_router
from app.optimizer.router import router as optimizer_router
from app.paper_trading.router import router as paper_trading_router
from app.library.router import router as library_router
from app.chat.router import router as chat_router
from app.watchlist.router import router as watchlist_router
from app.market.router import router as market_router
from app.research.router import router as research_router

app = FastAPI(title="Tradex API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(portfolios_router)
app.include_router(strategies_router)
app.include_router(backtesting_router)
app.include_router(optimizer_router)
app.include_router(paper_trading_router)
app.include_router(library_router)
app.include_router(chat_router)
app.include_router(watchlist_router)
app.include_router(market_router)
app.include_router(research_router)


@app.get("/health")
def health():
    return {"status": "ok"}
