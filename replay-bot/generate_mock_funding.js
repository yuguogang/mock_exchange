const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const CONFIG_DIR = path.join(__dirname, 'config');

// Load configs
const binanceConfig = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, 'binance/rules_TRXUSDT.json'), 'utf8'));
const okxConfig = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, 'okx/rules_TRX-USDT-SWAP.json'), 'utf8'));

const SYMBOL_BINANCE = binanceConfig.symbol;
const SYMBOL_OKX = okxConfig.symbol;
const INTERVAL_BINANCE = binanceConfig.fundingIntervalHours; // e.g., 8
const INTERVAL_OKX = okxConfig.fundingIntervalHours;         // e.g., 4

console.log(`[Config] Binance Interval: ${INTERVAL_BINANCE}h, OKX Interval: ${INTERVAL_OKX}h`);

// Generate 30 days of data
const DAYS = 30;
const START_TIME = Date.now() - (DAYS * 24 * 60 * 60 * 1000);
// Round start time to nearest hour for cleaner timestamps
const BASE_TIME = Math.floor(START_TIME / 3600000) * 3600000;
const END_TIME = Date.now();

const binanceData = [];
const okxData = [];

// Helper to determine rate based on time (Mock Scenario Logic)
function getMockRate(ts, exchange) {
    // Relative day index (0-29)
    const dayIndex = (ts - BASE_TIME) / (24 * 60 * 60 * 1000);
    
    // Baseline: 0.01%
    let rate = 0.0001; 

    if (exchange === 'BINANCE') {
        // SCENARIO 1: Day 5-10, Binance spikes to 0.08%
        if (dayIndex >= 5 && dayIndex < 10) {
            rate = 0.0008;
        }
        // SCENARIO 2: Day 20-25, Binance drops to -0.05%
        if (dayIndex >= 20 && dayIndex < 25) {
            rate = -0.0005;
        }
    }
    
    // OKX stays stable in this mock (or could have smaller fluctuations)
    return rate;
}

// Generate Binance Data
for (let t = BASE_TIME; t <= END_TIME; t += INTERVAL_BINANCE * 3600 * 1000) {
    binanceData.push({
        ts: t,
        rate: getMockRate(t, 'BINANCE')
    });
}

// Generate OKX Data
for (let t = BASE_TIME; t <= END_TIME; t += INTERVAL_OKX * 3600 * 1000) {
    okxData.push({
        ts: t,
        rate: getMockRate(t, 'OKX')
    });
}

fs.writeFileSync(path.join(DATA_DIR, `binance_funding_${SYMBOL_BINANCE}.json`), JSON.stringify(binanceData, null, 2));
fs.writeFileSync(path.join(DATA_DIR, `okx_funding_${SYMBOL_OKX}.json`), JSON.stringify(okxData, null, 2));

console.log(`Generated mock funding data:
  Binance (${INTERVAL_BINANCE}h): ${binanceData.length} records
  OKX (${INTERVAL_OKX}h):     ${okxData.length} records`);