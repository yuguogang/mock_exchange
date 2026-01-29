const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const dataDirArg = args.find(a => a.startsWith('--data-dir='));
const DATA_DIR = dataDirArg ? path.join(__dirname, dataDirArg.split('=')[1]) : path.join(__dirname, 'data');
const configArg = args.find(a => a.startsWith('--config='));
const CONFIG_PATH = configArg ? path.join(__dirname, configArg.split('=')[1]) : path.join(__dirname, 'config/hedge/demo_hedge_trx_binance_okx.json');

// --- NEW PERFORMANCE PARAMS ---
const lookbackArg = args.find(a => a.startsWith('--lookback='));
const LOOKBACK_MINUTES = lookbackArg ? parseInt(lookbackArg.split('=')[1]) : 15;
const LOOKBACK_MS = LOOKBACK_MINUTES * 60 * 1000;
const SNAPSHOT_DATE = '2026-01-26';
const SNAPSHOT_FILE = 'signals/hedge_signals_TRX_20260126.json';

console.log(`[Scheduler] Using Data Directory: ${DATA_DIR}`);
console.log(`[Scheduler] Using Config: ${CONFIG_PATH}`);
console.log(`[Scheduler] Lookback Window: ${LOOKBACK_MINUTES} minutes`);

const SIGNALS_DIR = path.join(__dirname, 'signals');
if (!fs.existsSync(SIGNALS_DIR)) fs.mkdirSync(SIGNALS_DIR);
const UNIFIED_SIGNALS_PATH = path.join(SIGNALS_DIR, 'signals_TRX.json');
const UNIFIED_HISTORY_PATH = path.join(SIGNALS_DIR, 'indexed_history_TRX.json');

