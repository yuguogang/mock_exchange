# Signal Translator Service

The Signal Translator is a utility designed to convert neutral hedge signals and funding data from the `replay-bot` service into exchange-specific orders and income records compatible with the `mock-server`.

## Features

- **Multi-Exchange Support**: Translates signals for Binance (USDT-M Futures) and OKX (SWAP).
- **Advanced Funding Logic**:
  - Automatically ignores `SETTLE` signals from input files.
  - Generates independent settlement events for each exchange based on their specific 8-hour cycles.
  - Aligns settlements to standard UTC boundaries (00:00, 08:00, 16:00) using actual configuration timelines.
- **Real Market Data**: Integrates with `replay-bot` mixed data files to fetch precise historical funding rates.
- **Robust Execution**: Handles missing actions or prices by using configuration-defined fallback values (`approx_price`).
- **DDD Architecture**: Clean separation between configuration loading, exchange rules, and translation logic.

## Directory Structure

```text
signal-translator/
├── index.js              # Command-line entry point
├── config-loader.js      # Loads hedge, strategy, and exchange rule configs
├── translation-engine.js # Core translation and settlement generation logic
├── funding-rate-service.js # Fetches real funding rates from replay-bot data
├── funding-calculator.js # Math logic for fee calculation
├── exchange-rules/       # Exchange-specific formatting and mapping
│   ├── binance-rules.js
│   └── okx-rules.js
├── tests/               # Unit and integration tests
└── package.json         # Project dependencies
```

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Ensure `replay-bot` configurations and data are present in the sibling directory.

## Usage

Run the translator via CLI:

```bash
node index.js [hedge_config_name] [strategy_config_name] [signals_file_name]
```

Example:
```bash
node index.js demo_hedge_trx_binance_okx demo_strategy_funding_trx indexed_history_TRX.json
```

## Verified Exchanges

### Binance
- Symbol Mapping: Direct (e.g., `TRXUSDT`)
- Quantity: Base asset quantity.
- Settlement: 8-hour cycles.

### OKX
- Symbol Mapping: Maps to `-SWAP` (e.g., `TRX-USDT-SWAP`).
- Quantity: Contract count (e.g., `sz = base_qty / 1000`).
- Settlement: 8-hour cycles (aligned to specific start times).

## Testing

Run unit tests:
```bash
npm test
# or
node tests/translator.test.js
```
