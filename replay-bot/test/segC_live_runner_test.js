const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function runCommand(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: options.cwd,
            stdio: 'inherit',
            env: { ...process.env, ...options.env }
        });

        child.on('close', code => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
            }
        });

        child.on('error', err => {
            reject(err);
        });
    });
}

async function printMixedWindow(rootDir) {
    const file = path.join(rootDir, 'data_mixed/demo_mix_trx_okx_binance/okx_TRX-USDT-SWAP.json');
    if (!fs.existsSync(file)) {
        console.log('mixed okx_TRX-USDT-SWAP.json not found');
        return;
    }

    const raw = fs.readFileSync(file, 'utf8');
    let data;
    try {
        data = JSON.parse(raw);
    } catch (e) {
        console.log('failed to parse mixed okx_TRX-USDT-SWAP.json:', e.message);
        return;
    }

    const tail = data.slice(-10);
    console.log('\n=== Mixed OKX tail (ts, price, _segment, _mixed_at) ===');
    tail.forEach(item => {
        console.log(item.ts, item.price, item._segment, item._mixed_at);
    });
}

async function printSignalsSnapshot(rootDir) {
    const signalsFile = path.join(rootDir, 'signals/signals_TRX.json');
    const historyFile = path.join(rootDir, 'signals/indexed_history_TRX.json');

    if (fs.existsSync(signalsFile)) {
        try {
            const sigs = JSON.parse(fs.readFileSync(signalsFile, 'utf8'));
            const tail = sigs.slice(-10);
            console.log('\n=== Active signals_TRX tail ===');
            tail.forEach(s => {
                const ts = s.timestamp || s.ts;
                const spread = s.spreadPct || s.spreadAnnualizedPct || null;
                console.log(ts, s.type, s.sessionId, s.strategy, s.action || '', spread);
            });
        } catch (e) {
            console.log('failed to parse signals_TRX.json:', e.message);
        }
    } else {
        console.log('\nsignals_TRX.json not found');
    }

    if (fs.existsSync(historyFile)) {
        try {
            const hist = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
            const tail = hist.slice(-10);
            console.log('\n=== indexed_history_TRX tail ===');
            tail.forEach(s => {
                const ts = s.timestamp || s.ts;
                const spread = s.spreadPct || s.spreadAnnualizedPct || null;
                console.log(ts, s.type, s.sessionId, s.strategy, s.action || '', spread);
            });
        } catch (e) {
            console.log('failed to parse indexed_history_TRX.json:', e.message);
        }
    } else {
        console.log('\nindexed_history_TRX.json not found');
    }
}

async function main() {
    const rootDir = path.join(__dirname, '..');
    const skipClean = process.env.SKIP_CLEAN === '1';
    const skipWait = process.env.SKIP_WAIT === '1';

    const initWaitMs = skipWait ? 5000 : 30000;
    const observeMs = skipWait ? 15000 : 180000;

    if (!skipClean) {
        console.log('running clean_data.js');
        await runCommand('node', ['clean_data.js'], { cwd: rootDir });
    }

    const liveArgs = ['live_runner_enhanced.js', '--strategy=config/strategy/demo_strategy_all_in_one.json'];
    console.log('starting live_runner_enhanced:', ['node', ...liveArgs].join(' '));
    const live = spawn('node', liveArgs, {
        cwd: rootDir,
        stdio: 'inherit'
    });

    live.on('error', err => {
        console.error('live_runner_enhanced error:', err.message);
    });

    console.log('waiting for live runner warmup...');
    await sleep(initWaitMs);

    console.log('switching to default segment for baseline (2 minutes)');
    await runCommand('node', ['rule_manager.js', 'switch', 'default', '2'], { cwd: rootDir });

    console.log('switching to seg_C for 2 minutes');
    await runCommand('node', ['rule_manager.js', 'switch', 'seg_C', '2'], { cwd: rootDir });

    console.log('observing for mixed data and signals...');
    await sleep(observeMs);

    await printMixedWindow(rootDir);
    await printSignalsSnapshot(rootDir);

    console.log('stopping live runner...');
    live.kill('SIGINT');
    await sleep(2000);

    console.log('seg_C live runner test completed');
}

main().catch(err => {
    console.error('seg_C live runner test failed:', err);
    process.exit(1);
});

