const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'mock_data');

function loadJSON(filename) {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, filename), 'utf8'));
}

function analyzePnL() {
    console.log('=== 套利盈亏分析 ===\n');

    const binanceTrades = loadJSON('binance_trades.json');
    const okxTrades = loadJSON('okx_trades.json');
    const signals = JSON.parse(fs.readFileSync(path.join(__dirname, 'signals', 'hedge_signals_TRX.json'), 'utf8'));

    console.log(`总信号数: ${signals.length}`);
    console.log(`Binance 成交: ${binanceTrades.length} 笔`);
    console.log(`OKX 成交: ${okxTrades.length} 笔\n`);

    // 分析每笔对冲的理论收益
    let totalSpreadProfit = 0;
    let totalFees = 0;

    signals.forEach((signal, idx) => {
        const qty = 100;
        const bPrice = signal.binancePrice;
        const oPrice = signal.okxPrice;
        const spread = parseFloat(signal.spread);

        // 价差收益 (绝对值)
        const spreadProfit = Math.abs(spread) * qty;

        // 手续费
        const binanceFee = bPrice * qty * 0.0004; // 0.04%
        const okxFee = oPrice * qty * 0.0005;     // 0.05%
        const totalFee = binanceFee + okxFee;

        totalSpreadProfit += spreadProfit;
        totalFees += totalFee;

        if (idx < 5) {
            console.log(`信号 #${idx + 1}:`);
            console.log(`  动作: ${signal.action}`);
            console.log(`  价差: ${signal.spread} (${signal.spreadPct})`);
            console.log(`  理论收益: $${spreadProfit.toFixed(4)}`);
            console.log(`  手续费: $${totalFee.toFixed(4)}`);
            console.log(`  净收益: $${(spreadProfit - totalFee).toFixed(4)}\n`);
        }
    });

    console.log('--- 汇总 ---');
    console.log(`总价差收益: $${totalSpreadProfit.toFixed(2)}`);
    console.log(`总手续费: $${totalFees.toFixed(2)}`);
    console.log(`净收益: $${(totalSpreadProfit - totalFees).toFixed(2)}`);

    const netPnL = totalSpreadProfit - totalFees;
    if (netPnL > 0) {
        console.log(`\n✅ 盈利: $${netPnL.toFixed(2)}`);
    } else {
        console.log(`\n❌ 亏损: $${Math.abs(netPnL).toFixed(2)}`);
    }

    console.log(`\n--- 关键问题 ---`);
    console.log(`这些数据是"真实"的吗？`);
    console.log(`  ✅ 价格: 是真实的历史价格 (来自 Binance/OKX API)`);
    console.log(`  ✅ 时间: 是真实的历史时间戳`);
    console.log(`  ❌ 成交: 是模拟的 (实际上没有真正下单)`);
    console.log(`  ❌ 盈亏: 是理论计算 (基于价差 - 手续费)`);

    console.log(`\n为什么会亏损？`);
    console.log(`  1. 价差太小 (0.01%-0.03%)`);
    console.log(`  2. 手续费较高 (Binance 0.04% + OKX 0.05% = 0.09%)`);
    console.log(`  3. 当价差 < 手续费时，每笔都是亏损的`);
    console.log(`\n解决方案:`);
    console.log(`  - 提高信号阈值 (例如只在价差 > 0.1% 时交易)`);
    console.log(`  - 使用 Maker 订单降低手续费`);
    console.log(`  - 增加资金费率收益来覆盖交易成本`);
}

analyzePnL();
