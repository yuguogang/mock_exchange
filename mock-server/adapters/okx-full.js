/**
 * OKX Adapter - Converts core schema to OKX API format
 */
class OKXAdapter {
    /**
     * Format core position to OKX position format
     */
    static formatPosition(corePosition) {
        return {
            instId: corePosition.symbol.replace('-SWAP', ''), // Convert TRX-USDT-SWAP to TRX-USDT
            posSide: corePosition.side.toLowerCase(), // 'long' | 'short'
            pos: Math.abs(corePosition.quantity).toString(),
            avgPx: corePosition.entry_price.toString(),
            upl: corePosition.unrealized_pnl?.toString() || '0',
            margin: corePosition.margin.toString(),
            lever: corePosition.leverage.toString(),
            cTime: corePosition.timestamp.toString(),
            uTime: corePosition.updated_at?.toString() || corePosition.timestamp.toString()
        };
    }

    /**
     * Format core order to OKX order format
     */
    static formatOrder(coreOrder) {
        return {
            ordId: coreOrder.id,
            clOrdId: coreOrder.client_order_id || '',
            instId: coreOrder.symbol.replace('-SWAP', ''),
            side: coreOrder.side.toLowerCase(), // 'buy' | 'sell'
            ordType: this.mapOrderType(coreOrder.type),
            sz: coreOrder.quantity.toString(),
            px: coreOrder.price.toString(),
            state: this.mapOrderStatus(coreOrder.status),
            avgPx: coreOrder.price.toString(), // Simplified
            accFillSz: coreOrder.quantity.toString(), // Simplified
            pnl: '0', // Simplified
            cTime: coreOrder.timestamp.toString(),
            uTime: coreOrder.created_at?.toString() || coreOrder.timestamp.toString()
        };
    }

    /**
     * Format core trade to OKX trade format
     */
    static formatTrade(coreTrade) {
        return {
            tradeId: coreTrade.id,
            ordId: coreTrade.order_id,
            instId: coreTrade.symbol.replace('-SWAP', ''),
            side: coreTrade.side.toLowerCase(),
            sz: coreTrade.quantity.toString(),
            px: coreTrade.price.toString(),
            fee: Math.abs(coreTrade.fee).toString(),
            feeCcy: coreTrade.fee_asset,
            pnl: coreTrade.realized_pnl?.toString() || '0',
            ts: coreTrade.timestamp.toString()
        };
    }

    /**
     * Format core transaction to OKX transaction format
     */
    static formatTransaction(coreTransaction) {
        return {
            billId: coreTransaction.id,
            type: this.mapTransactionType(coreTransaction.type),
            ts: coreTransaction.timestamp.toString(),
            sz: Math.abs(coreTransaction.amount).toString(),
            ccy: coreTransaction.asset,
            pnl: coreTransaction.amount.toString(),
            bal: '0', // Would need balance calculation
            mgn: '0', // Would need margin calculation
            info: coreTransaction.info || ''
        };
    }

    /**
     * Parse OKX data to core schema
     */
    static parseToCore(okxData, dataType) {
        switch (dataType) {
            case 'position':
                return {
                    id: `${okxData.instId}_${okxData.posSide}`,
                    exchange: 'okx',
                    symbol: okxData.instId.includes('-SWAP') ? okxData.instId : `${okxData.instId}-SWAP`,
                    side: okxData.posSide.toUpperCase(),
                    quantity: parseFloat(okxData.pos),
                    entry_price: parseFloat(okxData.avgPx),
                    mark_price: parseFloat(okxData.last) || parseFloat(okxData.avgPx),
                    unrealized_pnl: parseFloat(okxData.upl),
                    margin: parseFloat(okxData.margin),
                    leverage: parseInt(okxData.lever),
                    timestamp: parseInt(okxData.uTime)
                };
            
            case 'order':
                return {
                    id: okxData.ordId,
                    exchange: 'okx',
                    symbol: okxData.instId.includes('-SWAP') ? okxData.instId : `${okxData.instId}-SWAP`,
                    side: okxData.side.toUpperCase(),
                    type: this.reverseMapOrderType(okxData.ordType),
                    quantity: parseFloat(okxData.sz),
                    price: parseFloat(okxData.px),
                    status: this.reverseMapOrderStatus(okxData.state),
                    client_order_id: okxData.clOrdId,
                    timestamp: parseInt(okxData.uTime)
                };
            
            case 'trade':
                return {
                    id: okxData.tradeId,
                    order_id: okxData.ordId,
                    exchange: 'okx',
                    symbol: okxData.instId.includes('-SWAP') ? okxData.instId : `${okxData.instId}-SWAP`,
                    side: okxData.side.toUpperCase(),
                    price: parseFloat(okxData.px),
                    quantity: parseFloat(okxData.sz),
                    fee: parseFloat(okxData.fee),
                    fee_asset: okxData.feeCcy,
                    realized_pnl: parseFloat(okxData.pnl),
                    timestamp: parseInt(okxData.ts)
                };
            
            case 'transaction':
                return {
                    id: okxData.billId,
                    exchange: 'okx',
                    type: this.reverseMapTransactionType(okxData.type),
                    symbol: null, // OKX bills don't always have symbol
                    asset: okxData.ccy,
                    amount: parseFloat(okxData.pnl),
                    timestamp: parseInt(okxData.ts),
                    info: okxData.info
                };
            
            default:
                throw new Error(`Unsupported data type: ${dataType}`);
        }
    }

