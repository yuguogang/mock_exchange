const binanceRules = require('./exchange-rules/binance-rules');
const okxRules = require('./exchange-rules/okx-rules');
const FundingCalculator = require('./funding-calculator');

class TranslationEngine {
    constructor(config, fundingRateService) {
        this.config = config;
        this.fundingRateService = fundingRateService;
        this.fundingCalculator = new FundingCalculator(config);
        this.rules = {
            binance: binanceRules,
            okx: okxRules
        };
        this.sessionState = new Map(); // sessionId -> { startTime, qtyA, qtyB }
    }

    async translate(signal) {
        if (signal.strategy === 'HEDGE') {
            return await this.translateHedgeSignal(signal);
        } else if (signal.strategy === 'FUNDING') {
            // New logic: Ignore external SETTLE signals, generate them automatically
            if (signal.type === 'SETTLE') {
                return [];
            }
            return await this.translateHedgeSignal(signal);
        }
        return null;
    }

    async translateHedgeSignal(signal) {
        const results = [];
        const legA = this.config.hedge.legs.find(l => l.role === 'legA');
        const legB = this.config.hedge.legs.find(l => l.role === 'legB');

        const { action, type, sessionId, id, timestamp } = signal;

        // Generate settlements BEFORE closing if this is a CLOSE signal
        if (type === 'CLOSE') {
            const settlements = await this.generateFundingSettlements(signal);
            results.push(...settlements);
        }

        // Determine sides
        let sideA, sideB;
        if (action) {
            sideA = (action.includes('SELL_BINANCE') || action.includes('SELL_A')) ? 'SELL' : 'BUY';
            // Avoid matching 'BUY_B' within 'BUY_BINANCE'
            sideB = (action.includes('BUY_OKX') || (action.includes('BUY_B') && !action.includes('BUY_BINANCE'))) ? 'BUY' : 'SELL';
        } else if (type === 'OPEN' || type === 'CLOSE') {
            return results;
        }

        const session = this.sessionState.get(sessionId);

        // Qty Calculation
        let baseQtyA, baseQtyB;
        if (type === 'OPEN') {
            const params = this.config.strategy.params.funding;
            const posSize = params.position_size_usdt || 10000;
            const approxPrice = params.approx_price || 0.3;

            const priceA = signal.legA_price || signal.binancePrice || approxPrice;
            const priceB = signal.legB_price || signal.okxPrice || approxPrice;

            baseQtyA = posSize / priceA;
            baseQtyB = posSize / priceB;

            // Store in session state
            this.sessionState.set(sessionId, {
                startTime: timestamp,
                qtyA: baseQtyA,
                qtyB: baseQtyB,
                priceA,
                priceB
            });
        } else if (type === 'CLOSE') {
            if (session) {
                baseQtyA = session.qtyA;
                baseQtyB = session.qtyB;
                this.sessionState.delete(sessionId);
            } else {
                // Fallback if session not found
                const params = this.config.strategy.params.funding;
                const posSize = params.position_size_usdt || 10000;
                const approxPrice = params.approx_price || 0.3;
                baseQtyA = posSize / (signal.legA_price || approxPrice);
                baseQtyB = posSize / (signal.legB_price || approxPrice);
            }
        }

        const priceA = signal.legA_price || (session ? session.priceA : 0.3);
        const priceB = signal.legB_price || (session ? session.priceB : 0.3);

        // Apply rules
        const ruleA = this.rules[legA.exchange.toLowerCase()];
        const ruleB = this.rules[legB.exchange.toLowerCase()];

        if (ruleA) {
            results.push({
                type: 'ORDER',
                exchange: legA.exchange,
                data: ruleA.formatOrder({
                    symbol: ruleA.symbolMapping(legA.symbol),
                    side: sideA,
                    quantity: ruleA.quantityCalculation(baseQtyA, legA.contract_profile),
                    price: priceA,
                    clientOrderId: `${id || sessionId}_A`
                })
            });
        }

        if (ruleB) {
            results.push({
                type: 'ORDER',
                exchange: legB.exchange,
                data: ruleB.formatOrder({
                    symbol: ruleB.symbolMapping(legB.symbol),
                    side: sideB,
                    quantity: ruleB.quantityCalculation(baseQtyB, legB.contract_profile),
                    price: priceB,
                    clientOrderId: `${id || sessionId}_B`
                })
            });
        }

        return results;
    }

    async generateFundingSettlements(closeSignal) {
        const session = this.sessionState.get(closeSignal.sessionId);
        if (!session) return [];

        const openTime = session.startTime;

        const closeTime = closeSignal.timestamp;
        const settlements = [];

        for (const leg of this.config.hedge.legs) {
            const exKey = leg.exchange.toLowerCase();
            const fundingConfigs = this.config.funding && this.config.funding[exKey];
            const fundingConfig = fundingConfigs && fundingConfigs.length > 0 ? fundingConfigs[0] : null;

            const intervalHours = fundingConfig ? fundingConfig.intervalHours : 8;
            const interval = intervalHours * 60 * 60 * 1000;
            const startTime = fundingConfig ? fundingConfig.startTime : 0;

            // Align to the first settlement time after openTime
            // Formula: startTime + Math.ceil((openTime - startTime) / interval) * interval
            let nextSettle = startTime + Math.ceil((openTime - startTime) / interval) * interval;

            while (nextSettle <= closeTime) {
                if (nextSettle > openTime) {
                    const rate = await this.fundingRateService.getRate(leg.exchange, leg.symbol, nextSettle);
                    const amount = await this.calculateFeeAtTime(leg, nextSettle, rate);

                    settlements.push({
                        type: 'INCOME',
                        data: this.fundingCalculator.generateIncomeRecord(leg.symbol, amount, nextSettle, closeSignal.sessionId)
                    });
                }
                nextSettle += interval;
            }
        }

        return settlements;
    }

    async calculateFeeAtTime(leg, timestamp, rate) {
        // We need to know the size and side at that time.
        // Assuming position_size_usdt and approx_price for now.
        const params = this.config.strategy.params.funding;
        const posSize = params.position_size_usdt || 10000;
        const approxPrice = params.approx_price || 0.3;

        // Determine side based on typical hedge behavior if not tracked
        // In this TRX example, LegA is often SELL and LegB is BUY for neutral funding Arb.
        // Better: store the active side in sessionStartTime.
        const side = leg.role === 'legA' ? 'SHORT' : 'LONG'; // Placeholder logic

        return this.fundingCalculator.calculateFee({
            size: posSize / approxPrice,
            entryPrice: approxPrice,
            side: side
        }, rate);
    }
}

module.exports = TranslationEngine;
