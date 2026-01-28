#!/usr/bin/env node

/**
 * 增强版Live Runner - 支持动态规则切换
 * 每分钟增量处理：下载 → 混合（动态规则）→ 信号生成 → 策略执行 → 注入
 */

const fs = require('fs');
const { spawn } = require('child_process');
const path = require('path');
const { MixerController } = require('./mixer_controller');

/**
 * 增强版Live Runner - 支持动态规则切换
 * 每分钟增量处理：下载 → 混合（动态规则）→ 信号生成 → 策略执行 → 注入
 */
class EnhancedLiveRunner {
    constructor() {
        this.mixerController = new MixerController(
            path.join(__dirname, 'config/mixer/demo_mix_trx_okx_binance.json')
        );
        this.isRunning = false;
        this.currentRule = null;
        this.startTime = null;
        this.lastCycleTime = null;

        const processArgs = process.argv.slice(2);
        // 配置
        this.config = {
            hedgeConfig: processArgs.find(a => a.startsWith('--hedge='))?.split('=')[1] || 'config/hedge/demo_hedge_trx_binance_okx.json',
            strategyConfig: processArgs.find(a => a.startsWith('--strategy='))?.split('=')[1] || 'config/strategy/demo_strategy_funding_trx.json',
            lookback: processArgs.find(a => a.startsWith('--lookback='))?.split('=')[1] || 60,
            interval: 60000,
            maxRetries: 3,
            retryDelayMs: 5000
        };
        this.ruleHistoryPath = path.join(__dirname, 'config/mixer/demo_mix_trx_okx_binance_history.json');
        this.activeSegment = null;
        this.cycleCount = 0;

        // MODE SELECTION: Default to live-only (filter history) unless --full-replay is passed
        const isFullReplay = processArgs.includes('--full-replay');
        this.bootTime = isFullReplay ? 0 : Date.now();

        if (isFullReplay) {
            console.log('📖 [Mode] Full History Replay Enabled (All signals will be generated)');
        } else {
            console.log('⚡ [Mode] Live Test Enabled (Filtering out market history before start)');
        }
    }

    /**
     * 启动增强版实时循环
     */
    async start() {
        this.isRunning = true;
        this.startTime = Date.now();
        this.cycleCount = 0;

        console.log('🚀 启动增强版实时循环（分钟级 + 动态规则）');
        console.log(`[LiveRunner] 周期间隔: ${this.config.interval}ms`);
        console.log(`[LiveRunner] 最大重试次数: ${this.config.maxRetries}`);
        console.log(`[LiveRunner] 对冲配置: ${this.config.hedgeConfig}`);
        console.log(`[LiveRunner] 策略配置: ${this.config.strategyConfig}`);

        while (this.isRunning) {
            const cycleStart = Date.now();
            this.cycleCount++;

            console.log(`\n🔄 [LiveRunner] 第 ${this.cycleCount} 周期开始`);
            console.log(`[LiveRunner] 开始时间: ${new Date(cycleStart).toLocaleTimeString()}`);

            try {
                await this.runSingleCycle();

                // 计算并等待剩余时间
                const cycleElapsed = Date.now() - cycleStart;
                const remainingTime = this.config.interval - cycleElapsed;

                if (remainingTime > 0) {
                    console.log(`[LiveRunner] 周期完成，等待 ${remainingTime}ms`);
                    await this.sleep(remainingTime);
                } else {
                    console.warn(`[LiveRunner] 周期超时 ${-remainingTime}ms`);
                }

                this.lastCycleTime = Date.now();

            } catch (error) {
                console.error(`[LiveRunner] 第 ${this.cycleCount} 周期失败:`, error.message);
                await this.handleError(error, cycleStart);
            }
        }

        console.log('[LiveRunner] 实时循环已停止');
    }

