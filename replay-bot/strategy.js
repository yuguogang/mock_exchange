const fs = require('fs');
const path = require('path');
const http = require('http');
const net = require('net');
const env = require('./config/env');

const args = process.argv.slice(2);
const configArg = args.find(a => a.startsWith('--config='));
const STRATEGY_CONFIG_PATH = configArg ? path.join(__dirname, configArg.split('=')[1]) : null;
const skipBeforeArg = args.find(a => a.startsWith('--skip-before='));
const SKIP_BEFORE_TS = skipBeforeArg ? parseInt(skipBeforeArg.split('=')[1]) : 0;

if (!STRATEGY_CONFIG_PATH) {
    console.error('Usage: node strategy.js --config=<strategy_config_file>');
    process.exit(1);
}

const strategyConfig = JSON.parse(fs.readFileSync(STRATEGY_CONFIG_PATH, 'utf8'));

// Load Hedge Context (Unified or Reference)
let hedgeConfig;
if (strategyConfig.hedge_config) {
    hedgeConfig = strategyConfig.hedge_config;
} else if (strategyConfig.hedge_ref) {
    console.log(`[Strategy] Referencing base hedge: ${strategyConfig.hedge_ref}`);
    const HEDGE_PATH = path.join(__dirname, 'config/hedge', `${strategyConfig.hedge_ref}.json`);
    if (!fs.existsSync(HEDGE_PATH)) {
        console.error(`Base hedge config not found: ${HEDGE_PATH}`);
        process.exit(1);
    }
    hedgeConfig = JSON.parse(fs.readFileSync(HEDGE_PATH, 'utf8'));

    // FALLBACKS: If base hedge is lean, get logic from strategy
    if (!hedgeConfig.outputs && strategyConfig.outputs) {
        hedgeConfig.outputs = strategyConfig.outputs;
    }
    if (!hedgeConfig.execution && strategyConfig.execution) {
        hedgeConfig.execution = strategyConfig.execution;
    }
}

if (!hedgeConfig) {
    console.error('Could not determine hedge configuration.');
    process.exit(1);
}

// Determine paths
// Use History as source of truth for execution to ensure we catch CLOSE signals even if they are removed from active signals list
const UNIFIED_SIGNALS_PATH = path.join(__dirname, 'signals', 'indexed_history_TRX.json');
const FALLBACK_SIGNALS_FILE = hedgeConfig.outputs.signals_file
    ? path.join(__dirname, hedgeConfig.outputs.signals_file)
    : path.join(__dirname, 'signals', `hedge_signals_${hedgeConfig.hedge_name}.json`);

// Output Dir
const REAL_OUTPUT_DIR = path.join(__dirname, 'mock_data');
if (!fs.existsSync(REAL_OUTPUT_DIR)) fs.mkdirSync(REAL_OUTPUT_DIR);

const MOCK_SERVER_HOST = env.mockServer.host;
const MOCK_SERVER_PORT = env.mockServer.port;

function checkMockServer() {
    return new Promise((resolve) => {
        const socket = net.createConnection({ host: MOCK_SERVER_HOST, port: MOCK_SERVER_PORT });
        socket.setTimeout(1500);
        socket.on('connect', () => { socket.destroy(); resolve(true); });
        socket.on('error', () => { resolve(false); });
        socket.on('timeout', () => { socket.destroy(); resolve(false); });
    });
}

function postJSON(path, body) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const options = {
            hostname: MOCK_SERVER_HOST,
            port: MOCK_SERVER_PORT,
            path: path,
            method: 'POST',
            timeout: 5000,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        };

        const req = http.request(options, (res) => {
            let responseBody = '';
            res.on('data', (chunk) => responseBody += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try { resolve(JSON.parse(responseBody)); } catch (e) { resolve(responseBody); }
                } else { reject(new Error(`HTTP ${res.statusCode}: ${responseBody}`)); }
            });
        });
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout (5s)')); });
        req.on('error', (e) => reject(e));
        req.write(data);
        req.end();
    });
}

