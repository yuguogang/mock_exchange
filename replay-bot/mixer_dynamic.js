const fs = require('fs');
const path = require('path');
const { MixerController } = require('./mixer_controller');

/**
 * 增强版Mixer - 支持动态规则加载和应用
 * 每分钟增量处理数据并应用当前活跃规则
 */

// 配置
const MIXER_CONFIG_PATH = path.join(__dirname, 'config/mixer/demo_mix_trx_okx_binance.json');
const DATA_DIR = path.join(__dirname, 'data');
const MIXED_DATA_DIR = path.join(__dirname, 'data_mixed/demo_mix_trx_okx_binance');

// 确保输出目录存在
if (!fs.existsSync(MIXED_DATA_DIR)) {
    fs.mkdirSync(MIXED_DATA_DIR, { recursive: true });
}

/**
 * 加载数据文件
 */
function loadDataFile(filename) {
    const filepath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(filepath)) {
        console.error(`[Mixer] 数据文件不存在: ${filename}`);
        return [];
    }
    try {
        return JSON.parse(fs.readFileSync(filepath, 'utf8'));
    } catch (error) {
        console.error(`[Mixer] 加载数据文件失败: ${filename}`, error.message);
        return [];
    }
}

/**
 * 保存混合数据
 */
function saveMixedData(filename, data) {
    const filepath = path.join(MIXED_DATA_DIR, filename);
    try {
        fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
        console.log(`[Mixer] 保存混合数据: ${filename} (${data.length} 条记录)`);
    } catch (error) {
        console.error(`[Mixer] 保存混合数据失败: ${filename}`, error.message);
    }
}

/**
 * 应用资金费率规则
 */
function applyFundingRules(rate, rules) {
    let modifiedRate = rate;

    for (const rule of rules) {
        switch (rule.type) {
            case 'scale':
                modifiedRate *= rule.value;
                console.log(`[Mixer] 资金费率缩放: ${rate} -> ${modifiedRate} (倍数: ${rule.value})`);
                break;
            case 'offset':
                modifiedRate += rule.value;
                console.log(`[Mixer] 资金费率偏移: ${rate} -> ${modifiedRate} (偏移: ${rule.value})`);
                break;
            case 'clamp':
                const original = modifiedRate;
                modifiedRate = Math.max(rule.min, Math.min(rule.max, modifiedRate));
                if (original !== modifiedRate) {
                    console.log(`[Mixer] 资金费率限制: ${original} -> ${modifiedRate} (范围: [${rule.min}, ${rule.max}])`);
                }
                break;
        }
    }

    return modifiedRate;
}

/**
 * 应用价格规则
 */
function applyPriceRules(price, rules) {
    let modifiedPrice = price;

    for (const rule of rules) {
        switch (rule.type) {
            case 'target_spread_pct':
                const original = modifiedPrice;
                modifiedPrice *= (1 + rule.value);
                console.log(`[Mixer] 目标价差调整: ${original} -> ${modifiedPrice} (价差: ${(rule.value * 100).toFixed(3)}%)`);
                break;
            case 'noise':
                if (rule.mode === 'gaussian') {
                    // 使用Box-Muller变换生成高斯噪声
                    const u1 = Math.random();
                    const u2 = Math.random();
                    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
                    const noise = z0 * rule.amplitude;
                    modifiedPrice *= (1 + noise);
                    console.log(`[Mixer] 高斯噪声: ${price} -> ${modifiedPrice} (幅度: ${rule.amplitude})`);
                } else {
                    // 默认均匀噪声
                    const noise = (Math.random() - 0.5) * rule.amplitude;
                    modifiedPrice *= (1 + noise);
                    console.log(`[Mixer] 均匀噪声: ${price} -> ${modifiedPrice} (幅度: ${rule.amplitude})`);
                }
                break;
        }
    }

    return modifiedPrice;
}

/**
 * 主函数 - 动态混合数据
 */
