const puppeteer = require('puppeteer-core');
const http = require('http');

const TARGET_VALUES = ['23.58', '958', '1,537', '1537']; // Added 1537 without comma just in case

async function getDebuggerUrl() {
    return new Promise((resolve, reject) => {
        http.get('http://127.0.0.1:9222/json/version', (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve(json.webSocketDebuggerUrl);
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

async function run() {
    try {
        console.log('Connecting to Chrome...');
        const browserWSEndpoint = await getDebuggerUrl();
        const browser = await puppeteer.connect({ browserWSEndpoint });

        const pages = await browser.pages();
        let targetPage = pages.find(p => p.url().includes('binance.com') && p.url().includes('futures'));

        if (!targetPage) {
            console.log('Binance Futures tab not found. Opening a new one...');
            targetPage = await browser.newPage();
            await targetPage.goto('https://www.binance.com/zh-CN/futures/TRXUSDT');
        } else {
            console.log(`Found target page: ${targetPage.url()}`);
            await targetPage.bringToFront();
        }

        console.log('Setting up interceptors...');

        // HTTP Responses
        targetPage.on('response', async (response) => {
            try {
                const url = response.url();
                const headers = response.headers();
                const contentType = headers['content-type'] || '';

                if (contentType.includes('application/json') || contentType.includes('text/plain')) {
                    const text = await response.text();
                    if (url.includes('user-balance')) {
                        console.log(`[FULL BODY] ${url}:\n${text}\n-------------------`);
                    }
                    checkContent('HTTP Response', url, text);
                }
            } catch (e) {
                // Ignore errors (e.g. response too large, or redirect)
            }
        });

        // WebSocket Messages - Note: CDP session reused by Puppeteer might be tricky for direct raw WS inspection 
        // via standard puppeteer API if not specifically using a CDPSession.
        // Puppeteer doesn't expose raw WS frames easily on page events, we need CDP.
        const client = await targetPage.target().createCDPSession();
        await client.send('Network.enable');

        client.on('Network.webSocketFrameReceived', ({ requestId, timestamp, response }) => {
            const payloadData = response.payloadData;
            checkContent('WebSocket Recv', 'WS-Connection', payloadData);
        });

        console.log('Reloading page to capture initial data...');
        await targetPage.reload({ waitUntil: 'networkidle2' });

        console.log('Monitoring for 30 seconds...');
        await new Promise(r => setTimeout(r, 30000));

        await browser.disconnect();
    } catch (e) {
        console.error('Error:', e);
    }
}

function checkContent(sourceType, sourceName, content) {
    if (!content) return;

    // Simple string checking
    for (const val of TARGET_VALUES) {
        if (content.includes(val)) {
            console.log(`[FOUND] Value "${val}" found in ${sourceType}`);
            console.log(`Source: ${sourceName}`);
            // Snippet
            const idx = content.indexOf(val);
            const start = Math.max(0, idx - 50);
            const end = Math.min(content.length, idx + 50);
            console.log(`Snippet: ...${content.substring(start, end)}...`);
            console.log('-----------------------------------');
        }
    }
}

run();