async function injectOrder(trade) {
    try {
        const symbol = trade.symbol || trade.instId;
        const side = (trade.side || '').toUpperCase();
        const quantity = parseFloat(trade.qty || trade.fillSz);
        const price = parseFloat(trade.price || trade.fillPx);
        const clientOrderId = trade.orderId || trade.clOrdId;
        const exchange = trade.exchange || (trade.instId ? 'okx' : 'binance');
        await postJSON('/core/order', {
            exchange,
            symbol,
            side,
            type: 'MARKET',
            quantity,
            price,
            status: 'FILLED',
            clientOrderId,
            timestamp: Date.now()
        });
    } catch (e) {
        const symbol = trade.symbol || trade.instId;
        const side = (trade.side || '').toUpperCase();
        const quantity = parseFloat(trade.qty || trade.fillSz);
        const price = parseFloat(trade.price || trade.fillPx);
        const clientOrderId = trade.orderId || trade.clOrdId;
        const reason = e && e.code === 'ECONNREFUSED' ? 'Mock Server 未启动或不可达' : e.message;
        console.error(`  [Injection Error] Order(symbol=${symbol}, side=${side}, qty=${quantity}, price=${price}, id=${clientOrderId}): ${reason}`);
    }
}

async function injectPosition(position) {
    try {
        const exchange = position.exchange || (position.instId ? 'okx' : 'binance');
        const symbol = position.symbol || position.instId;
        const quantity = parseFloat(position.positionAmt || position.pos);
        const entryPrice = parseFloat(position.entryPrice || position.avgPx);
        const leverage = parseFloat(position.leverage || position.lever || 10);
        const markPrice = parseFloat(position.markPrice || position.markPx || entryPrice);
        const side = quantity > 0 ? 'LONG' : (quantity < 0 ? 'SHORT' : 'BOTH');
        const margin = (Math.abs(quantity) * entryPrice) / leverage;

        if (!symbol) return;

        await postJSON('/core/position', {
            exchange,
            symbol,
            side,
            quantity,
            entryPrice,
            markPrice,
            unrealizedPnl: 0,
            margin,
            leverage,
            timestamp: Date.now()
        });
        console.log(`  -> Injected Position: ${exchange}:${symbol} Qty:${quantity}`);
    } catch (e) {
        const symbol = position.symbol || position.instId;
        const size = parseFloat(position.positionAmt || position.pos);
        const entryPrice = parseFloat(position.entryPrice || position.avgPx);
        const reason = e && e.code === 'ECONNREFUSED' ? 'Mock Server 未启动或不可达' : e.message;
        console.error(`  [Injection Error] Position(symbol=${symbol}, size=${size}, entry=${entryPrice}): ${reason}`);
    }
}

function loadSignals() {
    let raw;
    let sourcePath;
    if (fs.existsSync(UNIFIED_SIGNALS_PATH)) {
        sourcePath = UNIFIED_SIGNALS_PATH;
        raw = JSON.parse(fs.readFileSync(UNIFIED_SIGNALS_PATH, 'utf8'));
    } else if (fs.existsSync(FALLBACK_SIGNALS_FILE)) {
        sourcePath = FALLBACK_SIGNALS_FILE;
        raw = JSON.parse(fs.readFileSync(FALLBACK_SIGNALS_FILE, 'utf8'));
    } else {
        console.log(`No signals file found at ${UNIFIED_SIGNALS_PATH} or ${FALLBACK_SIGNALS_FILE}. Nothing to execute.`);
        return { signals: [], sourcePath: UNIFIED_SIGNALS_PATH };
    }
    const filtered = raw.filter(s => {
        const isHedge = (s.strategy ? s.strategy.toUpperCase() === 'HEDGE' : true);
        const inWindow = (typeof s.timestamp === 'number') ? (s.timestamp >= SKIP_BEFORE_TS) : true;
        return isHedge && inWindow;
    });
    return { signals: filtered, sourcePath };
}

