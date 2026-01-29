const axios = require('axios');

async function run() {
  const base = process.env.TEST_BASE || 'http://localhost:3000';
  let failures = 0;

  async function checkPositionRisk() {
    const url = `${base}/fapi/v2/positionRisk`;
    const resp = await axios.get(url, { params: { symbol: 'TRXUSDT', timestamp: Date.now() } });
    if (!Array.isArray(resp.data)) {
      throw new Error('positionRisk response is not an array');
    }
  }

  async function checkIncomeFiltering() {
    const url = `${base}/fapi/v1/income`;
    const resp = await axios.get(url, {
      params: {
        symbol: 'TRXUSDT',
        incomeType: 'COMMISSION',
        startTime: Date.now() - 24 * 60 * 60 * 1000,
        endTime: Date.now(),
        limit: 10
      }
    });
    if (!Array.isArray(resp.data)) {
      throw new Error('income response is not an array');
    }
    resp.data.forEach(r => {
      if (r.incomeType !== 'COMMISSION') {
        throw new Error('incomeType filter failed');
      }
    });
  }

  async function checkUserTrades() {
    const url = `${base}/fapi/v1/userTrades`;
    const resp = await axios.get(url, { params: { symbol: 'TRXUSDT', limit: 5 } });
    if (!Array.isArray(resp.data)) {
      throw new Error('userTrades response is not an array');
    }
    if (resp.data.length > 5) {
      throw new Error('userTrades limit not applied');
    }
  }

  async function checkInvalidSymbol() {
    const url = `${base}/fapi/v2/positionRisk`;
    try {
      await axios.get(url, { params: { symbol: 'invalid_symbol', timestamp: Date.now() } });
      throw new Error('invalid symbol should have failed');
    } catch (err) {
      if (!err.response || err.response.status !== 400) {
        throw new Error('invalid symbol did not return 400');
      }
    }
  }

  const cases = [
    ['positionRisk', checkPositionRisk],
    ['income filtering', checkIncomeFiltering],
    ['userTrades', checkUserTrades],
    ['invalid symbol', checkInvalidSymbol]
  ];

  for (const [name, fn] of cases) {
    try {
      await fn();
      console.log(`✓ ${name}`);
    } catch (e) {
      failures++;
      console.error(`✗ ${name}: ${e.message}`);
    }
  }

  if (failures > 0) {
    process.exit(1);
  } else {
    console.log('All integration checks passed');
    process.exit(0);
  }
}

run().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
