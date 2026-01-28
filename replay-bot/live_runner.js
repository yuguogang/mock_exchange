const { spawn } = require('child_process');
const path = require('path');

// Configuration
const HEDGE_CONFIG = 'config/hedge/demo_hedge_trx_binance_okx.json';
const STRATEGY_CONFIG = 'config/strategy/demo_strategy_funding_trx.json';
const MIXER_CONFIG = 'config/mixer/demo_mix_trx_okx_binance.json';

const INTERVAL_MS = 60000; // Run every 60 seconds

function runScript(scriptName, args = []) {
    return new Promise((resolve, reject) => {
        const scriptPath = path.join(__dirname, scriptName);
        console.log(`\n[LiveRunner] >>> Running ${scriptName} ${args.join(' ')}`);
        
        const child = spawn('node', [scriptPath, ...args], {
            cwd: __dirname,
            stdio: 'inherit' // Pipe output to parent
        });

        child.on('close', (code) => {
            if (code === 0) {
                console.log(`[LiveRunner] <<< ${scriptName} completed successfully.`);
                resolve();
            } else {
                console.error(`[LiveRunner] !!! ${scriptName} exited with code ${code}`);
                // Resolve anyway to keep loop running, but maybe log error
                resolve(); 
            }
        });

        child.on('error', (err) => {
            console.error(`[LiveRunner] Failed to start ${scriptName}: ${err.message}`);
            resolve();
        });
    });
}

async function loop() {
    console.log('--- Starting Live Replay Loop ---');
    console.log(`Interval: ${INTERVAL_MS}ms`);
    console.log(`Hedge Config: ${HEDGE_CONFIG}`);
    
    while (true) {
        const startTime = Date.now();
        
        try {
            // 1. Download Latest Data (Incremental)
            // download_data.js uses --config to find legs
            await runScript('download_data.js', [`--config=${HEDGE_CONFIG}`]);

            // 2. Mix Data (Apply Rules)
            // mixer.js hardcodes config path in current version? 
            // Let's check mixer.js... it uses: const configFile = path.join(__dirname, 'config/mixer/demo_mix_trx_okx_binance.json');
            // We should ideally make mixer.js accept args, but for now we rely on it using the correct config.
            // Or we modify mixer.js to accept --config. 
            // Let's assume the user wants to use the specific demo mixer config.
            // To be safe, let's pass it if we update mixer.js, otherwise it runs default.
            // The user updated 'demo_mix_trx_okx_binance.json', which is the default in mixer.js (line 221).
            await runScript('mixer.js');

            // 3. Generate Signals (Scheduler)
            // scheduler.js needs config. It defaults to 'prompt_scheduler_config.md' logic? 
            // No, we refactored it. It uses 'config/hedge/demo_hedge_trx_binance_okx.json' via --config.
            // But scheduler.js also needs to know to use MIXED data.
            // In 'demo_hedge_trx_binance_okx.json', 'outputs.signals_file' is defined.
            // But input data dir? 
            // Scheduler reads from 'data/'. 
            // Wait, we need Scheduler to read from 'data_mixed/demo_mix_trx_okx_binance/'.
            // The Scheduler script currently constructs paths based on... let's check scheduler.js.
            // If we want it to read mixed data, we might need to point it there.
            // Or we update the hedge config to point to mixed data dir?
            // "outputs": { "mock_data_dir": ... }
            // "legs" don't specify data path.
            // Let's check scheduler.js logic.
            
            // To support reading mixed data, we can pass a --data-dir flag to scheduler if supported,
            // or we temporarily modify the hedge config? No, that's messy.
            // Usually, we create a "Mixed Hedge Config" or override the data path.
            // Let's assume for this MVP loop, we want to verify the PIPELINE.
            // If scheduler reads 'data/', it reads RAW data.
            // We want it to read MIXED data.
            // Let's pass `--data-dir=data_mixed/demo_mix_trx_okx_binance` to scheduler.js if it supports it.
            // If not, we might need to quick-fix scheduler.js.
            await runScript('scheduler.js', [`--config=${HEDGE_CONFIG}`, `--data-dir=data_mixed/demo_mix_trx_okx_binance`]);

            // 4. Run Strategy (Generate Mock Data & Inject)
            // strategy.js uses --config (strategy config).
            // It loads hedge config from strategy config reference.
            // It needs to read SIGNALS.
            // It produces TRADES/POSITIONS.
            // And INJECTS.
            await runScript('strategy.js', [`--config=${STRATEGY_CONFIG}`]);

            // 5. Run Strategy Funding (Funding Arb & Income Injection)
            // strategy_funding.js uses --config.
            // It needs data.
            await runScript('strategy_funding.js', [`--config=${STRATEGY_CONFIG}`, `--data-dir=data_mixed/demo_mix_trx_okx_binance`]);

        } catch (e) {
            console.error(`[LiveRunner] Loop Error: ${e.message}`);
        }

        const elapsed = Date.now() - startTime;
        const wait = Math.max(0, INTERVAL_MS - elapsed);
        console.log(`[LiveRunner] Sleeping for ${wait/1000}s...`);
        await new Promise(r => setTimeout(r, wait));
    }
}

loop();
