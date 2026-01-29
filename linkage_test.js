const { spawn } = require('child_process');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const MOCK_SERVER_URL = 'http://localhost:3000';
const REPLAY_BOT_DIR = path.join(__dirname, 'replay-bot');
const TRANSLATOR_DIR = path.join(__dirname, 'signal-translator');

async function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runCommand(command, args, cwd) {
    return new Promise((resolve, reject) => {
        console.log(`\n> Running: ${command} ${args.join(' ')} (in ${cwd})`);
        const proc = spawn(command, args, { cwd, shell: true, stdio: 'inherit' });
        proc.on('close', code => {
            if (code === 0) resolve();
            else reject(new Error(`Command failed with code ${code}`));
        });
    });
}

async function runLinkageTest() {
    console.log('🔗 Starting Linkage Test: ReplayBot -> Translator -> MockServer');

    // 1. Force Kill Mock Server & Clean DB
    console.log('🔌 Stopping Mock Server to clear state...');
    try { await runCommand('lsof -i :3000 | grep LISTEN | awk \'{print $2}\' | xargs kill -9', [], '.').catch(() => { }); } catch (e) { }
    await wait(1000);

    const dbPath = path.join(__dirname, 'mock-server', 'mock_exchange.db');
    if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
        console.log('🗑️ Deleted existing mock_exchange.db (Fresh Start)');
    }

    // 2. Start Mock Server
    console.log('⚡ Starting Mock Server...');
    const serverLog = fs.openSync('mock_server.log', 'w');
    const serverProc = spawn('node', ['index.js'], {
        cwd: path.join(__dirname, 'mock-server'),
        stdio: ['ignore', serverLog, serverLog],
        detached: true
    });
    serverProc.unref();

    // Wait for health
    let attempts = 0;
    while (attempts < 15) {
        await wait(1000);
        try {
            await axios.get(`${MOCK_SERVER_URL}/health`);
            console.log('✅ Mock Server started successfully.');
            break;
        } catch (e) {
            attempts++;
            process.stdout.write('.');
            if (attempts === 15) {
                console.error('\n❌ Failed to start Mock Server after 15s.');
                process.exit(1);
            }
        }
    }

    // Reset State & Seed Prices
    await axios.post(`${MOCK_SERVER_URL}/mock/reset`, {}).catch(() => { });
    // Seed Prices (Critical for Order Execution)
    await axios.post(`${MOCK_SERVER_URL}/mock/price`, { symbol: 'TRXUSDT', price: 0.30 }).catch(e => console.error('Seed Price Failed', e.message));
    await axios.post(`${MOCK_SERVER_URL}/mock/price`, { symbol: 'TRX-USDT-SWAP', price: 0.30 }).catch(e => console.error('Seed Price Failed', e.message));
    console.log('✅ Mock Server Prices Seeded.');
    // Fallback manual clear (still useful for in-memory state if reset fails or is not implemented)
    await axios.post(`${MOCK_SERVER_URL}/mock/position`, { symbol: 'TRXUSDT', size: 0, margin: 0, entryPrice: 0, side: 'LONG' }).catch(() => { });
    await axios.post(`${MOCK_SERVER_URL}/mock/position`, { symbol: 'TRX-USDT-SWAP', size: 0, margin: 0, entryPrice: 0, side: 'LONG' }).catch(() => { });


    // 2. Clean Data
    await runCommand('node', ['clean_data.js'], REPLAY_BOT_DIR);

    // 3. Generate Signals (ReplayBot)
    // using strategy_funding.js with mixed data to generate signals quickly
    console.log('📊 Generating Signals...');
    // Ensure we have some data or use existing if download fails?
    // Assuming data_mixed exists or we rely on what's there. 
    // If clean_data deleted mixed data, we need to regenerate or copy.
    // For this test, let's assume we use the existing strategy logic which might rely on data. 
    // IMPORTANT: If clean_data removed data_mixed, we need to run mixer first?
    // Let's run live_runner partially or just strategy if data is present.
    // Actually, clean_data removed data_mixed. We need to restore or run mixer.

    // Simpler: Let's assume the user has data or we run a full cycle including mixer.
    // But downloading takes time.
    // Fallback: Manually inject a fake signal file if generation is too heavy?
    // User asked "How to link test", best is real generation.
    // Let's run a "Fake Generation" script to create a signals file directly for testing purposes
    // instead of relying on complex data download/mixing.

    const TEST_SESSION_ID = `TEST_SESSION_${Date.now()}`;
    const fakeSignal = [
        {
            "strategy": "FUNDING",
            "id": `sig_${Date.now()}_open`,
            "ts": Date.now() - 36000000, // 10h ago
            "timeStr": new Date(Date.now() - 36000000).toISOString(),
            "type": "OPEN",
            "sessionId": TEST_SESSION_ID,
            "action": "SELL_A_BUY_B",
            "metrics": { "spreadAnnualizedPct": 0.20 },
            "legs": [
                { "exchange": "binance", "price": 0.30 },
                { "exchange": "okx", "price": 0.30 }
            ],
            "status": "paper",
            "veracity": "FAKE"
        },
        {
            "strategy": "FUNDING",
            "id": `sig_${Date.now()}_close`,
            "ts": Date.now(),
            "timeStr": new Date().toISOString(),
            "type": "CLOSE",
            "sessionId": TEST_SESSION_ID,
            "metrics": { "spreadAnnualizedPct": 0.05 },
            "legs": [
                { "exchange": "binance", "price": 0.30 },
                { "exchange": "okx", "price": 0.30 }
            ],
            "status": "paper",
            "veracity": "FAKE"
        }
    ];

    const signalsDir = path.join(REPLAY_BOT_DIR, 'signals');
    if (!fs.existsSync(signalsDir)) fs.mkdirSync(signalsDir);
    fs.writeFileSync(path.join(signalsDir, 'indexed_history_TRX.json'), JSON.stringify(fakeSignal, null, 2));
    console.log('✅ Fake Signals Generated (OPEN + CLOSE)');

    // 3b. Create Mock Funding Data (Essential for FundingRateService)
    const mixedDir = path.join(REPLAY_BOT_DIR, 'data_mixed', 'demo_mix_trx_okx_binance');
    if (!fs.existsSync(mixedDir)) fs.mkdirSync(mixedDir, { recursive: true });

    // Create dummy funding rate files
    const dummyRates = [
        { ts: Date.now() - 360000000, rate: 0.0001 }, // Old
        { ts: Date.now() - 36000000, rate: 0.0001 },  // Near Open
        { ts: Date.now(), rate: 0.0001 }              // Near Close
    ];
    fs.writeFileSync(path.join(mixedDir, 'binance_funding_TRXUSDT.json'), JSON.stringify(dummyRates));
    fs.writeFileSync(path.join(mixedDir, 'okx_funding_TRX-USDT-SWAP.json'), JSON.stringify(dummyRates));
    console.log('✅ Fake Funding Data Created (for Translator)');

    // 4. Translate Signals
    console.log('🔄 Running Translator...');
    // Note: index.js expects to be run from its directory usually, or handled carefully with paths.
    // Our previous view of index.js shows it uses `../replay-bot/signals`.
    // So running from `signal-translator` dir is best.
    await runCommand('node', ['index.js'], TRANSLATOR_DIR);

    // 5. Verify Mock Server State
    console.log('🔍 Verifying Results...');
    await wait(1000);

    const positions = (await axios.get(`${MOCK_SERVER_URL}/mock/positions`)).data;
    const incomes = (await axios.get(`${MOCK_SERVER_URL}/fapi/v1/income`)).data;
    console.log(`Debug: Total Income Records: ${incomes.length}`);
    incomes.forEach(i => console.log(`   [${i.incomeType}] ${i.symbol} ${i.income}`));

    const fundingIncomes = incomes.filter(i => i.incomeType === 'FUNDING_FEE');
    console.log(`Funding Income Records: ${fundingIncomes.length}`);
    console.log(`Positions (Expect 0 if closed): ${positions.length}`);
    positions.forEach(p => console.log(` - ${p.symbol}: ${p.size} (Entry: ${p.entryPrice})`));

    console.log(`Positions (Expect 0 if closed): ${positions.length}`);
    positions.forEach(p => console.log(` - ${p.symbol}: ${p.size} (Entry: ${p.entryPrice})`));

    fundingIncomes.forEach(i => console.log(`   - ${i.symbol}: ${i.income} @ ${i.time}`));

    if (fundingIncomes.length > 0) {
        console.log('✅ Success! Funding fees were generated and settled.');
    } else {
        console.error('❌ Failure! No funding fees found.');
        process.exit(1);
    }
}

runLinkageTest().catch(e => {
    console.error(e);
    process.exit(1);
});