async function runDynamicMixer() {
    console.log('\n=== 启动动态数据混合器 ===');
    console.log(`[Mixer] 配置路径: ${MIXER_CONFIG_PATH}`);

    // 初始化控制器
    const controller = new MixerController(MIXER_CONFIG_PATH);

    // 加载当前活跃规则 (使用标准化的本地时间匹配逻辑)
    let currentRule = await controller.loadRules();
    if (!currentRule) {
        console.log('[Mixer] 未找到当前系统时间对应的规则，进入离线回放模式（仅基于数据时间戳匹配规则）');
        // 构造一个虚拟的规则对象，防止后续报错
        currentRule = {
            id: 'OFFLINE_REPLAY',
            segment: { notes: '离线回放模式，基于数据时间戳动态应用规则' },
            ops: { funding: [], price: [] } 
        };
    }

    console.log(`[Mixer] 当前规则ID: ${currentRule.id}`);
    console.log(`[Mixer] 规则说明: ${currentRule.segment.notes}`);

    // 验证规则
    if (!controller.validateRule(currentRule.ops)) {
        console.error('[Mixer] 规则验证失败');
        return;
    }

    // 处理每个目标文件
    const targetFiles = [
        'binance_TRXUSDT.json',
        'binance_funding_TRXUSDT.json',
        'okx_TRX-USDT-SWAP.json',
        'okx_funding_TRX-USDT-SWAP.json'
    ];

    for (const filename of targetFiles) {
        console.log(`\n[Mixer] 处理文件: ${filename}`);

        const data = loadDataFile(filename);
        if (data.length === 0) {
            console.warn(`[Mixer] 跳过空文件: ${filename}`);
            continue;
        }

        // 应用规则
        const mixedData = data.map(item => {
            const mixedItem = { ...item };

            // 记录原始值
            mixedItem._original_rate = item.rate;
            mixedItem._original_price = item.price;

            // 动态寻找该时间点对应的规则
            const ruleAtTime = controller.getRuleAtTimestamp(item.ts);

            // 关键：只有当该规则的 Target 匹配当前正在处理的文件所属交易所/币种时，才应用修改
            const isTargetMatch = ruleAtTime &&
                ruleAtTime.target.exchange === (filename.startsWith('binance') ? 'binance' : 'okx') &&
                filename.includes(ruleAtTime.target.symbol.replace('-USDT-SWAP', ''));

            if (isTargetMatch) {
                mixedItem._segment = ruleAtTime.id;
                mixedItem._mixed_at = new Date(item.ts).toISOString();

                // 应用资金费率规则（仅对 Target 腿生效）
                if (filename.includes('funding') && ruleAtTime.ops.funding && item.rate !== undefined) {
                    mixedItem.rate = applyFundingRules(item.rate, ruleAtTime.ops.funding);
                }

                // 应用价格规则（仅对 Target 腿生效）
                if (!filename.includes('funding') && ruleAtTime.ops.price && item.price !== undefined) {
                    mixedItem.price = applyPriceRules(item.price, ruleAtTime.ops.price);
                }
            } else {
                mixedItem._segment = ruleAtTime ? `passive_${ruleAtTime.id}` : "default";
            }

            return mixedItem;
        });

        // 保存混合数据
        saveMixedData(filename, mixedData);

        // 生成统计信息
        console.log(`[Mixer] 混合统计: ${filename}`);
        console.log(`[Mixer]   原始记录数: ${data.length}`);
        console.log(`[Mixer]   混合记录数: ${mixedData.length}`);
        console.log(`[Mixer]   应用规则: ${currentRule.id}`);

        if (mixedData.some(item => item._original_rate !== undefined)) {
            const rateChanges = mixedData.filter(item => item.rate !== item._original_rate);
            console.log(`[Mixer]   资金费率变更: ${rateChanges.length} 条`);
        }

        if (mixedData.some(item => item._original_price !== undefined)) {
            const priceChanges = mixedData.filter(item => item.price !== item._original_price);
            console.log(`[Mixer]   价格变更: ${priceChanges.length} 条`);
        }
    }

    // 保存规则历史
    controller.saveRuleHistory();

    console.log('\n[Mixer] 动态混合完成');
    console.log(`[Mixer] 活跃规则: ${currentRule.id}`);
    console.log(`[Mixer] 下次检查: ${new Date(Date.now() + 60000).toLocaleTimeString()}`);
}

/**
 * 生成混合报告
 */
function generateMixReport(controller) {
    const history = controller.getRuleHistory();
    const report = {
        timestamp: new Date().toISOString(),
        total_rules_applied: history.length,
        current_rule: controller.getCurrentRule(),
        rule_history: history.slice(-10), // 最近10条记录
        summary: {
            by_segment: {}
        }
    };

    // 统计各规则段使用次数
    history.forEach(record => {
        const segment = record.segmentId;
        report.summary.by_segment[segment] = (report.summary.by_segment[segment] || 0) + 1;
    });

    return report;
}

/**
 * 验证混合结果
 */
function validateMixedData(originalData, mixedData, rule) {
    const validation = {
        total_records: mixedData.length,
        unchanged_records: 0,
        modified_records: 0,
        errors: []
    };

    for (let i = 0; i < mixedData.length; i++) {
        const mixed = mixedData[i];
        const original = originalData[i];

        if (!mixed || !original) {
            validation.errors.push(`记录 ${i}: 数据缺失`);
            continue;
        }

        // 检查时间戳一致性
        if (mixed.ts !== original.ts) {
            validation.errors.push(`记录 ${i}: 时间戳不匹配 ${original.ts} != ${mixed.ts}`);
        }

        // 检查是否有变更
        const hasChanges = (mixed.rate !== original.rate) || (mixed.price !== original.price);
        if (hasChanges) {
            validation.modified_records++;
        } else {
            validation.unchanged_records++;
        }

        // 检查必需字段
        if (!mixed._segment || !mixed._mixed_at) {
            validation.errors.push(`记录 ${i}: 缺少混合元数据`);
        }
    }

    return validation;
}

// 主函数
if (require.main === module) {
    runDynamicMixer().catch(error => {
        console.error('[Mixer] 动态混合器运行失败:', error);
        process.exit(1);
    });
}

module.exports = {
    runDynamicMixer,
    applyFundingRules,
    applyPriceRules,
    validateMixedData,
    generateMixReport
};
