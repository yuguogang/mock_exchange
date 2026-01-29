const fs = require('fs');
const path = require('path');

class ParameterFilter {
  constructor() {
    this.rules = {
      binance: {
        '/fapi/v2/positionRisk': {
          symbol: { type: 'string', required: false, pattern: /^[A-Z]{1,}USDT$/ },
          timestamp: { type: 'number', required: false },
          recvWindow: { type: 'number', required: false, min: 1, max: 60000 }
        },
        '/fapi/v1/income': {
          symbol: { type: 'string', required: false, pattern: /^[A-Z]{1,}USDT$/ },
          incomeType: { type: 'string', required: false, enum: ['TRANSFER', 'WELCOME_BONUS', 'REALIZED_PNL', 'FUNDING_FEE', 'COMMISSION', 'INSURANCE_CLEAR'] },
          startTime: { type: 'number', required: false },
          endTime: { type: 'number', required: false },
          limit: { type: 'number', required: false, min: 1, max: 1000 }
        },
        '/fapi/v1/userTrades': {
          symbol: { type: 'string', required: true, pattern: /^[A-Z]{1,}USDT$/ },
          startTime: { type: 'number', required: false },
          endTime: { type: 'number', required: false },
          fromId: { type: 'string', required: false },
          limit: { type: 'number', required: false, min: 1, max: 1000 }
        }
      }
    };

    // Merge Binance BAPI endpoint rules from captured sample file if available
    this.mergeBinanceSampleRules();
  }

  mergeBinanceSampleRules() {
    try {
      const samplePath = path.resolve(__dirname, '../../binance-mock/captured/known/api_endpoints_complete.json');
      if (!fs.existsSync(samplePath)) return;
      const sample = JSON.parse(fs.readFileSync(samplePath, 'utf8'));
      const endpoints = sample?.endpoints || {};
      const b = this.rules.binance;

      // trade_history -> /bapi/futures/v1/private/future/user-data/trade-history
      if (endpoints.trade_history?.endpoint) {
        b[endpoints.trade_history.endpoint] = {
          startTime: { type: 'number', required: false },
          endTime: { type: 'number', required: false },
          page: { type: 'number', required: false, min: 1 },
          rows: { type: 'number', required: false, min: 1, max: 500 },
          symbol: { type: 'string', required: false, pattern: /^[A-Z]+USDT$/ },
          side: { type: 'string', required: false, enum: ['BUY', 'SELL'] }
        };
      }

      // transaction_history -> /bapi/futures/v1/private/future/user-data/transaction-history
      if (endpoints.transaction_history?.endpoint) {
        b[endpoints.transaction_history.endpoint] = {
          startTime: { type: 'number', required: false },
          endTime: { type: 'number', required: false },
          page: { type: 'number', required: false, min: 1 },
          rows: { type: 'number', required: false, min: 1, max: 500 }
        };
      }

      // user_position -> /bapi/futures/v6/private/future/user-data/user-position
      if (endpoints.user_position?.endpoint) {
        b[endpoints.user_position.endpoint] = {
          // No params required per sample
        };
      }

      // open_orders -> /bapi/futures/v1/private/future/order/open-orders
      if (endpoints.open_orders?.endpoint) {
        b[endpoints.open_orders.endpoint] = {
          // No params required per sample
        };
      }

      // order_history -> /bapi/futures/v1/private/future/order/order-history
      if (endpoints.order_history?.endpoint) {
        b[endpoints.order_history.endpoint] = {
          startTime: { type: 'number', required: false },
          endTime: { type: 'number', required: false },
          accountType: { type: 'string', required: false },
          statusList: { type: 'array', required: false },
          rows: { type: 'number', required: false, min: 1, max: 500 },
          page: { type: 'number', required: false, min: 1 }
        };
      }
    } catch (e) {
      // Silent fallback: keep default rules
    }
  }

  validateParameters(exchange, endpoint, params) {
    const rules = this.rules[exchange]?.[endpoint];
    if (!rules) {
      return { valid: true, filtered: params, errors: [] };
    }

    const errors = [];
    const filtered = {};

    for (const [field, rule] of Object.entries(rules)) {
      const value = params[field];

      if (rule.required && (value === undefined || value === null)) {
        errors.push(`Missing required parameter: ${field}`);
        continue;
      }

      if (!rule.required && (value === undefined || value === null)) {
        continue;
      }

      const normalized = this.transformValue(value, rule);
      if (!this.validateType(normalized, rule.type)) {
        errors.push(`Invalid type for ${field}: expected ${rule.type}, got ${typeof value}`);
        continue;
      }

      if (rule.min !== undefined && value < rule.min) {
        errors.push(`${field} must be >= ${rule.min}`);
        continue;
      }

      if (rule.max !== undefined && value > rule.max) {
        errors.push(`${field} must be <= ${rule.max}`);
        continue;
      }

      if (rule.pattern && typeof value === 'string' && !rule.pattern.test(value)) {
        errors.push(`${field} does not match required pattern`);
        continue;
      }

      if (rule.enum && !rule.enum.includes(value)) {
        errors.push(`${field} must be one of: ${rule.enum.join(', ')}`);
        continue;
      }

      filtered[field] = normalized;
    }

    return {
      valid: errors.length === 0,
      errors,
      filtered
    };
  }

  validateType(value, expectedType) {
    if (expectedType === 'string') return typeof value === 'string';
    if (expectedType === 'number') return typeof value === 'number' && !isNaN(value);
    if (expectedType === 'boolean') return typeof value === 'boolean';
    if (expectedType === 'array') return Array.isArray(value);
    if (expectedType === 'object') return typeof value === 'object' && value !== null;
    return true;
  }

  transformValue(value, rule) {
    if (rule.type === 'number' && typeof value === 'string') {
      return parseFloat(value);
    }
    if (rule.type === 'string' && typeof value === 'number') {
      return String(value);
    }
    if (rule.type === 'boolean') {
      return Boolean(value);
    }
    return value;
  }
}

module.exports = ParameterFilter;
