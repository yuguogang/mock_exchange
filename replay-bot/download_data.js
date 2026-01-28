const https = require('https');
const fs = require('fs');
const path = require('path');

// --- Configuration ---
const args = process.argv.slice(2);
const configArg = args.find(a => a.startsWith('--config='));
// Default to the TRX hedge config if not provided, for convenience
const DEFAULT_CONFIG_PATH = path.join(__dirname, 'config/hedge/demo_hedge_trx_binance_okx.json');
const CONFIG_PATH = configArg ? path.join(__dirname, configArg.split('=')[1]) : DEFAULT_CONFIG_PATH;

if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`Config file not found: ${CONFIG_PATH}`);
    process.exit(1);
}

const hedgeConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
console.log(`[Download] Using Hedge Config: ${CONFIG_PATH}`);

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

// --- Helper Functions ---

function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        const options = { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 };
        https.get(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error(`Invalid JSON: ${e.message}`));
                }
            });
        }).on('error', reject);
    });
}

function loadExistingData(filepath) {
    if (fs.existsSync(filepath)) {
        try {
            const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
            if (Array.isArray(data) && data.length > 0) {
                // Return last timestamp
                return { data, lastTs: data[data.length - 1].ts };
            }
        } catch (e) {
            console.warn(`[Warn] Failed to read existing file ${filepath}: ${e.message}`);
        }
    }
    return { data: [], lastTs: 0 };
}

function saveData(filepath, oldData, newData) {
    // Merge and Deduplicate based on TS
    const merged = [...oldData, ...newData];
    // Simple dedupe
    const seen = new Set();
    const unique = [];
    for (const item of merged) {
        if (!seen.has(item.ts)) {
            seen.add(item.ts);
            unique.push(item);
        }
    }
    // Sort
    unique.sort((a, b) => a.ts - b.ts);
    
    fs.writeFileSync(filepath, JSON.stringify(unique, null, 2));
    console.log(`Saved ${unique.length} records to ${path.basename(filepath)} (+${newData.length} new)`);
}

// --- Exchange Downloaders ---

async function downloadBinanceKlines(symbol, lastTs) {
    console.log(`[Binance] Downloading klines for ${symbol} (since ${lastTs || 'start'})...`);
    // Binance: startTime parameter. limit 1000.
    // If lastTs > 0, use it.
    let url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=1m&limit=1000`;
    if (lastTs) {
        url += `&startTime=${lastTs + 60000}`; // Start from next minute
    }
    
    try {
        const data = await fetchJSON(url);
        // Format: [timestamp, open, high, low, close, volume, ...]
        return data.map(k => ({
            ts: k[0],
            price: parseFloat(k[4])
        }));
    } catch (e) {
        console.error(`[Binance] Kline Download Error: ${e.message}`);
        return [];
    }
}

async function downloadOkxKlines(symbol, lastTs) {
    console.log(`[OKX] Downloading klines for ${symbol} (since ${lastTs || 'start'})...`);
    // OKX: returns newest first. 'after' is older, 'before' is newer.
    // To fetch incremental (newer than lastTs), we technically need to paginate backwards from "now" until we hit lastTs, OR use 'after' if we want older.
    // But OKX API usually fetches "recent" if no params.
    // For incremental from lastTs to Now:
    // It's tricky with OKX "after/before". 
    // Strategy: Just fetch latest 1440 (24h) or limit 100.
    // If we want historical backfill, we iterate 'after'.
    // Here we assume "Download Recent". 
    
    // NOTE: OKX 'after' parameter requests data OLDER than the timestamp.
    // 'before' requests data NEWER than the timestamp.
    // So if we have lastTs, we want `before=lastTs`? No, `before` takes a generic ID or TS.
    // "Request candles newer than this timestamp".
    
    let url = `https://www.okx.com/api/v5/market/candles?instId=${symbol}&bar=1m&limit=100`; // Limit 100 for demo
    if (lastTs) {
        // We want data NEWER than lastTs.
        // OKX API: before used for pagination for newer data.
        url += `&after=${Date.now()}`; // Just simple latest for now, implementing full pagination is complex.
        // Actually, let's just fetch latest and merge.
        url = `https://www.okx.com/api/v5/market/candles?instId=${symbol}&bar=1m&limit=300`; 
    }
    
    try {
        const res = await fetchJSON(url);
        if (res.code !== '0') throw new Error(res.msg);
        // OKX returns newest first. Format: [ts, open, high, low, close, ...]
        return res.data.map(k => ({
            ts: parseInt(k[0]),
            price: parseFloat(k[4])
        })).reverse(); // Make ascending
    } catch (e) {
        console.error(`[OKX] Kline Download Error: ${e.message}`);
        return [];
    }
}