function generateMockTrades(signals) {
    const binanceTrades = [];
    const okxTrades = [];
    const legA = hedgeConfig.legs.find(l => l.role === 'legA');
    const legB = hedgeConfig.legs.find(l => l.role === 'legB');
    const fundingParams = (strategyConfig.params && strategyConfig.params.funding) || {};
    const execParams = (strategyConfig.params && strategyConfig.params.execution) || {};
    const positionSizeUsdt = (execParams.order_notional_usdt ?? fundingParams.position_size_usdt ?? 10000);

    let tradeIdCounter = 1000000;
    const sessionMap = new Map(); // Track entry side to reverse on Close

    const approxPrice = (execParams.approx_price ?? fundingParams.approx_price ?? 0.15);
    signals.forEach((signal) => {
        const ts = signal.timestamp;
        const isClose = signal.type === 'CLOSE';

        let action = signal.action;
        if (isClose && !action) {
            // Find paired open signal side
            const entryAction = sessionMap.get(signal.sessionId);
            if (entryAction) {
                // Reverse action
                if (entryAction.startsWith('BUY_BINANCE')) action = 'SELL_BINANCE_BUY_OKX';
                else action = 'BUY_BINANCE_SELL_OKX';
            } else {
                // Fallback: Default to closing based on current spread (not perfect but safe)
                action = signal.spreadPct > 0 ? 'BUY_BINANCE_SELL_OKX' : 'SELL_BINANCE_BUY_OKX';
            }
        } else if (!isClose) {
            sessionMap.set(signal.sessionId, action);
        }

        if (!action) return;

        const legBinance = Array.isArray(signal.legs) ? signal.legs.find(l => l.exchange === 'binance') : null;
        const legOkx = Array.isArray(signal.legs) ? signal.legs.find(l => l.exchange === 'okx') : null;
        const priceA = (signal.legA_price || signal.binancePrice || (legBinance && legBinance.price) || approxPrice);
        const priceB = (signal.legB_price || signal.okxPrice || (legOkx && legOkx.price) || approxPrice);

        const qtyA = Math.floor((positionSizeUsdt / priceA) / legA.contract_profile.contract_size) * legA.contract_profile.contract_size;
        const qtyB = Math.floor((positionSizeUsdt / priceB) / legB.contract_profile.contract_size) * legB.contract_profile.contract_size;

        // Binance Trade
        const sideA = action.includes('BUY_BINANCE') ? 'BUY' : 'SELL';
        binanceTrades.push({
            exchange: 'binance',
            id: tradeIdCounter++,
            orderId: signal.id,
            symbol: legA.symbol,
            side: sideA,
            price: priceA,
            qty: qtyA,
            commission: (priceA * qtyA * legA.fee_profile.taker_fee_pct).toFixed(4),
            time: ts,
            isMaker: false
        });

        // OKX Trade
        const sideB = action.includes('BUY_OKX') ? 'BUY' : 'SELL';
        okxTrades.push({
            exchange: 'okx',
            instId: legB.symbol,
            tradeId: String(tradeIdCounter++),
            ordId: signal.id,
            clOrdId: signal.id,
            side: sideB.toLowerCase(),
            fillPx: String(priceB),
            fillSz: String(qtyB),
            fee: String(-(priceB * qtyB * legB.fee_profile.taker_fee_pct).toFixed(4)),
            feeCcy: 'USDT',
            ts: String(ts)
        });
    });

    return { binanceTrades, okxTrades };
}

