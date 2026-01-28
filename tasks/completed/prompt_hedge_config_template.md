名称
- hedge_name: demo_hedge_trx_binance_okx
- enabled: true
- description: TRX 两腿对冲配置（Binance/OKX），含费率与合约参数
- timezone: Asia/Shanghai

legs
- role: legA
  exchange: binance
  symbol: TRXUSDT
  fee_profile:
    taker_fee_pct: 0.0004
    maker_fee_pct: 0.0002
  contract_profile:
    contract_size: 1
    leverage_default: 10
    quantity_precision: 0
    price_precision: 5
  notes: USDT-M 永续

- role: legB
  exchange: okx
  symbol: TRX-USDT-SWAP
  fee_profile:
    taker_fee_pct: 0.0005
    maker_fee_pct: 0.0003
  contract_profile:
    contract_size: 1000
    leverage_default: 10
    quantity_precision: 0
    price_precision: 5
  notes: USDT 结算 SWAP

alignment
- time_source: legA
- tolerance_ms: 30000
- interval_source: funding

signal
- spread_pct_thresholds:
  open: 0.0010
  close: 0.0003
- direction_rule: binance_more_expensive_short_binance_else_long_binance
- cooldown_ms: 60000
- filters:
  min_price: 0.01
  max_price: 10.0

execution
- order_size_usdt: 100000
- maker_taker_preference: taker
- slippage_model:
  type: fixed_pct
  value: 0.0002

outputs
- signals_file: signals/hedge_signals_TRX.json
- mock_data_dir: service/replay-bot/mock_data
- inject_to_mock_server: true

validation
- required_legs: [legA, legB]
- check_precision_consistency: true
- emit_alignment_stats: true
