const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

// Config
const DATE_STR = '2026-01-26';
const START_TS = new Date(`${DATE_STR} 00:00:00+08:00`).getTime();
const END_TS = new Date(`${DATE_STR} 23:59:59+08:00`).getTime();
const INTERVAL_MS = 60000; // 1 min

console.log(`Generating data for ${DATE_STR} (Asia/Shanghai)`);
console.log(`Start: ${START_TS} (${new Date(START_TS).toISOString()})`);
console.log(`End:   ${END_TS} (${new Date(END_TS).toISOString()})`);

// Base Prices
const BASE_PRICE = 0.1500;
const SPREAD_BASE = 0.0001; // Tiny natural spread

// 1. Generate Klines
function generateKlines(exchange) {
    const klines = [];
    let currentTs = START_TS;
    let price = BASE_PRICE;

    while (currentTs <= END_TS) {
        // Random walk
        const change = (Math.random() - 0.5) * 0.0002;
        price += change;
        
        // Add spread for OKX to make it slightly different
        let finalPrice = price;
        if (exchange === 'okx') {
            finalPrice += (Math.random() - 0.5) * 0.0001;
        }

        klines.push({
            ts: currentTs,
            price: parseFloat(finalPrice.toFixed(6))
        });
        currentTs += INTERVAL_MS;
    }
    return klines;
}

const binanceKlines = generateKlines('binance');
fs.writeFileSync(path.join(DATA_DIR, 'binance_TRXUSDT.json'), JSON.stringify(binanceKlines, null, 2));
console.log(`Generated ${binanceKlines.length} klines for Binance`);

const okxKlines = generateKlines('okx');
fs.writeFileSync(path.join(DATA_DIR, 'okx_TRX-USDT-SWAP.json'), JSON.stringify(okxKlines, null, 2));
console.log(`Generated ${okxKlines.length} klines for OKX`);

// 2. Generate Funding Rates (Every 8 hours: 00:00, 08:00, 16:00)
// 08:00 and 16:00 are critical for the user test case
function generateFunding() {
    const rates = [];
    let currentTs = START_TS;
    // Align to nearest 8h? No, just generate for 00, 08, 16
    // 00:00
    rates.push({ ts: START_TS, rate: 0.0001 });
    // 08:00
    rates.push({ ts: START_TS + 8 * 3600 * 1000, rate: 0.0001 });
    // 16:00
    rates.push({ ts: START_TS + 16 * 3600 * 1000, rate: 0.0001 });
    // Next 00:00 (end of day)
    rates.push({ ts: START_TS + 24 * 3600 * 1000, rate: 0.0001 });
    
    return rates;
}

const funding = generateFunding();
fs.writeFileSync(path.join(DATA_DIR, 'binance_funding_TRXUSDT.json'), JSON.stringify(funding, null, 2));
fs.writeFileSync(path.join(DATA_DIR, 'okx_funding_TRX-USDT-SWAP.json'), JSON.stringify(funding, null, 2));
console.log(`Generated ${funding.length} funding rates`);

console.log('Mock Data Generation Complete.');
