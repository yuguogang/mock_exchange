# Audit Report: demo_mix_trx_okx_binance

Generated at: 2026-01-28T15:02:46.818Z

## Segments
- **seg_C**: 2026-01-27 16:20 to 2026-01-27 16:23 (Priority: 210)
  - Target: okx TRX-USDT-SWAP
  - Ops: {"funding":[{"type":"scale","value":2},{"type":"clamp","min":-0.01,"max":0.01}],"price":[{"type":"target_spread_pct","value":-0.02}]}
- **default**: 2026-01-27 16:20 to 2026-01-27 16:23 (Priority: 210)
  - Target: okx TRX-USDT-SWAP
  - Ops: {"funding":[],"price":[]}
- **seg_close_17**: 2026-01-26 17:00 to 2026-01-26 18:00 (Priority: 110)
  - Target: okx TRX-USDT-SWAP
  - Ops: {"funding":[{"type":"scale","value":0}],"price":[{"type":"target_spread_pct","value":0}]}
- **seg_open_07**: 2026-01-26 07:00 to 2026-01-26 17:00 (Priority: 100)
  - Target: okx TRX-USDT-SWAP
  - Ops: {"funding":[],"price":[{"type":"target_spread_pct","value":0.02}]}
- **seg_funding_only**: 2026-01-26 16:05 to 2026-01-26 16:09 (Priority: 30)
  - Target: okx TRX-USDT-SWAP
  - Ops: {"funding":[{"type":"scale","value":5},{"type":"offset","value":0.0005}],"price":[]}
