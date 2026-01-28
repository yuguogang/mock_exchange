#!/usr/bin/env node

/**
 * 规则切换工具 - 动态控制Mixer规则
 * 用于测试不同市场场景和策略效果
 */

const { MixerController } = require('./mixer_controller');
const path = require('path');
const fs = require('fs');

const CONFIG_PATH = path.join(__dirname, 'config/mixer/demo_mix_trx_okx_binance.json');

// 命令行参数解析
const args = process.argv.slice(2);
const command = args[0];

// 可用规则段预定义（作为模板）
const AVAILABLE_RULES = {
    'seg_A': {
        description: '段A - 提升资金费并轻微抬升相对价差',
        funding: [{ type: 'scale', value: 1.3 }, { type: 'offset', value: 0.0000 }, { type: 'clamp', min: -0.005, max: 0.005 }],
        price: [{ type: 'target_spread_pct', value: 0.0015 }, { type: 'noise', mode: 'gaussian', amplitude: 0.0005, seed: 42 }]
    },
    'seg_B': {
        description: '段B - 压低相对价差（更激进）',
        funding: [{ type: 'scale', value: 1.5 }, { type: 'clamp', min: -0.006, max: 0.006 }],
        price: [{ type: 'target_spread_pct', value: -0.0010 }]
    },
    'seg_C': {
        description: '段C - 极端价差场景（测试用）',
        funding: [{ type: 'scale', value: 2.0 }, { type: 'clamp', min: -0.01, max: 0.01 }],
        price: [{ type: 'target_spread_pct', value: -0.020 }]
    },
    'seg_funding_only': {
        description: '仅强力提升资金费，保持真实市场价差',
        funding: [{ type: 'scale', value: 5.0 }, { type: 'offset', value: 0.0005 }],
        price: [] // 空操作，表示不修改价差
    },
    'default': {
        description: '默认模式 - 停止所有干预，回归真实市场',
        funding: [],
        price: []
    }
};

/**
 * 显示帮助信息
 */
function showHelp() {
    console.log(`
🎯 Mixer规则切换工具
... (省略部分帮助文本)
`);
}

/**
 * 切换规则
 */
async function switchRule(ruleId, durationMinutes = 60) {
    console.log(`🔄 尝试切换到规则: ${ruleId}`);
    console.log(`⏱️  持续时间: ${durationMinutes} 分钟`);

    const controller = new MixerController(CONFIG_PATH);

    try {
        if (!AVAILABLE_RULES[ruleId]) {
            console.error(`❌ 错误: 规则 ID "${ruleId}" 在模板中不存在`);
            console.log(`💡 提示: 使用 "node rule_manager.js list" 查看可用 ID`);
            return false;
        }

        // --- DEEP REFRESH ---
        // 无论 JSON 中是否存在，统一重新从模板创建/更新，以确保优先级 (200) 和参数完全同步
        console.log(`ℹ️  正在同步规则模板并提升优先级...`);
        const success = await createRule(ruleId, AVAILABLE_RULES[ruleId].description, durationMinutes);

        if (success) {
            console.log(`✅ 规则应用成功: ${ruleId}`);
            console.log(`📊 新规则将在下个周期强制生效 (Priority: 200)`);

            // 显示规则详情
            const rule = AVAILABLE_RULES[ruleId];
            console.log(`\n📋 规则详情:`);
            console.log(`   描述: ${rule.description}`);

            const fundingScale = rule.funding.find(f => f.type === 'scale')?.value || 1.0;
            console.log(`   资金费率: 缩放 ${fundingScale}x`);

            const targetSpread = rule.price.find(p => p.type === 'target_spread_pct')?.value;
            if (targetSpread !== undefined) {
                console.log(`   目标价差: ${(targetSpread * 100).toFixed(2)}%`);
            } else {
                console.log(`   价差: 保持真实市场记录`);
            }

            return true;
        } else {
            console.error(`❌ 规则切换失败`);
            return false;
        }

    } catch (error) {
        console.error(`❌ 切换规则时出错:`, error.message);
        return false;
    }
}

/**
 * 创建新规则
 */
async function createRule(ruleId, description, durationMinutes = 60) {
    console.log(`📝 创建新规则: ${ruleId}`);

    const rule = AVAILABLE_RULES[ruleId];
    if (!rule) {
        console.error(`❌ 规则定义不存在: ${ruleId}`);
        return false;
    }

    const controller = new MixerController(CONFIG_PATH);

    // 创建规则：改用本地时间以匹配系统和数据时间
    const now = Date.now();
    const startTime = new Date(now - 60000); // 1分钟前
    const endTime = new Date(now + durationMinutes * 60000);

    const toLocalString = (date) => {
        const pad = (n) => n.toString().padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    };

    const startLocal = toLocalString(startTime);
    const endLocal = toLocalString(endTime);

    const ops = {
        funding: rule.funding,
        price: rule.price
    };

    const success = await controller.createRuleSegment(
        ruleId,
        startLocal,
        endLocal,
        ops,
        210, // 设定超高优先级，确保绝对覆盖
        description
    );

    if (success) {
        console.log(`✅ 规则创建成功: ${ruleId}`);
    } else {
        console.error(`❌ 规则创建失败: ${ruleId}`);
    }

    return success;
}

/**
 * 列出所有规则
 */
