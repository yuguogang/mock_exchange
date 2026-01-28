const fs = require('fs');
const path = require('path');
const http = require('http');

const args = process.argv.slice(2);
const dataDirArg = args.find(a => a.startsWith('--data-dir='));
const DATA_DIR = dataDirArg ? path.join(__dirname, dataDirArg.split('=')[1]) : path.join(__dirname, 'data');
const configArg = args.find(a => a.startsWith('--config='));
const CONFIG_PATH = configArg ? path.join(__dirname, configArg.split('=')[1]) : path.join(__dirname, 'config/strategy/demo_strategy_funding_trx.json');

const lookbackArg = args.find(a => a.startsWith('--lookback='));
const LOOKBACK_MINUTES = lookbackArg ? parseInt(lookbackArg.split('=')[1]) : null;

const skipBeforeArg = args.find(a => a.startsWith('--skip-before='));
const SKIP_BEFORE_TS = skipBeforeArg ? parseInt(skipBeforeArg.split('=')[1]) : 0;

const RESET_STATE = args.includes('--reset');

const IS_MIXED_SOURCE = DATA_DIR.includes('data_mixed');
const strategyConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

let hedgeConfig;
if (strategyConfig.hedge_config) {
    hedgeConfig = strategyConfig.hedge_config;
} else if (strategyConfig.hedge_ref) {
    const HEDGE_PATH = path.join(__dirname, 'config/hedge', `${strategyConfig.hedge_ref}.json`);
    hedgeConfig = JSON.parse(fs.readFileSync(HEDGE_PATH, 'utf8'));
}

if (!hedgeConfig) {
    console.error('Could not load hedge context.');
    process.exit(1);
}

const legA = hedgeConfig.legs.find(l => l.role === 'legA');
const legB = hedgeConfig.legs.find(l => l.role === 'legB');
const params = strategyConfig.params.funding;
const SYMBOL_A = legA.symbol;
const SYMBOL_B = legB.symbol;
const SPREAD_TRIGGER_OPEN = params.open_threshold_annualized_pct;
const SPREAD_TRIGGER_CLOSE = params.close_threshold_annualized_pct;
const POSITION_SIZE_USDT = params.position_size_usdt;
const APPROX_PRICE = params.approx_price;
const CT_VAL_A = params.contract_size_override?.legA || legA.contract_profile.contract_size;
const CT_VAL_B = params.contract_size_override?.legB || legB.contract_profile.contract_size;
const QTY_A = Math.floor((POSITION_SIZE_USDT / APPROX_PRICE) / CT_VAL_A);
const QTY_B = Math.floor((POSITION_SIZE_USDT / APPROX_PRICE) / CT_VAL_B);

const MOCK_SERVER_HOST = 'localhost';
const MOCK_SERVER_PORT = 3000;

// --- PERSISTENCE PATHS ---
const SIGNALS_DIR = path.join(__dirname, 'signals');
const CHECKPOINT_PATH = path.join(SIGNALS_DIR, `strategy_checkpoint_${SYMBOL_A}.json`);
const HISTORY_PATH = path.join(SIGNALS_DIR, 'indexed_history_TRX.json');
const SIGNALS_PATH = path.join(SIGNALS_DIR, 'signals_TRX.json');

if (!fs.existsSync(SIGNALS_DIR)) fs.mkdirSync(SIGNALS_DIR, { recursive: true });

function loadJSON(p, def = []) {
    if (!fs.existsSync(p)) return def;
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return def; }
}

