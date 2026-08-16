import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { strategiesApi, Rule, ConditionSet, AssetType, OptionType } from '../api/strategies'
import api from '../api/client'

// ── Indicator metadata ────────────────────────────────────────────────────────

type ParamDef = { key: string; label: string; default: number; step?: number; min?: number }
type IndicatorMeta = { label: string; params: ParamDef[]; category: string }

const INDICATOR_META: Record<string, IndicatorMeta> = {
  RSI:         { label: 'RSI',              category: 'Momentum',    params: [{ key: 'period',  label: 'Period', default: 14, min: 2 }] },
  MACD_LINE:   { label: 'MACD Line',        category: 'Momentum',    params: [{ key: 'fast', label: 'Fast', default: 12 }, { key: 'slow', label: 'Slow', default: 26 }, { key: 'signal', label: 'Sig', default: 9 }] },
  MACD_SIGNAL: { label: 'MACD Signal',      category: 'Momentum',    params: [{ key: 'fast', label: 'Fast', default: 12 }, { key: 'slow', label: 'Slow', default: 26 }, { key: 'signal', label: 'Sig', default: 9 }] },
  MACD_HIST:   { label: 'MACD Histogram',   category: 'Momentum',    params: [{ key: 'fast', label: 'Fast', default: 12 }, { key: 'slow', label: 'Slow', default: 26 }, { key: 'signal', label: 'Sig', default: 9 }] },
  ROC:         { label: 'ROC %',            category: 'Momentum',    params: [{ key: 'period',  label: 'Period', default: 10, min: 1 }] },
  SMA:         { label: 'SMA',              category: 'Trend',       params: [{ key: 'period',  label: 'Period', default: 20, min: 2 }] },
  EMA:         { label: 'EMA',              category: 'Trend',       params: [{ key: 'period',  label: 'Period', default: 20, min: 2 }] },
  BB_UPPER:    { label: 'BB Upper Band',    category: 'Volatility',  params: [{ key: 'period',  label: 'Period', default: 20 }, { key: 'std_dev', label: 'Std', default: 2, step: 0.5, min: 0.5 }] },
  BB_LOWER:    { label: 'BB Lower Band',    category: 'Volatility',  params: [{ key: 'period',  label: 'Period', default: 20 }, { key: 'std_dev', label: 'Std', default: 2, step: 0.5, min: 0.5 }] },
  BB_MID:      { label: 'BB Middle (SMA)',  category: 'Volatility',  params: [{ key: 'period',  label: 'Period', default: 20 }, { key: 'std_dev', label: 'Std', default: 2, step: 0.5, min: 0.5 }] },
  ATR:         { label: 'ATR',              category: 'Volatility',  params: [{ key: 'period',  label: 'Period', default: 14, min: 1 }] },
  PRICE:       { label: 'Price',            category: 'Price/Vol',   params: [] },
  VOLUME:      { label: 'Volume',           category: 'Price/Vol',   params: [] },
  ML_SIGNAL:   { label: 'ML Signal (prob. up in 5d)', category: 'Machine Learning', params: [] },
}

const OPERATORS = [
  { value: '<',            label: 'less than (<)' },
  { value: '>',            label: 'greater than (>)' },
  { value: '<=',           label: 'less than or equal (≤)' },
  { value: '>=',           label: 'greater than or equal (≥)' },
  { value: 'crosses_above', label: 'crosses above ↗' },
  { value: 'crosses_below', label: 'crosses below ↘' },
]

function defaultParams(indicator: string): Record<string, number> {
  const meta = INDICATOR_META[indicator]
  if (!meta) return {}
  return Object.fromEntries(meta.params.map((p) => [p.key, p.default]))
}

function defaultRightIndicator(leftInd: string): { indicator: string; params: Record<string, number> } {
  if (leftInd === 'MACD_LINE') return { indicator: 'MACD_SIGNAL', params: defaultParams('MACD_SIGNAL') }
  if (leftInd === 'SMA' || leftInd === 'BB_MID') return { indicator: 'SMA', params: { period: 200 } }
  if (leftInd === 'EMA') return { indicator: 'EMA', params: { period: 200 } }
  if (leftInd === 'PRICE') return { indicator: 'SMA', params: defaultParams('SMA') }
  return { indicator: 'PRICE', params: {} }
}

function defaultRule(): Rule {
  return { indicator: 'RSI', params: { period: 14 }, operator: '<', value: 30 }
}