    // Helper methods for type mapping
    static mapOrderType(coreType) {
        const mapping = {
            'MARKET': 'market',
            'LIMIT': 'limit',
            'STOP': 'trigger'
        };
        return mapping[coreType] || 'limit';
    }

    static reverseMapOrderType(okxType) {
        const mapping = {
            'market': 'MARKET',
            'limit': 'LIMIT',
            'trigger': 'STOP'
        };
        return mapping[okxType] || 'LIMIT';
    }

    static mapOrderStatus(coreStatus) {
        const mapping = {
            'NEW': 'live',
            'PARTIALLY_FILLED': 'partially_filled',
            'FILLED': 'filled',
            'CANCELLED': 'canceled'
        };
        return mapping[coreStatus] || 'live';
    }

    static reverseMapOrderStatus(okxStatus) {
        const mapping = {
            'live': 'NEW',
            'partially_filled': 'PARTIALLY_FILLED',
            'filled': 'FILLED',
            'canceled': 'CANCELLED'
        };
        return mapping[okxStatus] || 'NEW';
    }

    static mapTransactionType(coreType) {
        const mapping = {
            'FUNDING_FEE': 'funding_fee',
            'TRADING_FEE': 'fee',
            'REALIZED_PNL': 'realized_pnl',
            'TRANSFER': 'transfer'
        };
        return mapping[coreType] || 'fee';
    }

    static reverseMapTransactionType(okxType) {
        const mapping = {
            'funding_fee': 'FUNDING_FEE',
            'fee': 'TRADING_FEE',
            'realized_pnl': 'REALIZED_PNL',
            'transfer': 'TRANSFER'
        };
        return mapping[okxType] || 'OTHER';
    }

    // OKX API endpoint implementations
    static getPositionRisk(positions, prices) {
        // Convert to OKX format
        return positions.map(pos => this.formatPosition(pos));
    }

    static getUserTrades(trades) {
        // Convert to OKX format
        return trades.map(trade => this.formatTrade(trade));
    }

    static getBalance(positions) {
        let totalMargin = 0;
        let totalUnrealizedPnl = 0;

        positions.forEach(pos => {
            totalMargin += pos.margin;
            totalUnrealizedPnl += pos.unrealized_pnl || 0;
        });

        const initialBalance = parseFloat(process.env.MOCK_INITIAL_BALANCE_OKX || process.env.MOCK_INITIAL_BALANCE || '10000');
        const totalEq = initialBalance + totalUnrealizedPnl;
        const availEq = Math.max(0, totalEq - totalMargin);

        return {
            uTime: Date.now().toString(),
            totalEq: totalEq.toString(),
            isoEq: totalMargin.toString(),
            adjEq: totalEq.toString(),
            ordFroz: '0',
            imr: '0',
            mmr: '0',
            details: [{
                ccy: 'USDT',
                eq: totalEq.toString(),
                availEq: availEq.toString(),
                frozenBal: '0',
                ordFrozen: '0',
                uTime: Date.now().toString()
            }]
        };
    }
}

module.exports = OKXAdapter;