    /**
     * 执行单个周期
     */
    async runSingleCycle() {
        let step = '初始化';

        try {
            // 1. 检查并加载当前活跃规则
            step = '加载混合规则';
            console.log(`\n[LiveRunner] Step 1: ${step}`);
            const newRule = await this.mixerController.loadRules();
            if (newRule && newRule.id !== this.currentRule?.id) {
                console.log(`[LiveRunner] ✅ 检测到规则变化: ${this.currentRule?.id || '无'} -> ${newRule.id}`);
                this.currentRule = newRule;
            } else if (this.currentRule) {
                console.log(`[LiveRunner] 当前规则保持不变: ${this.currentRule.id}`);
            } else {
                console.log('[LiveRunner] 首次运行，使用当前活跃规则');
                this.currentRule = newRule;
            }

            // 2. 增量下载最新数据
            step = '增量下载数据';
            console.log(`\n[LiveRunner] Step 2: ${step}`);
            await this.runScript('download_data.js', [`--config=${this.config.hedgeConfig}`]);

            // 3. 使用动态规则混合数据
            step = '应用动态混合规则';
            console.log(`\n[LiveRunner] Step 3: ${step}`);
            if (this.currentRule || this.bootTime === 0) {
                await this.runScript('mixer_dynamic.js');
            } else {
                console.warn('[LiveRunner] 无活跃规则，跳过混合步骤');
                await this.runScript('mixer.js'); // 回退到默认mixer
            }

            // 4. 生成交易信号
            step = '生成交易信号';
            console.log(`\n[LiveRunner] Step 4: ${step}`);
            // FIXED: Now passing Strategy Config instead of Hedge Config to ensure merged logic is used
            await this.runScript('scheduler.js', [
                `--config=${this.config.strategyConfig}`,
                '--data-dir=data_mixed/demo_mix_trx_okx_binance',
                `--skip-before=${this.bootTime}`,
                `--lookback=${this.config.lookback}`
            ]);

            // 5. 执行策略并注入Mock Server
            step = '执行策略并注入';
            console.log(`\n[LiveRunner] Step 5: ${step}`);
            await this.runScript('strategy.js', [
                `--config=${this.config.strategyConfig}`,
                `--skip-before=${this.bootTime}`
            ]);

            // 6. 计算资金费率收益
            step = '计算资金费率收益';
            console.log(`\n[LiveRunner] Step 6: ${step}`);
            
            const fundingArgs = [
                `--config=${this.config.strategyConfig}`,
                `--data-dir=data_mixed/${this.activeSegment ? this.activeSegment.id : 'demo_mix_trx_okx_binance'}`,
                '--lookback=60',
                `--skip-before=${this.bootTime}`
            ];

            // If Full Replay and First Cycle, force reset funding state
            if (this.bootTime === 0 && this.cycleCount === 1) {
                fundingArgs.push('--reset');
            }

            await this.runScript('strategy_funding.js', fundingArgs);

            console.log(`\n✅ [LiveRunner] 第 ${this.cycleCount} 周期完成`);

        } catch (error) {
            console.error(`[LiveRunner] 步骤 "${step}" 失败:`, error.message);
            throw error;
        }
    }

    /**
     * 错误处理
     */
    async handleError(error, cycleStart) {
        console.error('[LiveRunner] 开始错误处理流程');

        for (let retry = 1; retry <= this.config.maxRetries; retry++) {
            console.log(`[LiveRunner] 重试 ${retry}/${this.config.maxRetries}`);

            try {
                await this.sleep(this.config.retryDelayMs);
                await this.runSingleCycle();
                console.log(`[LiveRunner] 重试 ${retry} 成功`);
                return;
            } catch (retryError) {
                console.error(`[LiveRunner] 重试 ${retry} 失败:`, retryError.message);
                if (retry === this.config.maxRetries) {
                    console.error('[LiveRunner] 达到最大重试次数，跳过本周期');
                }
            }
        }

        // 记录错误统计
        this.logError(error, cycleStart);
    }

