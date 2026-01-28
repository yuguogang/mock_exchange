const fs = require('fs');
const path = require('path');

/**
 * Mixer Controller - 动态规则管理器
 * 支持实时加载、切换和更新混合规则
 */
class MixerController {
    constructor(configPath) {
        this.configPath = configPath;
        this.activeRules = new Map();
        this.ruleHistory = [];
        this.lastCheckTime = 0;
        this.checkInterval = 5000; // 每5秒检查一次规则变化
    }

    /**
     * 解析本地时间字符串为UTC时间戳
     */
    parseLocalTime(timeStr, timezone) {
        // 简单处理上海时间，其他默认为本地时间
        if (timezone === 'Asia/Shanghai') {
            const isoStr = timeStr.replace(' ', 'T') + ':00+08:00';
            return new Date(isoStr).getTime();
        }
        return new Date(timeStr).getTime();
    }

    /**
     * 根据时间戳获取对应的规则段（支持历史/回放模式）
     */
    getRuleAtTimestamp(ts) {
        try {
            const config = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
            const timezone = config.timezone || 'UTC';

            // 找到匹配该时间戳的规则
            const activeSegment = config.segments.find(seg => {
                const start = this.parseLocalTime(seg.start_local, timezone);
                const end = this.parseLocalTime(seg.end_local, timezone);
                return ts >= start && ts <= end;
            });

            return activeSegment || null;
        } catch (e) {
            return null;
        }
    }

    /**
     * 动态加载当前时间段的活跃规则
     */
    async loadRules() {
        try {
            const config = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
            const timezone = config.timezone || 'UTC';
            const now = new Date().getTime();

            // 找到当前时间段的活跃规则
            const activeSegment = config.segments.find(seg => {
                const start = this.parseLocalTime(seg.start_local, timezone);
                const end = this.parseLocalTime(seg.end_local, timezone);
                return now >= start && now <= end;
            });

            if (activeSegment) {
                const ruleKey = `${activeSegment.id}_${now.getTime()}`;

                // 检查是否是新规则
                if (!this.activeRules.has('current') ||
                    this.activeRules.get('current').id !== activeSegment.id) {

                    console.log(`[MixerController] 激活新规则: ${activeSegment.id}`);
                    console.log(`[MixerController] 规则说明: ${activeSegment.notes}`);
                    console.log(`[MixerController] 规则配置:`, JSON.stringify(activeSegment.ops, null, 2));

                    this.activeRules.set('current', {
                        id: activeSegment.id,
                        ops: activeSegment.ops,
                        segment: activeSegment
                    });

                    // 记录规则历史
                    this.ruleHistory.push({
                        timestamp: now.toISOString(),
                        segmentId: activeSegment.id,
                        rules: activeSegment.ops
                    });
                }

                return this.activeRules.get('current');
            } else {
                console.warn('[MixerController] 未找到当前时间段的活跃规则');
                return null;
            }
        } catch (error) {
            console.error('[MixerController] 加载规则失败:', error.message);
            return null;
        }
    }

    /**
     * 手动切换规则（用于测试和调试）
     */
    async switchRule(segmentId, durationMinutes = 60) {
        try {
            const config = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
            const targetSeg = config.segments.find(s => s.id === segmentId);

            if (!targetSeg) {
                console.error(`[MixerController] 未找到规则段: ${segmentId}`);
                return false;
            }

            // 更新时间范围到当前时间
            const now = new Date();
            const startTime = new Date(now.getTime() - 60000); // 1分钟前开始，确保立即生效
            const endTime = new Date(now.getTime() + durationMinutes * 60000);

            // 辅助函数：生成本地时间字符串 YYYY-MM-DD HH:mm
            const toLocalString = (date) => {
                const pad = (n) => n.toString().padStart(2, '0');
                return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
            };

            // 更新配置中的时间范围 (改用本地时间，杜绝 UTC 偏移)
            targetSeg.start_local = toLocalString(startTime);
            targetSeg.end_local = toLocalString(endTime);

            // 保存配置
            fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));

            console.log(`[MixerController] 手动切换规则成功: ${segmentId}`);
            console.log(`[MixerController] 新时间范围: ${targetSeg.start_local} 至 ${targetSeg.end_local}`);

            // 立即加载新规则
            await this.loadRules();
            return true;

        } catch (error) {
            console.error('[MixerController] 切换规则失败:', error.message);
            return false;
        }
    }

    /**
     * 获取当前活跃规则
     */
    getCurrentRule() {
        return this.activeRules.get('current') || null;
    }

    /**
     * 获取规则历史记录
     */
    getRuleHistory() {
        return this.ruleHistory;
    }

    /**
     * 保存规则变更历史
     */
    saveRuleHistory() {
        const historyPath = this.configPath.replace('.json', '_history.json');
        fs.writeFileSync(historyPath, JSON.stringify(this.ruleHistory, null, 2));
        console.log(`[MixerController] 规则历史已保存至: ${historyPath}`);
    }

    /**
     * 创建新规则段（高级功能）
     */
    async createRuleSegment(id, startLocal, endLocal, ops, priority = 10, notes = '') {
        try {
            const config = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));

            // 如果ID已存在，则进入“更新模式”
            const existingIdx = config.segments.findIndex(s => s.id === id);

            const newSegment = {
                id,
                start_local: startLocal,
                end_local: endLocal,
                target: {
                    exchange: "okx",
                    symbol: "TRX-USDT-SWAP",
                    metrics: ["funding", "price"]
                },
                ops,
                priority,
                notes
            };

            if (existingIdx !== -1) {
                console.log(`[MixerController] 更新已有规则段: ${id}`);
                config.segments[existingIdx] = newSegment;
            } else {
                config.segments.push(newSegment);
            }

            // 按优先级排序
            config.segments.sort((a, b) => b.priority - a.priority);

            fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));

            console.log(`[MixerController] 创建新规则段成功: ${id}`);
            return true;

        } catch (error) {
            console.error('[MixerController] 创建规则段失败:', error.message);
            return false;
        }
    }

    /**
     * 验证规则配置
     */
    validateRule(ops) {
        const required = ['funding', 'price'];
        const valid = required.every(key => ops[key] && Array.isArray(ops[key]));

        if (!valid) {
            console.error('[MixerController] 规则验证失败: 缺少必需的funding或price配置');
            return false;
        }

        // 验证funding规则
        if (ops.funding) {
            for (const rule of ops.funding) {
                if (!rule.type || !['scale', 'offset', 'clamp'].includes(rule.type)) {
                    console.error('[MixerController] 无效的funding规则类型:', rule.type);
                    return false;
                }
            }
        }

        // 验证price规则
        if (ops.price) {
            for (const rule of ops.price) {
                if (!rule.type || !['target_spread_pct', 'noise'].includes(rule.type)) {
                    console.error('[MixerController] 无效的price规则类型:', rule.type);
                    return false;
                }
            }
        }

        return true;
    }
}

module.exports = { MixerController };