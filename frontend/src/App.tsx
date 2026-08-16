import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import Layout from './components/Layout'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import PortfoliosPage from './pages/PortfoliosPage'
import StrategyList from './pages/StrategyList'
import StrategyBuilder from './pages/StrategyBuilder'
import BacktestPage from './pages/BacktestPage'
import OptimizerPage from './pages/OptimizerPage'
import PaperTradingPage from './pages/PaperTradingPage'
import LibraryPage from './pages/LibraryPage'
import ChatPage from './pages/ChatPage'
import ResearchPage from './pages/ResearchPage'
import StockPage from './pages/StockPage'
import BrokerPage from './pages/BrokerPage'
import BrokerDeployPage from './pages/BrokerDeployPage'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token)
  if (!token) return <Navigate to="/login" replace />
  return <Layout>{children}</Layout>
}

function PrivateBare({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token)
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
        <Route path="/portfolios" element={<PrivateRoute><PortfoliosPage /></PrivateRoute>} />
        <Route path="/portfolios/:portfolioId" element={<PrivateRoute><StrategyList /></PrivateRoute>} />
        <Route path="/portfolios/:portfolioId/strategies/new" element={<PrivateRoute><StrategyBuilder /></PrivateRoute>} />
        <Route path="/portfolios/:portfolioId/strategies/:strategyId/edit" element={<PrivateRoute><StrategyBuilder /></PrivateRoute>} />
        <Route path="/portfolios/:portfolioId/strategies/:strategyId/backtest" element={<PrivateRoute><BacktestPage /></PrivateRoute>} />
        <Route path="/portfolios/:portfolioId/strategies/:strategyId/optimize" element={<PrivateRoute><OptimizerPage /></PrivateRoute>} />
        <Route path="/portfolios/:portfolioId/strategies/:strategyId/paper" element={<PrivateRoute><PaperTradingPage /></PrivateRoute>} />
        <Route path="/portfolios/:portfolioId/strategies/:strategyId/broker-deploy" element={<PrivateRoute><BrokerDeployPage /></PrivateRoute>} />
        <Route path="/library" element={<PrivateRoute><LibraryPage /></PrivateRoute>} />
        <Route path="/watchlists" element={<Navigate to="/research?tab=watchlists" replace />} />
        <Route path="/research" element={<PrivateRoute><ResearchPage /></PrivateRoute>} />
        <Route path="/research/screener" element={<Navigate to="/research?tab=screener" replace />} />
        <Route path="/research/deep-dive" element={<Navigate to="/research?tab=deepdive" replace />} />
        <Route path="/stock/:symbol" element={<PrivateRoute><StockPage /></PrivateRoute>} />
        <Route path="/chat" element={<PrivateRoute><ChatPage /></PrivateRoute>} />
        <Route path="/broker" element={<PrivateRoute><BrokerPage /></PrivateRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
