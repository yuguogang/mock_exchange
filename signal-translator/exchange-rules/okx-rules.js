const okxRules = {
    exchange: 'OKX',

    symbolMapping: (symbol) => {
        // Example: TRXUSDT -> TRX-USDT-SWAP
        if (!symbol.includes('-')) {
            return symbol.replace('USDT', '-USDT-SWAP');
        }
        return symbol;
    },

    quantityCalculation: (baseQty, contractProfile) => {
        // OKX uses contract count (sz). baseQty is total contracts? 
        // Or baseQty is in base asset? 
        // Usually, contract_size is how many base assets per contract.
        const contractSize = contractProfile.contract_size || 1;
        return Math.floor(baseQty / contractSize);
    },

    formatOrder: (params) => {
        return {
            symbol: params.symbol,
            side: params.side.toUpperCase(),
            type: 'MARKET',
            quantity: params.quantity,
            // Mock server specific
            clientOrderId: params.clientOrderId || `OK_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            status: 'FILLED'
        };
    }
};

module.exports = okxRules;
