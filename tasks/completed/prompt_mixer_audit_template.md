summary
- mixer_name: demo_mix_trx_okx_binance
- created_at_utc: 2026-01-24T09:20:00Z
- timezone: Asia/Shanghai
- source_files:
  - data/binance_TRXUSDT.json
  - data/binance_funding_TRXUSDT.json
  - data/okx_TRX-USDT-SWAP.json
  - data/okx_funding_TRX-USDT-SWAP.json
- output_dir: data_mixed/demo_mix_trx_okx_binance
- legs:
  - binance TRXUSDT
  - okx TRX-USDT-SWAP

segment_stats
- segment_id: seg_A
  time_utc_start: 2025-12-30T01:22:00Z
  time_utc_end: 2026-01-10T10:00:00Z
  hits_funding: 145
  hits_price_pairs: 890
  funding_rate_stats:
    pre:
      mean: 0.00012
      min: -0.00080
      max: 0.00085
      std: 0.00020
    post:
      mean: 0.00016
      min: -0.00050
      max: 0.00050
      std: 0.00025
    clamp_hits: 12
  price_spread_stats:
    target_spread_pct: 0.0015
    hit_rate: 0.94
    error_mean_pct: 0.000002
    error_std_pct: 0.000009

- segment_id: seg_B
  time_utc_start: 2026-01-10T10:00:00Z
  time_utc_end: 2026-01-13T16:00:00Z
  hits_funding: 36
  hits_price_pairs: 240
  funding_rate_stats:
    pre:
      mean: 0.00010
      min: -0.00070
      max: 0.00080
      std: 0.00018
    post:
      mean: 0.00015
      min: -0.00060
      max: 0.00060
      std: 0.00022
    clamp_hits: 3
  price_spread_stats:
    target_spread_pct: -0.0010
    hit_rate: 0.91
    error_mean_pct: -0.000003
    error_std_pct: 0.000010

alignment
- time_source: binance
- tolerance_ms: 30000
- matched_pairs: 1130
- unmatched_binance_ticks: 52
- unmatched_okx_ticks: 41

samples
- pair_index: 120
  utc_time: 2026-01-01T03:00:00Z
  binance_price: 0.15260
  okx_price_pre: 0.15235
  okx_price_post: 0.15258
  spread_pct_post: 0.00150

- pair_index: 980
  utc_time: 2026-01-11T12:40:00Z
  binance_price: 0.15400
  okx_price_pre: 0.15390
  okx_price_post: 0.15385
  spread_pct_post: -0.00100

validation
- time_hits_ok: true
- funding_range_ok: true
- spread_target_ok: true
- incremental_ok: true
- notes: 所有段验证通过；建议在对齐误差较大的区间提高 tolerance_ms 或回退至最近有效点

logs
- path: logs/mixer/demo_mix_trx_okx_binance.log
- highlights:
  - seg_A funding clamp events: 12
  - seg_B spread target deviations > tolerance: 21