    /**
     * 记录错误信息
     */
    logError(error, cycleStart) {
        const errorLog = {
            timestamp: new Date().toISOString(),
            cycle: this.cycleCount,
            error: error.message,
            stack: error.stack,
            cycleStart: new Date(cycleStart).toISOString(),
            currentRule: this.currentRule?.id,
            uptime: Date.now() - this.startTime
        };

        const errorLogPath = path.join(__dirname, 'logs', `error_${Date.now()}.json`);
        try {
            if (!fs.existsSync(path.dirname(errorLogPath))) {
                fs.mkdirSync(path.dirname(errorLogPath), { recursive: true });
            }
            fs.writeFileSync(errorLogPath, JSON.stringify(errorLog, null, 2));
            console.log(`[LiveRunner] 错误日志已保存: ${errorLogPath}`);
        } catch (logError) {
            console.error('[LiveRunner] 保存错误日志失败:', logError.message);
        }
    }

    /**
     * 规则切换接口（用于手动控制）
     */
    async switchRule(segmentId, durationMinutes = 60) {
        console.log(`[LiveRunner] 收到规则切换请求: ${segmentId}`);
        const success = await this.mixerController.switchRule(segmentId, durationMinutes);

        if (success) {
            console.log(`[LiveRunner] 规则切换成功，将在下个周期生效`);
            // 可选：立即执行一个周期
            console.log('[LiveRunner] 立即执行新规则周期...');
            await this.runSingleCycle();
        } else {
            console.error(`[LiveRunner] 规则切换失败: ${segmentId}`);
        }

        return success;
    }

    /**
     * 获取运行状态
     */
    getStatus() {
        const now = Date.now();
        return {
            isRunning: this.isRunning,
            cycleCount: this.cycleCount,
            startTime: this.startTime ? new Date(this.startTime).toISOString() : null,
            lastCycleTime: this.lastCycleTime ? new Date(this.lastCycleTime).toISOString() : null,
            currentRule: this.currentRule,
            uptime: this.startTime ? now - this.startTime : 0,
            nextCycleIn: this.lastCycleTime ? Math.max(0, this.config.intervalMs - (now - this.lastCycleTime)) : 0
        };
    }

    /**
     * 停止运行
     */
    stop() {
        console.log('[LiveRunner] 收到停止信号');
        this.isRunning = false;

        // 保存规则历史
        if (this.mixerController) {
            this.mixerController.saveRuleHistory();
        }

        console.log('[LiveRunner] 正在停止...');
    }

    /**
     * 执行脚本
     */
    async runScript(scriptName, args = []) {
        return new Promise((resolve, reject) => {
            const scriptPath = path.join(__dirname, scriptName);
            console.log(`\n[LiveRunner] >>> 运行 ${scriptName} ${args.join(' ')}`);

            const child = spawn('node', [scriptPath, ...args], {
                cwd: __dirname,
                stdio: 'inherit'
            });

            child.on('close', (code) => {
                if (code === 0) {
                    console.log(`[LiveRunner] <<< ${scriptName} 完成`);
                    resolve();
                } else {
                    console.error(`[LiveRunner] !!! ${scriptName} 退出码: ${code}`);
                    reject(new Error(`脚本执行失败: ${scriptName} (退出码: ${code})`));
                }
            });

            child.on('error', (err) => {
                console.error(`[LiveRunner] 启动失败: ${scriptName}`, err.message);
                reject(err);
            });
        });
    }

    /**
     * 休眠
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// 命令行接口
if (require.main === module) {
    const runner = new EnhancedLiveRunner();

    // 处理SIGINT (Ctrl+C)
    process.on('SIGINT', () => {
        console.log('\n[LiveRunner] 收到中断信号，正在优雅关闭...');
        runner.stop();
        setTimeout(() => {
            console.log('[LiveRunner] 已停止');
            process.exit(0);
        }, 2000);
    });

    // 启动
    runner.start().catch(error => {
        console.error('[LiveRunner] 启动失败:', error);
        process.exit(1);
    });
}

module.exports = { EnhancedLiveRunner };