function generateMockPositions(signals) {
    const legA = hedgeConfig.legs.find(l => l.role === 'legA');
    const legB = hedgeConfig.legs.find(l => l.role === 'legB');
    const fundingParams = (strategyConfig.params && strategyConfig.params.funding) || {};
    const execParams = (strategyConfig.params && strategyConfig.params.execution) || {};
    const positionSizeUsdt = (execParams.order_notional_usdt ?? fundingParams.position_size_usdt ?? 10000);

    let legANetQty = 0;
    let legBNetQty = 0;
    const sessionMap = new Map();

    signals.forEach(signal => {
        const isClose = signal.type === 'CLOSE';
        let action = signal.action;
        if (isClose && !action) {
            const entryAction = sessionMap.get(signal.sessionId);
            if (entryAction) {
                action = entryAction.startsWith('BUY_BINANCE') ? 'SELL_BINANCE_BUY_OKX' : 'BUY_BINANCE_SELL_OKX';
            }
        } else if (!isClose) {
            sessionMap.set(signal.sessionId, action);
        }

        if (!action) return;

        const legBinance = Array.isArray(signal.legs) ? signal.legs.find(l => l.exchange === 'binance') : null;
        const legOkx = Array.isArray(signal.legs) ? signal.legs.find(l => l.exchange === 'okx') : null;
        const priceA = (signal.legA_price || signal.binancePrice || (legBinance && legBinance.price) || approxPrice);
        const priceB = (signal.legB_price || signal.okxPrice || (legOkx && legOkx.price) || approxPrice);
        const qtyA = Math.floor((positionSizeUsdt / priceA) / legA.contract_profile.contract_size) * legA.contract_profile.contract_size;
        const qtyB = Math.floor((positionSizeUsdt / priceB) / legB.contract_profile.contract_size) * legB.contract_profile.contract_size;

        if (action.includes('BUY_BINANCE')) legANetQty += qtyA;
        else if (action.includes('SELL_BINANCE')) legANetQty -= qtyA;

        if (action.includes('BUY_OKX')) legBNetQty += qtyB;
        else if (action.includes('SELL_OKX')) legBNetQty -= qtyB;
    });

    const lastSignal = signals[signals.length - 1];
    const approxPrice = (execParams.approx_price ?? fundingParams.approx_price ?? 0.15);
    const legBinanceLast = (lastSignal && Array.isArray(lastSignal.legs)) ? lastSignal.legs.find(l => l.exchange === 'binance') : null;
    const legOkxLast = (lastSignal && Array.isArray(lastSignal.legs)) ? lastSignal.legs.find(l => l.exchange === 'okx') : null;
    const lastPriceA = lastSignal ? (lastSignal.legA_price || lastSignal.binancePrice || (legBinanceLast && legBinanceLast.price) || approxPrice) : approxPrice;
    const lastPriceB = lastSignal ? (lastSignal.legB_price || lastSignal.okxPrice || (legOkxLast && legOkxLast.price) || approxPrice) : approxPrice;

    const binancePosition = {
        exchange: 'binance',
        symbol: legA.symbol,
        positionAmt: String(legANetQty),
        entryPrice: String(lastPriceA),
        markPrice: String(lastPriceA),
        unRealizedProfit: '0',
        liquidationPrice: '0',
        leverage: String(legA.contract_profile.leverage_default),
        positionSide: legANetQty > 0 ? 'LONG' : (legANetQty < 0 ? 'SHORT' : 'BOTH'),
        updateTime: Date.now()
    };

    const okxPosition = {
        exchange: 'okx',
        instId: legB.symbol,
        pos: String(legBNetQty),
        avgPx: String(lastPriceB),
        markPx: String(lastPriceB),
        lever: String(legB.contract_profile.leverage_default),
        posSide: legBNetQty > 0 ? 'long' : (legBNetQty < 0 ? 'short' : 'net'),
        uTime: String(Date.now())
    };

    return { binancePosition, okxPosition };
}

async function main() {
    console.log('--- Generating Mock Execution Data ---');
    const { signals, sourcePath } = loadSignals();
    console.log(`Loaded ${signals.length} signals from ${sourcePath}`);
    if (signals.length === 0) {
        fs.writeFileSync(path.join(REAL_OUTPUT_DIR, 'binance_trades.json'), JSON.stringify([], null, 2));
        fs.writeFileSync(path.join(REAL_OUTPUT_DIR, 'okx_trades.json'), JSON.stringify([], null, 2));
        fs.writeFileSync(path.join(REAL_OUTPUT_DIR, 'binance_position.json'), JSON.stringify([], null, 2));
        fs.writeFileSync(path.join(REAL_OUTPUT_DIR, 'okx_position.json'), JSON.stringify({ code: '0', msg: '', data: [] }, null, 2));
        console.log('No signals to execute in current window. Skipping injection.');
        return;
    }

    const { binanceTrades, okxTrades } = generateMockTrades(signals);
    const { binancePosition, okxPosition } = generateMockPositions(signals);

    fs.writeFileSync(path.join(REAL_OUTPUT_DIR, 'binance_trades.json'), JSON.stringify(binanceTrades, null, 2));
    fs.writeFileSync(path.join(REAL_OUTPUT_DIR, 'okx_trades.json'), JSON.stringify(okxTrades, null, 2));
    fs.writeFileSync(path.join(REAL_OUTPUT_DIR, 'binance_position.json'), JSON.stringify([binancePosition], null, 2));
    fs.writeFileSync(path.join(REAL_OUTPUT_DIR, 'okx_position.json'), JSON.stringify({ code: '0', msg: '', data: [okxPosition] }, null, 2));

    if (hedgeConfig.outputs.inject_to_mock_server) {
        const serverUp = await checkMockServer();
        if (!serverUp) {
            console.log('\n[Strategy] Mock Server 未启动，跳过注入；离线生成完成');
        } else {
            console.log('\n--- Injecting to Mock Server ---');
            for (const t of binanceTrades) await injectOrder(t);
            for (const t of okxTrades) await injectOrder(t);
            await injectPosition(binancePosition);
            await injectPosition(okxPosition);
            console.log('✓ Injection Complete');
        }
    }
}

main();
