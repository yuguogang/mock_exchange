const fs = require('fs');
const path = require('path');

class BinanceAdapter {
    static getTime() {
        return Date.now();
    }

    /**
     * Map internal positions to Binance fapi/v2/positionRisk format
     */
    static getPositionRisk(internalPositions, internalPrices) {
        // If internalPositions is a Map, convert to array
        const positionsClient = [];

        internalPositions.forEach((pos, key) => {
            // Use symbol from position object if available, otherwise use Map key
            const symbol = pos.symbol || key;
            const currentPrice = internalPrices.get(symbol) || pos.entryPrice;
            const size = parseFloat(pos.size);
            const entryPrice = parseFloat(pos.entryPrice);

            // Calculate Unrealized PnL
            // (Current Price - Entry Price) * Position Size * Side Multiplier is NOT needed if size handles sign
            // But usually size is signed in our internal logic. 
            // Let's check internal logic: 
            // sideMultiplier = side === 'LONG' ? 1 : -1;
            // unRealizedProfit = (currentPrice - entryPrice) * size * sideMultiplier;

            // Wait, in our internal logic:
            // side 'LONG' -> multiplier 1
            // size is just magnitude? Let's check index.js
            // positions.set(symbol, { entryPrice, size, margin, side });
            // size seems to be magnitude in current code based on "size: qty * sideMultiplier" (Wait, if size is signed, then side is redundant for calc?)

            // Re-checking index.js:
            // const sideMultiplier = side.toUpperCase() === 'BUY' ? 1 : -1;
            // positions.set(symbol, { ..., size: qty * sideMultiplier, ... })
            // So size IS signed. AND we store side 'LONG'/'SHORT'.
            // Verify PnL logic in index.js: 
            // const sideMultiplier = side === 'LONG' ? 1 : -1;
            // const unRealizedProfit = (currentPrice - entryPrice) * size * sideMultiplier;
            // If size is -100 (SHORT) and side is SHORT (-1), then (-100 * -1) = 100. Correct.

            const sideMultiplier = pos.side === 'LONG' ? 1 : -1;
            const unRealizedProfit = (currentPrice - entryPrice) * size * sideMultiplier;
            const notional = Math.abs(size * currentPrice);

            positionsClient.push({
                symbol: symbol,
                positionAmt: String(size),
                entryPrice: String(entryPrice),
                markPrice: String(currentPrice),
                unRealizedProfit: unRealizedProfit.toFixed(4),
                liquidationPrice: "0", // Simplified
                leverage: "10",
                maxNotionalValue: "10000000",
                marginType: "cross",
                isolatedMargin: "0.00000000",
                isAutoAddMargin: "false",
                positionSide: "BOTH", // Binance usually uses BOTH in one-way mode, or LONG/SHORT in hedge mode. Let's use BOTH for simplicity or follow samples.
                // Sample used "LONG". If we are in hedge mode we need LONG and SHORT. 
                // Let's assume One-Way mode for now which is default for many.
                // Actually typical Binance response has positionSide: 'BOTH' for One-way.

                notional: String(notional),
                isolatedWallet: "0",
                updateTime: pos.updatedAt || BinanceAdapter.getTime()
            });
        });

        // Ensure we strictly follow the sample structure if needed, but array is standard.
        return positionsClient;
    }

    /**
     * Map internal trades to Binance fapi/v1/userTrades format
     */
    static getUserTrades(internalTrades) {
        return internalTrades.map(trade => ({
            symbol: trade.symbol,
            id: trade.id,
            orderId: trade.order_id, // DB uses snake_case: order_id
            side: trade.side,
            price: String(trade.price),
            qty: String(trade.qty),
            realizedPnl: "0", // Simplified
            marginAsset: "USDT",
            quoteQty: String(trade.price * trade.qty),
            commission: String(trade.commission),
            commissionAsset: trade.commission_asset, // DB uses snake_case: commission_asset
            time: trade.timestamp,
            positionSide: "BOTH", // Assuming One-way mode
            buyer: trade.side === 'BUY',
            maker: false
        }));
    }

