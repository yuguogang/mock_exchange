/**
 * Validator 模块测试
 * 简易测试框架，无外部依赖
 */

const { validateHedgeConfig, validateStrategyConfig } = require('../lib/validator');

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (!condition) {
        console.error(`❌ 断言失败: ${message}`);
        failed++;
        return false;
    }
    console.log(`✅ ${message}`);
    passed++;
    return true;
}

function runTests() {
    console.log('\n========== Validator Tests ==========\n');

    // Test 1: 空配置应该失败
    console.log('--- Test 1: 空配置验证 ---');
    const emptyResult = validateHedgeConfig({});
    assert(!emptyResult.valid, '空配置应返回 valid=false');
    assert(emptyResult.errors.length > 0, '空配置应有错误信息');

    // Test 2: null 配置应该失败
    console.log('\n--- Test 2: null 配置验证 ---');
    const nullResult = validateHedgeConfig(null);
    assert(!nullResult.valid, 'null 配置应返回 valid=false');

    // Test 3: 正确配置应该通过
    console.log('\n--- Test 3: 正确配置验证 ---');
    const validConfig = {
        hedge_name: 'test_hedge',
        legs: [
            { exchange: 'binance', symbol: 'BTCUSDT', role: 'legA' },
            { exchange: 'okx', symbol: 'BTC-USDT-SWAP', role: 'legB' }
        ],
        outputs: { inject_to_mock_server: true }
    };
    const validResult = validateHedgeConfig(validConfig);
    assert(validResult.valid, '正确配置应返回 valid=true');
    assert(validResult.errors.length === 0, '正确配置应无错误');

    // Test 4: 缺少 symbol
    console.log('\n--- Test 4: 缺少 symbol 验证 ---');
    const missingSymbol = {
        hedge_name: 'test',
        legs: [{ exchange: 'binance', role: 'legA' }],
        outputs: {}
    };
    const symbolResult = validateHedgeConfig(missingSymbol);
    assert(!symbolResult.valid, '缺少 symbol 应失败');
    assert(symbolResult.errors.some(e => e.includes('symbol')), '错误信息应提及 symbol');

    // Test 5: Strategy 配置验证
    console.log('\n--- Test 5: Strategy 配置验证 ---');
    const strategyResult = validateStrategyConfig({ hedge_ref: 'test', params: {} });
    assert(strategyResult.valid, 'Strategy 正确配置应通过');

    const badStrategy = validateStrategyConfig({});
    assert(!badStrategy.valid, 'Strategy 空配置应失败');

    // 汇总
    console.log('\n========== 测试结果 ==========');
    console.log(`通过: ${passed}`);
    console.log(`失败: ${failed}`);

    if (failed > 0) {
        console.error('\n❌ 存在测试失败');
        process.exit(1);
    } else {
        console.log('\n✅ 所有测试通过');
    }
}

runTests();
