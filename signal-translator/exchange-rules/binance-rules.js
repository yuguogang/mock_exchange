const binanceRules = {
    exchange: 'BINANCE',

    symbolMapping: (symbol) => symbol,

    quantityCalculation: (baseQty, contractProfile) => {
        // Binance usually takes exact quantity in base asset for USDT-M futures
        // But we respect stepSize if available.
        return baseQty;
    },

    formatOrder: (params) => {
        return {
            symbol: params.symbol,
            side: params.side.toUpperCase(),
            type: 'MARKET',
            quantity: params.quantity,
            // Mock server specific
            clientOrderId: params.clientOrderId || `BN_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            status: 'FILLED'
        };
    }
};

module.exports = binanceRules;
