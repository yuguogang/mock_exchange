const BinanceAdapter = require('./binance');
const OKXAdapter = require('./okx');

/**
 * Exchange-aware adapter factory
 * Converts core schema data to exchange-specific formats
 */
class ExchangeAwareAdapterFactory {
    constructor() {
        this.adapters = {
            binance: BinanceAdapter,
            okx: OKXAdapter
        };
    }

    /**
     * Get adapter for specific exchange
     */
    getAdapter(exchange) {
        return this.adapters[exchange.toLowerCase()];
    }

    /**
     * Convert core position to exchange format
     */
    toExchangePosition(corePosition, exchange) {
        const adapter = this.getAdapter(exchange);
        if (!adapter) {
            throw new Error(`Unsupported exchange: ${exchange}`);
        }

        // Convert core schema to exchange format
        return adapter.formatPosition(corePosition);
    }

    /**
     * Convert core order to exchange format
     */
    toExchangeOrder(coreOrder, exchange) {
        const adapter = this.getAdapter(exchange);
        if (!adapter) {
            throw new Error(`Unsupported exchange: ${exchange}`);
        }

        return adapter.formatOrder(coreOrder);
    }

    /**
     * Convert core trade to exchange format
     */
    toExchangeTrade(coreTrade, exchange) {
        const adapter = this.getAdapter(exchange);
        if (!adapter) {
            throw new Error(`Unsupported exchange: ${exchange}`);
        }

        return adapter.formatTrade(coreTrade);
    }

    /**
     * Convert core transaction to exchange format
     */
    toExchangeTransaction(coreTransaction, exchange) {
        const adapter = this.getAdapter(exchange);
        if (!adapter) {
            throw new Error(`Unsupported exchange: ${exchange}`);
        }

        return adapter.formatTransaction(coreTransaction);
    }

    /**
     * Convert exchange data to core schema
     */
    fromExchangeData(exchangeData, exchange) {
        const adapter = this.getAdapter(exchange);
        if (!adapter) {
            throw new Error(`Unsupported exchange: ${exchange}`);
        }

        return adapter.parseToCore(exchangeData);
    }

    /**
     * Get all supported exchanges
     */
    getSupportedExchanges() {
        return Object.keys(this.adapters);
    }
}

module.exports = ExchangeAwareAdapterFactory;