async function downloadBinanceFundingRates(symbol, lastTs) {
    console.log(`[Binance] Downloading Funding Rates for ${symbol}...`);
    let url = `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}&limit=1000`;
    if (lastTs) {
        url += `&startTime=${lastTs + 1}`;
    }
    
    try {
        const data = await fetchJSON(url);
        // Format: [{symbol, fundingTime, fundingRate}, ...]
        return data.map(k => ({
            ts: k.fundingTime,
            rate: parseFloat(k.fundingRate)
        }));
    } catch (e) {
         console.error(`[Binance] Funding Download Error: ${e.message}`);
         return [];
    }
}

async function downloadOkxFundingRates(symbol, lastTs) {
    console.log(`[OKX] Downloading Funding Rates for ${symbol}...`);
    // OKX limit is 100.
    const url = `https://www.okx.com/api/v5/public/funding-rate-history?instId=${symbol}&limit=100`;
    
    try {
        const res = await fetchJSON(url);
        if (res.code !== '0') throw new Error(res.msg);
        // OKX: [{instId, fundingRate, fundingTime, ...}]
        return res.data.map(k => ({
            ts: parseInt(k.fundingTime),
            rate: parseFloat(k.fundingRate)
        })).reverse();
    } catch (e) {
        console.error(`[OKX] Funding Download Error: ${e.message}`);
        return [];
    }
}

// --- Main Loop ---

async function main() {
    console.log(`Starting Download for Hedge: ${hedgeConfig.hedge_name}`);
    
    for (const leg of hedgeConfig.legs) {
        const { exchange, symbol } = leg;
        console.log(`\nProcessing Leg: ${exchange} ${symbol}`);
        
        // 1. Klines
        const klineFile = path.join(DATA_DIR, `${exchange}_${symbol}.json`);
        const { data: existingKlines, lastTs: klineLastTs } = loadExistingData(klineFile);
        
        let newKlines = [];
        if (exchange === 'binance') {
            newKlines = await downloadBinanceKlines(symbol, klineLastTs);
        } else if (exchange === 'okx') {
            newKlines = await downloadOkxKlines(symbol, klineLastTs);
        }
        
        if (newKlines.length > 0) {
            saveData(klineFile, existingKlines, newKlines);
        } else {
            console.log(`No new klines for ${symbol}`);
        }
        
        // 2. Funding Rates
        const fundingFile = path.join(DATA_DIR, `${exchange}_funding_${symbol}.json`);
        const { data: existingFunding, lastTs: fundingLastTs } = loadExistingData(fundingFile);
        
        let newFunding = [];
        if (exchange === 'binance') {
            newFunding = await downloadBinanceFundingRates(symbol, fundingLastTs);
        } else if (exchange === 'okx') {
            newFunding = await downloadOkxFundingRates(symbol, fundingLastTs);
        }
        
        if (newFunding.length > 0) {
            saveData(fundingFile, existingFunding, newFunding);
        } else {
            console.log(`No new funding rates for ${symbol}`);
        }
    }
    
    console.log('\nAll downloads completed.');
}

main();
