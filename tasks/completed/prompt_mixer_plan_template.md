名称
- mixer_name: demo_mix_trx_okx_binance
- timezone: Asia/Shanghai
- description: 对 OKX 资金费与价差进行分段调整，并输出混合副本供复盘使用

legs
- exchange: binance
  symbol: TRXUSDT
- exchange: okx
  symbol: TRX-USDT-SWAP

alignment
- time_source: binance
- tolerance_ms: 30000

segments
- id: seg_A
  start_local: 2025-12-30 09:22
  end_local: 2026-01-10 18:00
  target:
    exchange: okx
    symbol: TRX-USDT-SWAP
    metrics: [funding, price]
  ops:
    funding:
      - scale: 1.3
      - offset: 0.0000
      - clamp:
          min: -0.005
          max: 0.005
    price:
      - target_spread_pct: 0.0015
      - noise:
          type: gaussian
          amplitude: 0.0005
          seed: 42
  priority: 10
  notes: 段 A 提升资金费并轻微抬升相对价差

- id: seg_B
  start_local: 2026-01-10 18:00
  end_local: 2026-01-13 00:00
  target:
    exchange: okx
    symbol: TRX-USDT-SWAP
    metrics: [funding, price]
  ops:
    funding:
      - scale: 1.5
      - clamp:
          min: -0.006
          max: 0.006
    price:
      - target_spread_pct: -0.0010
  priority: 20
  notes: 段 B 优先级更高，压低相对价差

outputs
- dir: data_mixed/demo_mix_trx_okx_binance
- files:
  - binance_TRXUSDT.json
  - binance_funding_TRXUSDT.json
  - okx_TRX-USDT-SWAP.json
  - okx_funding_TRX-USDT-SWAP.json

audit
- include_stats: true
- include_samples: true
- spread_target_tolerance_pct: 0.00001
