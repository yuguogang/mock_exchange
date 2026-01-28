const https = require('https');
const fs = require('fs');
const path = require('path');

// Usage: node fetch_rules.js [binance|okx] [symbol]
const EXCHANGE = (process.argv[2] || 'binance').toLowerCase();
const SYMBOL = (process.argv[3] || (EXCHANGE === 'binance' ? 'TRXUSDT' : 'TRX-USDT-SWAP')).toUpperCase();

const CONFIG_DIR = path.join(__dirname, 'config', EXCHANGE);
if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0'
            },
            timeout: 10000
        };
        https.get(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    if (res.statusCode !== 200) {
                        reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
                        return;
                    }
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error(`Failed to parse JSON from ${url}: ${e.message}`));
                }
            });
        }).on('error', (err) => reject(err));
    });
}

// --- Binance Logic ---
async function fetchBinanceInfo() {
    const url = `https://fapi.binance.com/fapi/v1/exchangeInfo`;
    console.log(`[Binance] Fetching exchangeInfo for ${SYMBOL}...`);
    const info = await fetchJSON(url);
    const symbolInfo = info.symbols.find(s => s.symbol === SYMBOL);
    if (!symbolInfo) throw new Error(`Symbol ${SYMBOL} not found on Binance`);

    const rules = {
        exchange: 'binance',
        symbol: SYMBOL,
        contractSize: 1, // Default for USDT-M Futures
        fundingIntervalHours: 8, // Default
        pricePrecision: symbolInfo.pricePrecision,
        quantityPrecision: symbolInfo.quantityPrecision,
        filters: symbolInfo.filters
    };
    fs.writeFileSync(path.join(CONFIG_DIR, `rules_${SYMBOL}.json`), JSON.stringify(rules, null, 2));
    console.log(`Saved: config/${EXCHANGE}/rules_${SYMBOL}.json`);
}

async function fetchBinanceFunding() {
    const url = `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${SYMBOL}&limit=1000`;
    console.log(`[Binance] Fetching funding history for ${SYMBOL}...`);
    const history = await fetchJSON(url);
    const timeline = [];
    let currentInterval = null;

    for (let i = 1; i < history.length; i++) {
        const diffMs = history[i].fundingTime - history[i - 1].fundingTime;
        const diffHours = Math.round(diffMs / (3600 * 1000));
        if (diffHours !== currentInterval) {
            timeline.push({ startTime: history[i - 1].fundingTime, intervalHours: diffHours });
            currentInterval = diffHours;
        }
    }
    fs.writeFileSync(path.join(CONFIG_DIR, `funding_timeline_${SYMBOL}.json`), JSON.stringify(timeline, null, 2));
    console.log(`Saved: config/${EXCHANGE}/funding_timeline_${SYMBOL}.json`);
}

// --- OKX Logic ---
async function fetchOkxInfo() {
    const url = `https://www.okx.com/api/v5/public/instruments?instType=SWAP&instId=${SYMBOL}`;
    console.log(`[OKX] Fetching instrument info for ${SYMBOL}...`);
    const res = await fetchJSON(url);
    if (res.code !== '0' || !res.data || res.data.length === 0) {
        throw new Error(`Symbol ${SYMBOL} not found on OKX: ${res.msg || 'Unknown error'}`);
    }
    const d = res.data[0];
    const rules = {
        exchange: 'okx',
        symbol: SYMBOL,
        pricePrecision: -Math.log10(parseFloat(d.tickSz)),
        quantityPrecision: -Math.log10(parseFloat(d.lotSz)),
        tickSize: d.tickSz,
        lotSize: d.lotSz,
        minSize: d.minSz,
        ctVal: d.ctVal,
        settleCcy: d.settleCcy
    };
    fs.writeFileSync(path.join(CONFIG_DIR, `rules_${SYMBOL}.json`), JSON.stringify(rules, null, 2));
    console.log(`Saved: config/${EXCHANGE}/rules_${SYMBOL}.json`);
}

async function fetchOkxFunding() {
    const url = `https://www.okx.com/api/v5/public/funding-rate-history?instId=${SYMBOL}`;
    console.log(`[OKX] Fetching funding history for ${SYMBOL}...`);
    const res = await fetchJSON(url);
    if (res.code !== '0' || !res.data) throw new Error(`Failed to fetch OKX funding: ${res.msg}`);

    // OKX returns newest first, reverse it for interval detection
    const data = res.data.reverse();
    const timeline = [];
    let currentInterval = null;

    for (let i = 1; i < data.length; i++) {
        const diffMs = parseInt(data[i].fundingTime) - parseInt(data[i - 1].fundingTime);
        const diffHours = Math.round(diffMs / (3600 * 1000));
        if (diffHours !== currentInterval && diffHours > 0) {
            timeline.push({ startTime: parseInt(data[i - 1].fundingTime), intervalHours: diffHours });
            currentInterval = diffHours;
        }
    }
    fs.writeFileSync(path.join(CONFIG_DIR, `funding_timeline_${SYMBOL}.json`), JSON.stringify(timeline, null, 2));
    console.log(`Saved: config/${EXCHANGE}/funding_timeline_${SYMBOL}.json`);
}

async function main() {
    try {
        if (EXCHANGE === 'binance') {
            await fetchBinanceInfo();
            await fetchBinanceFunding();
        } else if (EXCHANGE === 'okx') {
            await fetchOkxInfo();
            await fetchOkxFunding();
        } else {
            console.error('Unsupported exchange. Use "binance" or "okx".');
        }
    } catch (e) {
        console.error(`Execution failed:`, e.message);
        process.exit(1);
    }
}

main();