    /**
     * Map internal orders to Binance fapi/v1/allOrders format
     */
    static getAllOrders(internalOrders) {
        return internalOrders.map(order => ({
            avgPrice: String(order.price), // Simplified
            clientOrderId: order.client_order_id || "web_12345",
            cumQuote: String(order.price * order.quantity),
            executedQty: String(order.quantity),
            orderId: order.id,
            origQty: String(order.quantity),
            origType: order.type || "LIMIT",
            price: String(order.price),
            reduceOnly: false,
            side: order.side,
            positionSide: "BOTH",
            status: order.status || "FILLED",
            stopPrice: "0",
            closePosition: false,
            symbol: order.symbol,
            time: order.timestamp,
            timeInForce: "GTC",
            type: order.type || "LIMIT",
            updateTime: order.timestamp,
            workingType: "CONTRACT_PRICE",
            priceProtect: false
        }));
    }

    /**
     * Map internal orders to Binance fapi/v1/openOrders format
     */
    static getOpenOrders(internalOrders) {
        return internalOrders.map(order => ({
            avgPrice: String(order.price),
            clientOrderId: order.client_order_id || "web_12345",
            cumQuote: "0",
            executedQty: "0",
            orderId: order.id,
            origQty: String(order.quantity),
            origType: order.type || "LIMIT",
            price: String(order.price),
            reduceOnly: false,
            side: order.side,
            positionSide: "BOTH",
            status: order.status || "NEW",
            stopPrice: "0",
            closePosition: false,
            symbol: order.symbol,
            time: order.timestamp,
            timeInForce: "GTC",
            type: order.type || "LIMIT",
            updateTime: order.timestamp,
            workingType: "CONTRACT_PRICE",
            priceProtect: false
        }));
    }

    /**
     * Generate Binance fapi/v2/balance format
     * Internal state doesn't fully track balance history, so we use the FIXED 10000 logic + PnL
     */
    static getBalance(internalPositions, internalPrices) {
        let totalUnrealizedProfit = 0;
        let totalMargin = 0;

        // Calculate totals
        internalPositions.forEach((pos, symbol) => {
            const currentPrice = internalPrices.get(symbol) || pos.entryPrice;
            const size = parseFloat(pos.size);
            const entryPrice = parseFloat(pos.entryPrice);
            const sideMultiplier = pos.side === 'LONG' ? 1 : -1;

            const pnl = (currentPrice - entryPrice) * size * sideMultiplier;
            totalUnrealizedProfit += pnl;
            totalMargin += parseFloat(pos.margin);
        });

        const initialBalance = parseFloat(process.env.MOCK_INITIAL_BALANCE || '10000');
        const walletBalance = initialBalance; // We are not tracking realized PnL yet, so wallet balance stays 10000
        const marginBalance = walletBalance + totalUnrealizedProfit;
        const availableBalance = Math.max(0, marginBalance - totalMargin);

        // Using snippet from samples/binance/balance.json as template
        return {
            feeTier: 0,
            canTrade: true,
            canDeposit: true,
            canWithdraw: true,
            updateTime: BinanceAdapter.getTime(),
            totalInitialMargin: String(totalMargin.toFixed(2)),
            totalMaintMargin: "0.0", // Simplified
            totalWalletBalance: String(walletBalance.toFixed(8)),
            totalUnrealizedProfit: String(totalUnrealizedProfit.toFixed(8)),
            totalMarginBalance: String(marginBalance.toFixed(8)),
            totalPositionInitialMargin: String(totalMargin.toFixed(2)),
            totalOpenOrderInitialMargin: "0",
            totalCrossWalletBalance: String(walletBalance.toFixed(8)),
            totalCrossUnPnl: String(totalUnrealizedProfit.toFixed(8)),
            availableBalance: String(availableBalance.toFixed(8)),
            maxWithdrawAmount: String(availableBalance.toFixed(8)),
            assets: [
                {
                    asset: "USDT",
                    walletBalance: String(walletBalance.toFixed(8)),
                    unrealizedProfit: String(totalUnrealizedProfit.toFixed(8)),
                    marginBalance: String(marginBalance.toFixed(8)),
                    maintMargin: "0.0",
                    initialMargin: String(totalMargin.toFixed(2)),
                    positionInitialMargin: String(totalMargin.toFixed(2)),
                    openOrderInitialMargin: "0",
                    crossWalletBalance: String(walletBalance.toFixed(8)),
                    crossUnPnl: String(totalUnrealizedProfit.toFixed(8)),
                    availableBalance: String(availableBalance.toFixed(8)),
                    maxWithdrawAmount: String(availableBalance.toFixed(8)),
                    marginAvailable: true,
                    updateTime: BinanceAdapter.getTime()
                }
            ]
        };
    }
}

module.exports = BinanceAdapter;