function atomicWrite(p, data) {
    const temp = `${p}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(data, null, 2));
    fs.renameSync(temp, p);
}

function detectIntervalHours(data) {
    if (data.length < 2) return 8;
    const diffs = [];
    for (let i = 1; i < Math.min(data.length, 5); i++) {
        diffs.push(data[i].ts - data[i - 1].ts);
    }
    const avgDiffMs = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    return Math.round(avgDiffMs / (3600 * 1000));
}

function getAnnualized(rate, intervalHours) {
    const periodsPerDay = 24 / intervalHours;
    return rate * periodsPerDay * 365;
}

async function postJSON(path, body) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const options = {
            hostname: MOCK_SERVER_HOST, port: MOCK_SERVER_PORT, path,
            method: 'POST', timeout: 3000,
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
        };
        const req = http.request(options, (res) => {
            let buf = '';
            res.on('data', c => buf += c);
            res.on('end', () => res.statusCode < 300 ? resolve(buf) : reject(new Error(res.statusCode)));
        });
        req.on('error', e => reject(e));
        req.write(data); req.end();
    });
}

async function runStrategy() {
    console.log(`[StrategyFunding] Source: ${DATA_DIR} (${IS_MIXED_SOURCE ? 'MIXED' : 'REAL'})`);

    // 1. Load Checkpoint (State Memory)
    let checkpoint;
    if (RESET_STATE) {
        console.log('[StrategyFunding] Resetting state (Checkpoint & History cleared)');
        checkpoint = { lastProcessedTs: 0, activePosition: null, totalIncome: 0 };
        // Clear history file as well
        if (fs.existsSync(HISTORY_PATH)) fs.unlinkSync(HISTORY_PATH);
        if (fs.existsSync(CHECKPOINT_PATH)) fs.unlinkSync(CHECKPOINT_PATH);
    } else {
        checkpoint = loadJSON(CHECKPOINT_PATH, {
            lastProcessedTs: 0,
            activePosition: null, // { sessionId, sideA, sideB, accumulatedIncome, entryTs }
            totalIncome: 0
        });
    }

    const isFullScan = checkpoint.lastProcessedTs === 0;
    console.log(isFullScan ? '--- Starting Initial Full Scan ---' : `--- Starting Incremental Update (Since ${new Date(checkpoint.lastProcessedTs).toISOString()}) ---`);

    // 2. Load Market Data
    const fullA = loadJSON(path.join(DATA_DIR, `${legA.exchange}_funding_${SYMBOL_A}.json`));
    const fullB = loadJSON(path.join(DATA_DIR, `${legB.exchange}_funding_${SYMBOL_B}.json`));

    if (!fullA.length || !fullB.length) {
        console.error('Insufficient data.');
        return;
    }

    const intervalA = detectIntervalHours(fullA);
    const intervalB = detectIntervalHours(fullB);

    // 3. Filter New Ticks
    const fundingA = fullA.filter(d => d.ts > checkpoint.lastProcessedTs);
    const fundingB = fullB.filter(d => d.ts > checkpoint.lastProcessedTs);

    if (!fundingA.length && !fundingB.length) {
        console.log('No new data to process.');
        updateDisplayFiles(checkpoint.totalIncome, []); // Even if no new data, rewrite display for consistency
        return;
    }

    console.log(`Processing: LegA(+${fundingA.length}), LegB(+${fundingB.length})`);

    // Merge Timeline (Current Batch Only)
    const timeline = new Map();
    fundingA.forEach(d => { if (!timeline.has(d.ts)) timeline.set(d.ts, {}); timeline.get(d.ts).rateA = d.rate; });
    fundingB.forEach(d => { if (!timeline.has(d.ts)) timeline.set(d.ts, {}); timeline.get(d.ts).rateB = d.rate; });
    const sortedTs = Array.from(timeline.keys()).sort((a, b) => a - b);

    // We still need the "Current Persistent Rate" even if it's from the old data
    let lastKnownRateA = fullA.findLast(d => d.ts <= checkpoint.lastProcessedTs)?.rate || null;
    let lastKnownRateB = fullB.findLast(d => d.ts <= checkpoint.lastProcessedTs)?.rate || null;

    let activePosition = checkpoint.activePosition;
    let totalIncome = checkpoint.totalIncome;
    const newEvents = [];
    const veracity = IS_MIXED_SOURCE ? "FAKE" : "REAL";

    for (const ts of sortedTs) {
        const events = timeline.get(ts);
        const timeStr = new Date(ts).toISOString().replace('T', ' ').substring(0, 16);

        if (events.rateA !== undefined) lastKnownRateA = events.rateA;
        if (events.rateB !== undefined) lastKnownRateB = events.rateB;
        if (lastKnownRateA === null || lastKnownRateB === null) continue;

        const annA = getAnnualized(lastKnownRateA, intervalA);
        const annB = getAnnualized(lastKnownRateB, intervalB);
        const spread = annA - annB;
        const absSpread = Math.abs(spread);

        let incomeRound = 0;
        if (activePosition) {
            if (events.rateA !== undefined) {
                const inc = QTY_A * CT_VAL_A * APPROX_PRICE * lastKnownRateA * (activePosition.sideA === 'SELL' ? 1 : -1);
                incomeRound += inc;
                if (ts >= SKIP_BEFORE_TS) await postJSON('/mock/income', { symbol: SYMBOL_A, incomeType: 'FUNDING_FEE', income: inc.toFixed(8), asset: 'USDT', time: ts }).catch(() => { });
            }
            if (events.rateB !== undefined) {
                const inc = QTY_B * CT_VAL_B * APPROX_PRICE * lastKnownRateB * (activePosition.sideB === 'SELL' ? 1 : -1);
                incomeRound += inc;
                if (ts >= SKIP_BEFORE_TS) await postJSON('/mock/income', { symbol: SYMBOL_B, incomeType: 'FUNDING_FEE', income: inc.toFixed(8), asset: 'USDT', time: ts }).catch(() => { });
            }
            activePosition.accumulatedIncome += incomeRound;
            totalIncome += incomeRound;
        }

        if (!activePosition) {
            if (absSpread >= SPREAD_TRIGGER_OPEN) {
                const sessionId = `ARB_${veracity}_${ts}`;
                activePosition = { sessionId, entryTs: ts, accumulatedIncome: 0, sideA: annA > annB ? 'SELL' : 'BUY', sideB: annA > annB ? 'BUY' : 'SELL' };
                const sig = { strategy: 'FUNDING', timestamp: ts, timeStr, type: 'OPEN', sessionId, action: annA > annB ? 'SELL_A_BUY_B' : 'BUY_A_SELL_B', spreadAnnualizedPct: spread, veracity };
                newEvents.push(sig);

                if (ts >= SKIP_BEFORE_TS) {
                    console.log(`[${timeStr}] [${veracity}] OPEN | Spread: ${(absSpread * 100).toFixed(1)}% | ${sig.action}`);
                    await postJSON('/mock/order', { symbol: SYMBOL_A, side: activePosition.sideA, type: 'MARKET', quantity: QTY_A, price: APPROX_PRICE }).catch(() => { });
                    await postJSON('/mock/order', { symbol: SYMBOL_B, side: activePosition.sideB, type: 'MARKET', quantity: QTY_B, price: APPROX_PRICE }).catch(() => { });
                }
            }
        } else {
            if (absSpread < SPREAD_TRIGGER_CLOSE) {
                const sig = { strategy: 'FUNDING', timestamp: ts, timeStr, type: 'CLOSE', sessionId: activePosition.sessionId, spreadAnnualizedPct: spread, veracity, pnl: activePosition.accumulatedIncome };
                newEvents.push(sig);
                if (ts >= SKIP_BEFORE_TS) {
                    console.log(`[${timeStr}] [${veracity}] CLOSE | PnL: ${sig.pnl.toFixed(2)}`);
                    await postJSON('/mock/order', { symbol: SYMBOL_A, side: activePosition.sideA === 'SELL' ? 'BUY' : 'SELL', type: 'MARKET', quantity: QTY_A, price: APPROX_PRICE }).catch(() => { });
                    await postJSON('/mock/order', { symbol: SYMBOL_B, side: activePosition.sideB === 'SELL' ? 'BUY' : 'SELL', type: 'MARKET', quantity: QTY_B, price: APPROX_PRICE }).catch(() => { });
                }
                activePosition = null;
            } else if (incomeRound !== 0) {
                newEvents.push({ strategy: 'FUNDING', timestamp: ts, timeStr, type: 'SETTLE', sessionId: activePosition.sessionId, income: incomeRound, veracity });
            }
        }
        checkpoint.lastProcessedTs = ts;
    }

    // 4. Update Checkpoint
    checkpoint.activePosition = activePosition;
    checkpoint.totalIncome = totalIncome;
    atomicWrite(CHECKPOINT_PATH, checkpoint);

    // 5. Update History & Display
    const history = loadJSON(HISTORY_PATH, []);
    const updatedHistory = [...history, ...newEvents];
    updatedHistory.sort((a, b) => a.timestamp - b.timestamp); // Ensure sorted
    atomicWrite(HISTORY_PATH, updatedHistory);

    updateDisplayFiles(totalIncome, updatedHistory);
}

function updateDisplayFiles(totalIncome, historyRecords) {
    const latestTs = historyRecords.length ? historyRecords[historyRecords.length - 1].timestamp : Date.now();
    const cutoff = (LOOKBACK_MINUTES !== null) ? latestTs - (LOOKBACK_MINUTES * 60 * 1000) : 0;
    const filterStart = Math.max(cutoff, SKIP_BEFORE_TS) - 1;

    // Identify closed sessions from full history
    const closedSessionIds = new Set(
        historyRecords
            .filter(s => s.type === 'CLOSE')
            .map(s => s.sessionId)
    );

    // Filter out closed sessions to get active signals
    // This ensures consistency with scheduler.js and removes closed sessions from signals_TRX.json
    const activeSignals = historyRecords.filter(s => !closedSessionIds.has(s.sessionId));
    
    // Sort by timestamp
    activeSignals.sort((a, b) => a.timestamp - b.timestamp);

    atomicWrite(SIGNALS_PATH, activeSignals);

    console.log(`\n✅ Signal File Updated: ${activeSignals.length} active entries (Closed sessions removed)`);
    console.log(`✅ History Total: ${historyRecords.length} entries`);
    console.log(`Total Income: ${totalIncome.toFixed(2)} USDT`);
}

runStrategy().catch(e => { console.error(e); process.exit(1); });