function listRules() {
    console.log('\n📋 可用规则段:');

    Object.entries(AVAILABLE_RULES).forEach(([id, rule]) => {
        console.log(`\n  ${id}:`);
        console.log(`    描述: ${rule.description}`);
        
        const fundingScale = (rule.funding && rule.funding[0] && rule.funding[0].type === 'scale') ? rule.funding[0].value : 'Default';
        console.log(`    资金费率: ${fundingScale === 'Default' ? '无修改' : '缩放' + fundingScale + '倍'}`);
        
        const priceSpread = (rule.price && rule.price[0] && rule.price[0].type === 'target_spread_pct') ? rule.price[0].value : undefined;
        console.log(`    价差: ${priceSpread !== undefined ? (priceSpread * 100).toFixed(2) + '%' : '无修改'}`);

        const clampRule = rule.funding ? rule.funding.find(r => r.type === 'clamp') : null;
        if (clampRule) {
            console.log(`    费率限制: [${clampRule.min}, ${clampRule.max}]`);
        }

        const noiseRule = rule.price ? rule.price.find(r => r.type === 'noise') : null;
        if (noiseRule) {
            console.log(`    噪声幅度: ${noiseRule.amplitude}`);
        }
    });
}

/**
 * 显示当前状态
 */
async function showStatus() {
    console.log('\n📊 当前规则状态:');

    const controller = new MixerController(CONFIG_PATH);

    try {
        // 加载当前规则
        const currentRule = controller.getCurrentRule();

        if (currentRule) {
            console.log(`✅ 当前活跃规则: ${currentRule.id}`);
            console.log(`   规则说明: ${currentRule.segment.notes}`);
            console.log(`   开始时间: ${currentRule.segment.start_local}`);
            console.log(`   结束时间: ${currentRule.segment.end_local}`);

            console.log('\n   资金费率规则:');
            currentRule.ops.funding.forEach(rule => {
                console.log(`     - ${rule.type}: ${JSON.stringify(rule)}`);
            });

            console.log('\n   价格规则:');
            currentRule.ops.price.forEach(rule => {
                console.log(`     - ${rule.type}: ${JSON.stringify(rule)}`);
            });

        } else {
            console.log('⚠️  当前无活跃规则');
        }

        // 显示规则历史
        const history = controller.getRuleHistory();
        if (history.length > 0) {
            console.log(`\n📈 最近规则历史 (${history.length} 条):`);
            history.slice(-5).forEach(record => {
                console.log(`   ${record.timestamp}: ${record.segmentId}`);
            });
        }

    } catch (error) {
        console.error('❌ 获取状态失败:', error.message);
    }
}

/**
 * 测试规则效果
 */
async function testRule(ruleId) {
    console.log(`🧪 测试规则效果: ${ruleId}`);

    if (!AVAILABLE_RULES[ruleId]) {
        console.error(`❌ 规则不存在: ${ruleId}`);
        return;
    }

    const rule = AVAILABLE_RULES[ruleId];
    console.log(`\n📋 规则配置:`);
    console.log(`   描述: ${rule.description}`);
    
    const fundingScale = (rule.funding && rule.funding[0] && rule.funding[0].type === 'scale') ? rule.funding[0].value : 1.0;
    console.log(`   资金费率缩放: ${fundingScale}倍`);
    
    const priceOffset = (rule.price && rule.price[0] && rule.price[0].type === 'target_spread_pct') ? rule.price[0].value : 0.0;
    console.log(`   价差偏移: ${(priceOffset * 100).toFixed(2)}%`);

    console.log('\n🔍 效果预览:');

    // 模拟资金费率效果
    const originalRate = 0.0001;
    const scaledRate = originalRate * fundingScale;
    console.log(`   资金费率: ${originalRate} -> ${scaledRate} (${((scaledRate / originalRate - 1) * 100).toFixed(1)}%)`);

    // 模拟价格效果
    const originalPrice = 1.0;
    const modifiedPrice = originalPrice * (1 + priceOffset);
    console.log(`   价格偏移: ${originalPrice} -> ${modifiedPrice} (${((modifiedPrice / originalPrice - 1) * 100).toFixed(2)}%)`);

    // 模拟噪声效果
    if (rule.price && rule.price[1]) {
        const noise = (Math.random() - 0.5) * rule.price[1].amplitude;
        const noisyPrice = modifiedPrice * (1 + noise);
        console.log(`   噪声影响: ${modifiedPrice} -> ${noisyPrice} (噪声: ${(noise * 100).toFixed(3)}%)`);
    }

    console.log('\n💡 提示: 使用 "switch" 命令应用此规则');
}

/**
 * 主函数
 */
async function main() {
    if (args.length === 0 || command === 'help' || command === '-h' || command === '--help') {
        showHelp();
        return;
    }

    try {
        switch (command) {
            case 'switch':
                const ruleId = args[1];
                const duration = args[2] ? parseInt(args[2]) : 60;
                if (!ruleId) {
                    console.error('❌ 请指定规则ID');
                    process.exit(1);
                }
                await switchRule(ruleId, duration);
                break;

            case 'list':
                listRules();
                break;

            case 'status':
                await showStatus();
                break;

            case 'test':
                const testRuleId = args[1];
                if (!testRuleId) {
                    console.error('❌ 请指定规则ID');
                    process.exit(1);
                }
                await testRule(testRuleId);
                break;

            case 'create':
                const createRuleId = args[1];
                const createDesc = args.slice(2).join(' ') || '自定义规则';
                if (!createRuleId) {
                    console.error('❌ 请指定规则ID');
                    process.exit(1);
                }
                await createRule(createRuleId, createDesc);
                break;

            default:
                console.error(`❌ 未知命令: ${command}`);
                showHelp();
                process.exit(1);
        }

    } catch (error) {
        console.error('❌ 执行出错:', error.message);
        process.exit(1);
    }
}

// 运行主函数
main();