function emptyConditionSet(): ConditionSet {
  return { logic: 'AND', rules: [] }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function IndicatorSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const categories = [...new Set(Object.values(INDICATOR_META).map((m) => m.category))]
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-gray-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
    >
      {categories.map((cat) => (
        <optgroup key={cat} label={cat}>
          {Object.entries(INDICATOR_META)
            .filter(([, m]) => m.category === cat)
            .map(([k, m]) => (
              <option key={k} value={k}>{m.label}</option>
            ))}
        </optgroup>
      ))}
    </select>
  )
}

function ParamsInput({
  indicator,
  params,
  onChange,
}: {
  indicator: string
  params: Record<string, number>
  onChange: (p: Record<string, number>) => void
}) {
  const meta = INDICATOR_META[indicator]
  if (!meta || meta.params.length === 0) return null
  return (
    <>
      {meta.params.map((p) => (
        <div key={p.key} className="flex items-center gap-1">
          <span className="text-gray-500 text-xs whitespace-nowrap">{p.label}</span>
          <input
            type="number"
            value={params[p.key] ?? p.default}
            onChange={(e) => onChange({ ...params, [p.key]: Number(e.target.value) })}
            step={p.step ?? 1}
            min={p.min ?? 1}
            className="w-14 bg-gray-800 text-white rounded-lg px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      ))}
    </>
  )
}

type MLInfo = { trained: boolean; accuracy?: number; roc_auc?: number; universe_size?: number; trained_at?: string }
let mlInfoCache: MLInfo | null = null

function MLInfoLine() {
  const [info, setInfo] = useState<MLInfo | null>(mlInfoCache)

  useEffect(() => {
    if (mlInfoCache) return
    api.get<MLInfo>('/ml/info').then((r) => {
      mlInfoCache = r.data
      setInfo(r.data)
    }).catch(() => {})
  }, [])

  if (!info) return null
  return (
    <p className="text-xs text-gray-600 basis-full">
      {info.trained
        ? `Model held-out accuracy ${((info.accuracy ?? 0) * 100).toFixed(1)}% · AUC ${(info.roc_auc ?? 0).toFixed(2)} · trained on ${info.universe_size} tickers (${info.trained_at})`
        : 'Model not trained yet — ML_SIGNAL will evaluate to NaN (rule never fires) until training runs.'}
    </p>
  )
}

function RuleRow({ rule, onChange, onDelete }: { rule: Rule; onChange: (r: Rule) => void; onDelete: () => void }) {
  const rightMode: 'value' | 'indicator' = rule.right_indicator ? 'indicator' : 'value'

  function setLeftIndicator(ind: string) {
    onChange({ ...rule, indicator: ind, params: defaultParams(ind) })
  }

  function setOperator(op: string) {
    const isCross = op === 'crosses_above' || op === 'crosses_below'
    if (isCross && !rule.right_indicator) {
      const { indicator: ri, params: rp } = defaultRightIndicator(rule.indicator)
      onChange({ ...rule, operator: op, value: null, right_indicator: ri, right_params: rp })
    } else {
      onChange({ ...rule, operator: op })
    }
  }

  function setRightMode(mode: 'value' | 'indicator') {
    if (mode === 'indicator') {
      const { indicator: ri, params: rp } = defaultRightIndicator(rule.indicator)
      onChange({ ...rule, value: null, right_indicator: ri, right_params: rp })
    } else {
      onChange({ ...rule, value: 0, right_indicator: null, right_params: null })
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Left side */}
      <IndicatorSelect value={rule.indicator} onChange={setLeftIndicator} />
      <ParamsInput
        indicator={rule.indicator}
        params={rule.params}
        onChange={(p) => onChange({ ...rule, params: p })}
      />

      {/* Operator */}
      <select
        value={rule.operator}
        onChange={(e) => setOperator(e.target.value)}
        className="bg-gray-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
      >
        {OPERATORS.map((op) => (
          <option key={op.value} value={op.value}>{op.label}</option>
        ))}
      </select>

      {/* Right mode toggle */}
      <div className="flex rounded-lg overflow-hidden border border-gray-700/60 shrink-0">
        {(['value', 'indicator'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setRightMode(m)}
            className={`px-2.5 py-2 text-xs capitalize transition-colors ${
              rightMode === m ? 'bg-gray-700 text-white' : 'bg-gray-800 text-gray-500 hover:text-gray-300'
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Right side content */}
      {rightMode === 'value' ? (
        <input
          type="number"
          value={rule.value ?? ''}
          onChange={(e) => onChange({ ...rule, value: Number(e.target.value) })}
          placeholder="value"
          className="w-24 bg-gray-800 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        />
      ) : (
        <>
          <IndicatorSelect
            value={rule.right_indicator ?? 'PRICE'}
            onChange={(ri) => onChange({ ...rule, right_indicator: ri, right_params: defaultParams(ri) })}
          />
          <ParamsInput
            indicator={rule.right_indicator ?? 'PRICE'}
            params={rule.right_params ?? {}}
            onChange={(rp) => onChange({ ...rule, right_params: rp })}
          />
        </>
      )}

      <button
        onClick={onDelete}
        className="text-gray-600 hover:text-red-400 text-lg leading-none transition-colors ml-1"
      >
        ✕
      </button>

      {(rule.indicator === 'ML_SIGNAL' || rule.right_indicator === 'ML_SIGNAL') && <MLInfoLine />}
    </div>
  )
}

function ConditionBuilder({
  label,
  value,
  onChange,
}: {
  label: string
  value: ConditionSet
  onChange: (cs: ConditionSet) => void
}) {
  function addRule() {
    onChange({ ...value, rules: [...value.rules, defaultRule()] })
  }
  function updateRule(i: number, rule: Rule) {
    const rules = [...value.rules]
    rules[i] = rule
    onChange({ ...value, rules })
  }
  function deleteRule(i: number) {
    onChange({ ...value, rules: value.rules.filter((_, idx) => idx !== i) })
  }

  return (
    <div className="bg-gray-900 rounded-xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-sm text-gray-300">{label}</h3>
        <div className="flex items-center gap-2">
          <span className="text-gray-500 text-xs">Logic:</span>
          {(['AND', 'OR'] as const).map((l) => (
            <button
              key={l}
              onClick={() => onChange({ ...value, logic: l })}
              className={`text-xs px-2 py-1 rounded transition-colors ${
                value.logic === l ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {value.rules.length === 0 && (
        <p className="text-gray-600 text-sm">No rules yet.</p>
      )}

      <div className="space-y-3">
        {value.rules.map((rule, i) => (
          <div key={i} className="flex items-start gap-2">
            {i > 0 ? (
              <span className="text-xs text-gray-500 w-6 text-right shrink-0 mt-2.5">{value.logic}</span>
            ) : (
              <span className="w-6 shrink-0" />
            )}
            <RuleRow
              rule={rule}
              onChange={(r) => updateRule(i, r)}
              onDelete={() => deleteRule(i)}
            />
          </div>
        ))}
      </div>

      <button
        onClick={addRule}
        className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
      >
        + Add Rule
      </button>
    </div>
  )
}

function OptionLegPanel({
  optionType, setOptionType,
  strikeDistance, setStrikeDistance,
  dteMin, setDteMin,
  dteMax, setDteMax,
  takeProfit, setTakeProfit,
  stopLoss, setStopLoss,
  maxDaysHeld, setMaxDaysHeld,
}: {
  optionType: OptionType; setOptionType: (v: OptionType) => void
  strikeDistance: string; setStrikeDistance: (v: string) => void
  dteMin: string; setDteMin: (v: string) => void
  dteMax: string; setDteMax: (v: string) => void
  takeProfit: string; setTakeProfit: (v: string) => void
  stopLoss: string; setStopLoss: (v: string) => void
  maxDaysHeld: string; setMaxDaysHeld: (v: string) => void
}) {
  return (
    <div className="bg-gray-900 rounded-xl p-5 space-y-4 border border-purple-900/60">
      <h3 className="font-medium text-sm text-gray-300">Option Leg</h3>
      <p className="text-xs text-gray-500 -mt-2">
        Buy/sell conditions above still control WHEN to open/close — this configures WHAT gets traded.
      </p>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Option Type</label>
          <div className="flex rounded-lg overflow-hidden border border-gray-700/60 w-fit">
            {(['call', 'put'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setOptionType(t)}
                className={`px-4 py-2 text-sm capitalize transition-colors ${
                  optionType === t ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Strike Distance % (OTM, negative = ITM)</label>
          <input
            type="number"
            value={strikeDistance}
            onChange={(e) => setStrikeDistance(e.target.value)}
            step={0.5}
            placeholder="5"
            className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1">DTE Min</label>
          <input
            type="number"
            value={dteMin}
            onChange={(e) => setDteMin(e.target.value)}
            min={1}
            placeholder="30"
            className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">DTE Max</label>
          <input
            type="number"
            value={dteMax}
            onChange={(e) => setDteMax(e.target.value)}
            min={1}
            placeholder="45"
            className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Take Profit % (optional)</label>
          <input
            type="number"
            value={takeProfit}
            onChange={(e) => setTakeProfit(e.target.value)}
            placeholder="50"
            className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Stop Loss % (optional)</label>
          <input
            type="number"
            value={stopLoss}
            onChange={(e) => setStopLoss(e.target.value)}
            placeholder="30"
            className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Max Days Held (optional)</label>
          <input
            type="number"
            value={maxDaysHeld}
            onChange={(e) => setMaxDaysHeld(e.target.value)}
            min={1}
            placeholder="20"
            className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
      </div>

      <p className="text-xs text-gray-600">
        Backtests for options use simulated pricing (Black-Scholes + historical volatility), not real historical option quotes —
        Tradex has no historical options-chain data source yet.
      </p>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function StrategyBuilder() {
  const { portfolioId, strategyId } = useParams<{ portfolioId: string; strategyId?: string }>()
  const navigate = useNavigate()
  const isEditing = !!strategyId

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [ticker, setTicker] = useState('')
  const [positionSize, setPositionSize] = useState('10')
  const [buyConditions, setBuyConditions] = useState<ConditionSet>(emptyConditionSet())
  const [sellConditions, setSellConditions] = useState<ConditionSet>(emptyConditionSet())
  const [assetType, setAssetType] = useState<AssetType>('equity')
  const [optionType, setOptionType] = useState<OptionType>('call')
  const [strikeDistance, setStrikeDistance] = useState('5')
  const [dteMin, setDteMin] = useState('30')
  const [dteMax, setDteMax] = useState('45')
  const [takeProfit, setTakeProfit] = useState('')
  const [stopLoss, setStopLoss] = useState('')
  const [maxDaysHeld, setMaxDaysHeld] = useState('')
  const [nlText, setNlText] = useState('')
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isEditing) {
      strategiesApi.list(Number(portfolioId)).then((strategies) => {
        const s = strategies.find((s) => s.id === Number(strategyId))
        if (s) {
          setName(s.name)
          setDescription(s.description)
          setTicker(s.ticker)
          setPositionSize(String(s.position_size_pct))
          setBuyConditions(s.buy_conditions)
          setSellConditions(s.sell_conditions)
          setAssetType(s.asset_type)
          if (s.option_type) setOptionType(s.option_type)
          if (s.strike_distance_pct != null) setStrikeDistance(String(s.strike_distance_pct))
          if (s.dte_min != null) setDteMin(String(s.dte_min))
          if (s.dte_max != null) setDteMax(String(s.dte_max))
          if (s.take_profit_pct != null) setTakeProfit(String(s.take_profit_pct))
          if (s.stop_loss_pct != null) setStopLoss(String(s.stop_loss_pct))
          if (s.max_days_held != null) setMaxDaysHeld(String(s.max_days_held))
        }
      })
    }
  }, [isEditing, portfolioId, strategyId])

  async function handleParseNL() {
    if (!nlText.trim()) return
    setParsing(true)
    try {
      const result = await strategiesApi.parseNL(nlText)
      if (result.name) setName(result.name)
      if (result.ticker) setTicker(result.ticker)
      setBuyConditions(result.buy_conditions)
      setSellConditions(result.sell_conditions)
    } finally {
      setParsing(false)
    }
  }

  async function handleSave() {
    if (!name || !ticker) return
    setSaving(true)
    setError('')
    try {
      const payload = {
        name,
        description,
        ticker: ticker.toUpperCase(),
        buy_conditions: buyConditions,
        sell_conditions: sellConditions,
        position_size_pct: parseFloat(positionSize),
        asset_type: assetType,
        option_type: assetType === 'option' ? optionType : null,
        strike_distance_pct: assetType === 'option' ? parseFloat(strikeDistance) : null,
        dte_min: assetType === 'option' ? parseInt(dteMin, 10) : null,
        dte_max: assetType === 'option' ? parseInt(dteMax, 10) : null,
        take_profit_pct: assetType === 'option' && takeProfit ? parseFloat(takeProfit) : null,
        stop_loss_pct: assetType === 'option' && stopLoss ? parseFloat(stopLoss) : null,
        max_days_held: assetType === 'option' && maxDaysHeld ? parseInt(maxDaysHeld, 10) : null,
      }
      if (isEditing) {
        await strategiesApi.update(Number(strategyId), payload)
      } else {
        await strategiesApi.create(Number(portfolioId), payload)
      }
      navigate(`/portfolios/${portfolioId}`)
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to save strategy')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
          <button onClick={() => navigate(`/portfolios/${portfolioId}`)} className="hover:text-gray-300 transition-colors">
            ← Strategies
          </button>
          <span className="text-gray-700">/</span>
          <span className="text-gray-300">{isEditing ? 'Edit Strategy' : 'New Strategy'}</span>
        </div>
        <h1 className="text-2xl font-bold mb-8">{isEditing ? 'Edit Strategy' : 'New Strategy'}</h1>
      </div>

      <main className="max-w-3xl mx-auto px-6 pb-10 space-y-6">
        {/* AI builder */}
        <div className="bg-gray-900 rounded-xl p-5 space-y-3 border border-blue-900">
          <div className="flex items-center gap-2">
            <span className="text-blue-400 text-sm font-medium">AI Strategy Builder</span>
            <span className="text-gray-600 text-xs">— describe your strategy in plain English</span>
          </div>
          <textarea
            value={nlText}
            onChange={(e) => setNlText(e.target.value)}
            placeholder='e.g. "Buy SPY when RSI drops below 30. Sell when RSI goes above 70."'
            rows={3}
            className="w-full bg-gray-800 text-white rounded-lg px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none placeholder-gray-600"
          />
          <button
            onClick={handleParseNL}
            disabled={parsing || !nlText.trim()}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {parsing ? 'Parsing...' : 'Parse with AI'}
          </button>
        </div>

        {/* Basic info */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Asset Type</label>
            <div className="flex rounded-lg overflow-hidden border border-gray-700/60 w-fit">
              {(['equity', 'option'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setAssetType(t)}
                  className={`px-4 py-2 text-sm capitalize transition-colors ${
                    assetType === t ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Strategy Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="RSI Reversal"
                className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Ticker</label>
              <input
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                required
                placeholder="SPY"
                className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Description (optional)</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Short description"
                className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Position Size (%)</label>
              <input
                type="number"
                value={positionSize}
                onChange={(e) => setPositionSize(e.target.value)}
                min={1}
                max={100}
                className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Option leg config */}
        {assetType === 'option' && (
          <OptionLegPanel
            optionType={optionType} setOptionType={setOptionType}
            strikeDistance={strikeDistance} setStrikeDistance={setStrikeDistance}
            dteMin={dteMin} setDteMin={setDteMin}
            dteMax={dteMax} setDteMax={setDteMax}
            takeProfit={takeProfit} setTakeProfit={setTakeProfit}
            stopLoss={stopLoss} setStopLoss={setStopLoss}
            maxDaysHeld={maxDaysHeld} setMaxDaysHeld={setMaxDaysHeld}
          />
        )}

        {/* Condition builders */}
        <ConditionBuilder label="Buy Conditions" value={buyConditions} onChange={setBuyConditions} />
        <ConditionBuilder label="Sell Conditions" value={sellConditions} onChange={setSellConditions} />

        {/* Indicator reference */}
        <div className="bg-gray-900/50 border border-gray-800/60 rounded-xl p-4 text-xs text-gray-500 space-y-1.5">
          <p className="text-gray-400 font-medium text-xs mb-2">Quick Reference</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1">
            <span><span className="text-gray-300">RSI &lt; 30</span> — oversold buy signal</span>
            <span><span className="text-gray-300">MACD Histogram &gt; 0</span> — bullish momentum</span>
            <span><span className="text-gray-300">PRICE &lt; BB Lower</span> — price below lower band</span>
            <span><span className="text-gray-300">SMA(50) crosses above SMA(200)</span> — Golden Cross</span>
            <span><span className="text-gray-300">RSI &gt; 70</span> — overbought sell signal</span>
            <span><span className="text-gray-300">MACD Line crosses above MACD Signal</span> — buy crossover</span>
          </div>
        </div>

        {error && <p className="text-red-400 text-sm text-center">{error}</p>}

        <button
          onClick={handleSave}
          disabled={saving || !name || !ticker}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors"
        >
          {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Strategy'}
        </button>
      </main>
    </div>
  )
}
