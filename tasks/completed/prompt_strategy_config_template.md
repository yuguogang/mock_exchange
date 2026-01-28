名称
- strategy_name: funding_arbitrage_trx_demo
- strategy_type: funding_arbitrage
- hedge_ref: demo_hedge_trx_binance_okx
- enabled: true
- description: TRX 资金费率套利策略（两腿）

params
- funding:
  annualize_method: by_interval
  open_threshold_annualized_pct: 0.30
  close_threshold_annualized_pct: 0.10
  settle_directions:
    legA: receive_when_short_pay_when_long
    legB: receive_when_short_pay_when_long
  position_size_usdt: 100000
  approx_price: 0.15
  contract_size_override:
    legA: 1
    legB: 1000
  notes: 以 USDT 面值估算名义

- spread:
  open_threshold_pct: 0.0010
  close_threshold_pct: 0.0003
  stop_loss_pct: 0.0050
  take_profit_pct: 0.0070
  maker_taker_preference: taker
  slippage_pct: 0.0002

outputs
- generate_mock_files:
  trades:
    binance: service/replay-bot/mock_data/binance_trades.json
    okx: service/replay-bot/mock_data/okx_trades.json
  positions:
    binance: service/replay-bot/mock_data/binance_position.json
    okx: service/replay-bot/mock_data/okx_position.json
- inject_to_mock_server:
  orders: true
  income: true
  income_type: FUNDING_FEE
  metadata:
    strategy: funding_arbitrage_trx_demo
    hedge: demo_hedge_trx_binance_okx

audit
- include_params_snapshot: true
- log_path: service/replay-bot/logs/strategy_funding_trx.log
- emit_summary: true

validation
- verify_signal_binding: true
- check_orders_pairing: true
- check_income_presence: true
- tolerance:
  spread_calc_error_pct: 0.00001
  funding_annualized_delta_pct: 0.001
