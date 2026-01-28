const BinanceAdapter = require('./binance');
const OKXAdapter = require('./okx');

class AdapterFactory {
    static getAdapter(exchangeName) {
        switch (exchangeName.toLowerCase()) {
            case 'binance':
                return BinanceAdapter;
            case 'okx':
                return OKXAdapter;
            default:
                throw new Error(`Unknown adapter: ${exchangeName}`);
        }
    }
}

module.exports = AdapterFactory;
