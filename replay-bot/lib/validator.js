/**
 * 配置验证模块
 * 验证配置文件必要字段
 */

function validateHedgeConfig(config) {
    const errors = [];

    if (!config || typeof config !== 'object') {
        return { valid: false, errors: ['配置必须是对象'] };
    }

    if (!config.hedge_name) errors.push('缺少 hedge_name');
    if (!Array.isArray(config.legs) || config.legs.length === 0) {
        errors.push('legs 必须是非空数组');
    } else {
        config.legs.forEach((leg, i) => {
            if (!leg.exchange) errors.push(`legs[${i}] 缺少 exchange`);
            if (!leg.symbol) errors.push(`legs[${i}] 缺少 symbol`);
            if (!leg.role) errors.push(`legs[${i}] 缺少 role`);
        });
    }
    if (!config.outputs) errors.push('缺少 outputs 配置');

    return { valid: errors.length === 0, errors };
}

function validateStrategyConfig(config) {
    const errors = [];

    if (!config || typeof config !== 'object') {
        return { valid: false, errors: ['配置必须是对象'] };
    }

    if (!config.hedge_ref) errors.push('缺少 hedge_ref');
    if (!config.params) errors.push('缺少 params');

    return { valid: errors.length === 0, errors };
}

function validateMixerConfig(config) {
    const errors = [];

    if (!config || typeof config !== 'object') {
        return { valid: false, errors: ['配置必须是对象'] };
    }

    if (!config.mix_name) errors.push('缺少 mix_name');
    if (!Array.isArray(config.segments)) errors.push('缺少 segments 数组');

    return { valid: errors.length === 0, errors };
}

module.exports = { validateHedgeConfig, validateStrategyConfig, validateMixerConfig };