function loadData(filename) {
    const p = path.join(DATA_DIR, filename);
    if (!fs.existsSync(p)) return [];
    return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function loadJSON(p, def = []) {
    if (!fs.existsSync(p)) return def;
    try {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (e) {
        return def;
    }
}

async function runReplay() {
    console.log('--- Starting Aligned Replay & Signal Generation (State-Aware) ---');

    // Load config (Unified, Referenced, or Base Hedge)
    const rawConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    let config;

    if (rawConfig.hedge_config) {
        // Mode 1: All-in-one Strategy
        config = rawConfig.hedge_config;
    } else if (rawConfig.hedge_ref) {
        // Mode 2: Strategy referencing base Hedge
        console.log(`[Scheduler] Strategy detected. Linking to base hedge: ${rawConfig.hedge_ref}`);
        const baseHedgePath = path.join(__dirname, 'config/hedge', `${rawConfig.hedge_ref}.json`);
        config = JSON.parse(fs.readFileSync(baseHedgePath, 'utf8'));

        // Merge strategy overrides into hedge config
        if (rawConfig.params && rawConfig.params.spread) {
            console.log('[Scheduler] Applying strategy spread overrides.');
            config.signal = config.signal || {};
            config.signal.spread_pct_thresholds = {
                open: rawConfig.params.spread.open_threshold_pct,
                close: rawConfig.params.spread.close_threshold_pct
            };
            config.signal.cooldown_ms = rawConfig.params.spread.cooldown_ms || 60000;
        }
        if (rawConfig.outputs) {
            config.outputs = { ...config.outputs, ...rawConfig.outputs };
        }
    } else {
        // Mode 3: Traditional standalone Hedge Config
        config = rawConfig;
    }

    if (!config || (!config.enabled && !config.hedge_name)) {
        console.error('Invalid or disabled config.');
        return;
    }

    // Identify legs
    const legA = config.legs.find(l => l.role === 'legA');
    const legB = config.legs.find(l => l.role === 'legB');
    if (!legA || !legB) {
        console.error('Missing legA or legB in config.');
        return;
    }

    // Load data
    const fileA = `${legA.exchange}_${legA.symbol}.json`;
    const fileB = `${legB.exchange}_${legB.symbol}.json`;
    const dataA = loadData(fileA);
    const dataB = loadData(fileB);

    if (dataA.length === 0 || dataB.length === 0) {
        console.error(`Missing data files: ${fileA} or ${fileB}`);
        return;
    }

    // --- APPLY LOOK-BACK FILTER ---
    // 找到数据中的最新时间戳，以此为基准回溯
    const latestTs = Math.max(dataA[dataA.length - 1]?.ts || 0, dataB[dataB.length - 1]?.ts || 0);
    const startTimeThreshold = latestTs - LOOKBACK_MS;

    const filteredDataA = dataA.filter(d => d.ts >= startTimeThreshold);
    const filteredDataB = dataB.filter(d => d.ts >= startTimeThreshold);

    console.log(`Loaded ${dataA.length} ticks for LegA. Processing recent ${filteredDataA.length} ticks.`);
    console.log(`Loaded ${dataB.length} ticks for LegB. Processing recent ${filteredDataB.length} ticks.`);

    const sourceData = config.alignment.time_source === 'legA' ? filteredDataA : filteredDataB;
    const targetData = config.alignment.time_source === 'legA' ? dataB : dataA; // Keep full target for tolerance lookup

    const signals = [];
    let state = 'IDLE';
    let currentSessionId = null;
    let targetIdx = 0;

    let alignedCount = 0;

    // --- DEFENSIVE DEFAULTS ---
    const signalBlock = config.signal || {};
    const thresholds = signalBlock.spread_pct_thresholds || { open: 0.0050, close: 0.0010 };
    const thresholdOpen = thresholds.open;
    const thresholdClose = thresholds.close;

    const skipBeforeArg = args.find(a => a.startsWith('--skip-before='));
    const SKIP_BEFORE_TS = skipBeforeArg ? parseInt(skipBeforeArg.split('=')[1]) : 0;

    for (const tick of sourceData) {
        const ts = tick.ts;

        // --- SKIP HISTORICAL ---
        if (ts < SKIP_BEFORE_TS) continue;

        // Find nearest in targetData within tolerance
        while (targetIdx < targetData.length - 1 && targetData[targetIdx].ts < ts - config.alignment.tolerance_ms) {
            targetIdx++;
        }

        let bestMatch = null;
        let minDiff = Infinity;
        for (let i = targetIdx; i < targetData.length; i++) {
            const diff = Math.abs(targetData[i].ts - ts);
            if (diff <= config.alignment.tolerance_ms) {
                if (diff < minDiff) {
                    minDiff = diff;
                    bestMatch = targetData[i];
                }
            } else if (targetData[i].ts > ts + config.alignment.tolerance_ms) {
                break;
            }
        }

        if (!bestMatch) continue;
        alignedCount++;

        const priceA = config.alignment.time_source === 'legA' ? tick.price : bestMatch.price;
        const priceB = config.alignment.time_source === 'legA' ? bestMatch.price : tick.price;
        const spread = priceA - priceB;
        const spreadPct = (spread / priceB);
        const absSpreadPct = Math.abs(spreadPct);

        // DEBUG: LOG RECENT SPREADS
        if (ts >= latestTs - 180000) {
            console.log(`[Replay Debug] TS: ${ts} | A: ${priceA.toFixed(5)} | B: ${priceB.toFixed(5)} | Spread: ${(spreadPct * 100).toFixed(3)}% | Threshold: ${(thresholdOpen * 100).toFixed(3)}%`);
        }

        // --- STATE MACHINE ---
        if (state === 'IDLE') {
            if (absSpreadPct >= thresholdOpen) {
                const action = spreadPct > 0
                    ? `SELL_${legA.exchange.toUpperCase()}_BUY_${legB.exchange.toUpperCase()}`
                    : `BUY_${legA.exchange.toUpperCase()}_SELL_${legB.exchange.toUpperCase()}`;

                currentSessionId = `HEDGE_${ts}`;
                state = 'HOLDING';

                signals.push({
                    strategy: 'HEDGE',
                    id: `sig_${ts}_open`,
                    ts: ts,
                    timeStr: new Date(ts).toISOString(),
                    type: 'OPEN',
                    sessionId: currentSessionId,
                    action: action,
                    metrics: {
                        spreadPct: spreadPct
                    },
                    legs: [
                        { exchange: legA.exchange, price: priceA },
                        { exchange: legB.exchange, price: priceB }
                    ],
                    status: "paper",
                    veracity: "FAKE"
                });
            }
        } else if (state === 'HOLDING') {
            if (absSpreadPct < thresholdClose) {
                signals.push({
                    strategy: 'HEDGE',
                    id: `sig_${ts}_close`,
                    ts: ts,
                    timeStr: new Date(ts).toISOString(),
                    type: 'CLOSE',
                    sessionId: currentSessionId,
                    metrics: {
                        spreadPct: spreadPct
                    },
                    legs: [
                        { exchange: legA.exchange, price: priceA },
                        { exchange: legB.exchange, price: priceB }
                    ],
                    status: "paper",
                    veracity: "FAKE"
                });
                state = 'IDLE';
                currentSessionId = null;
            }
        }
    }

    const existingSignals = loadJSON(UNIFIED_SIGNALS_PATH, []);
    // Only use existing active signals for dedup check in active list, but we need global history for comprehensive dedup?
    // Actually, we should check against HISTORY for dedup to be safe.
    const history = loadJSON(UNIFIED_HISTORY_PATH, []);

    // 1. Update History (Append Only)
    const existingHistoryIds = new Set(history.map(s => s.id || `${s.ts || s.timestamp}_${s.type}_${s.sessionId}`));
    const closedSessionIdsInHistory = new Set(history.filter(s => s.type === 'CLOSE').map(s => s.sessionId));

    const updatedHistory = history.slice();
    for (const sig of signals) {
        const key = sig.id || `${sig.ts || sig.timestamp}_${sig.type}_${sig.sessionId}`;

        // Prevent duplicate CLOSE signals for the same session
        if (sig.type === 'CLOSE' && closedSessionIdsInHistory.has(sig.sessionId)) {
            continue;
        }

        if (!existingHistoryIds.has(key)) {
            updatedHistory.push(sig);
            if (sig.type === 'CLOSE') {
                closedSessionIdsInHistory.add(sig.sessionId);
            }
        }
    }
    updatedHistory.sort((a, b) => (a.ts || a.timestamp) - (b.ts || b.timestamp)); // Ensure sorted
    fs.writeFileSync(UNIFIED_HISTORY_PATH, JSON.stringify(updatedHistory, null, 2));

    // 2. Update Active Signals (Active Sessions Only)
    // Definition of Active Session: Has OPEN but NO CLOSE in the *History*
    // We derive active signals from the Updated History to ensure consistency
    const closedSessionIds = new Set(
        updatedHistory
            .filter(s => s.type === 'CLOSE')
            .map(s => s.sessionId)
    );

    const activeSignals = updatedHistory.filter(s => !closedSessionIds.has(s.sessionId));
    fs.writeFileSync(UNIFIED_SIGNALS_PATH, JSON.stringify(activeSignals, null, 2));

    const snapshotSignals = signals.filter(sig => {
        const ts = sig.timestamp || sig.ts;
        if (!ts) return false;
        const shanghaiTs = ts + 8 * 60 * 60 * 1000;
        const d = new Date(shanghaiTs);
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth() + 1).padStart(2, '0');
        const day = String(d.getUTCDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${day}`;
        return dateStr === SNAPSHOT_DATE;
    });

    if (snapshotSignals.length > 0) {
        const snapshotPath = path.join(__dirname, SNAPSHOT_FILE);
        fs.writeFileSync(snapshotPath, JSON.stringify(snapshotSignals, null, 2));
        console.log(`Saved snapshot for ${SNAPSHOT_DATE} to ${snapshotPath}`);
    }

    console.log(`\nReplay Finished.`);
    console.log(`Unique Signals Generated in last ${LOOKBACK_MINUTES}m: ${signals.length}`);
    console.log(`Saved to ${UNIFIED_SIGNALS_PATH}`);
}

runReplay();
