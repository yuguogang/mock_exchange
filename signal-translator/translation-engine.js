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

        const { action, type, sessionId, id, timestamp, ts, legs } = signal;
        // Normalize timestamp: prefer 'ts' but fallback to 'timestamp'
        const normalizedTs = ts || timestamp;

        console.log(`[DEBUG] Translating ${type} ${sessionId}. Action=${action}. SessionStateKeys=[${Array.from(this.sessionState.keys())}]`);

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
        } else if (type === 'CLOSE' && this.sessionState.has(sessionId)) {
            // Implicit CLOSE action: Reverse the sides from the session
            const session = this.sessionState.get(sessionId);
            sideA = session.sideA === 'SELL' ? 'BUY' : 'SELL';
            sideB = session.sideB === 'SELL' ? 'BUY' : 'SELL';
        } else if (type === 'OPEN' || type === 'CLOSE') {
            return results;
        }

        const session = this.sessionState.get(sessionId);

        // Qty Calculation
        let baseQtyA, baseQtyB;
        if (type === 'OPEN') {
            const fundingParams = (this.config.strategy && this.config.strategy.params && this.config.strategy.params.funding) || {};
            const execParams = (this.config.strategy && this.config.strategy.params && this.config.strategy.params.execution) || {};
            const posSize = (execParams.order_notional_usdt ?? fundingParams.position_size_usdt ?? 10000);
            const approxPrice = (execParams.approx_price ?? fundingParams.approx_price ?? 0.3);

            let priceA = approxPrice;
            let priceB = approxPrice;

            if (legs && legs.length >= 2) {
                // Assuming leg order matches config leg order, or by exchange name match if possible
                // Config: legA (binance), legB (okx)
                // New Format legs: [{exchange: 'binance', price: ...}, {exchange: 'okx', price: ...}]

                const legAData = legs.find(l => l.exchange === legA.exchange);
                const legBData = legs.find(l => l.exchange === legB.exchange);

                if (legAData) priceA = legAData.price;
                if (legBData) priceB = legBData.price;
            } else {
                // Fallback to old keys
                priceA = signal.legA_price || signal.binancePrice || approxPrice;
                priceB = signal.legB_price || signal.okxPrice || approxPrice;
            }

            baseQtyA = posSize / priceA;
            baseQtyB = posSize / priceB;

            // Store in session state
            this.sessionState.set(sessionId, {
                startTime: normalizedTs,
                qtyA: baseQtyA,
                qtyA: baseQtyA,
                qtyB: baseQtyB,
                priceA,
                priceB,
                sideA,
                sideB
            });
        } else if (type === 'CLOSE') {
            if (session) {
                baseQtyA = session.qtyA;
                baseQtyB = session.qtyB;
                this.sessionState.delete(sessionId);
            } else {
                // Fallback if session not found
                const fundingParams = (this.config.strategy && this.config.strategy.params && this.config.strategy.params.funding) || {};
                const execParams = (this.config.strategy && this.config.strategy.params && this.config.strategy.params.execution) || {};
                const posSize = (execParams.order_notional_usdt ?? fundingParams.position_size_usdt ?? 10000);
                const approxPrice = (execParams.approx_price ?? fundingParams.approx_price ?? 0.3);

                // Try to extract price from signal for fallback
                let pA = approxPrice, pB = approxPrice;
                if (legs && legs.length >= 2) {
                    const legAData = legs.find(l => l.exchange === legA.exchange);
                    const legBData = legs.find(l => l.exchange === legB.exchange);
                    if (legAData) pA = legAData.price;
                    if (legBData) pB = legBData.price;
                } else {
                    pA = signal.legA_price || approxPrice;
                    pB = signal.legB_price || approxPrice;
                }

                baseQtyA = posSize / pA;
                baseQtyB = posSize / pB;
            }
        }

        // Determine prices for Orders (if needed for limit orders, though mock uses market usually)
        let finalPriceA = (session ? session.priceA : 0.3);
        let finalPriceB = (session ? session.priceB : 0.3);

        // If current prices are available in signal, use them? 
        // Mock server executes at 'current market price', but we send price in order object sometimes.
        // Let's stick to session entry price or signal price.
        if (legs && legs.length >= 2) {
            const legAData = legs.find(l => l.exchange === legA.exchange);
            const legBData = legs.find(l => l.exchange === legB.exchange);
            if (legAData) finalPriceA = legAData.price;
            if (legBData) finalPriceB = legBData.price;
        } else {
            if (signal.legA_price) finalPriceA = signal.legA_price;
            if (signal.legB_price) finalPriceB = signal.legB_price;
        }

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
                    price: finalPriceA,
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
                    price: finalPriceB,
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

        const closeTime = closeSignal.ts || closeSignal.timestamp;
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
        const fundingParams = (this.config.strategy && this.config.strategy.params && this.config.strategy.params.funding) || {};
        const execParams = (this.config.strategy && this.config.strategy.params && this.config.strategy.params.execution) || {};
        const posSize = (execParams.order_notional_usdt ?? fundingParams.position_size_usdt ?? 10000);
        const approxPrice = (execParams.approx_price ?? fundingParams.approx_price ?? 0.3);

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
