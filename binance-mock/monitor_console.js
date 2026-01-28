const puppeteer = require('puppeteer-core');
const http = require('http');

async function getDebuggerUrl() {
    return new Promise((resolve, reject) => {
        const req = http.get('http://127.0.0.1:9222/json/version', (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve(json.webSocketDebuggerUrl);
                } catch (e) {
                    reject(new Error('Cannot parse Chrome debug info'));
                }
            });
        });
        req.on('error', (e) => reject(new Error('Cannot connect to Chrome on port 9222')));
    });
}

async function run() {
    try {
        const browserWSEndpoint = await getDebuggerUrl();
        const browser = await puppeteer.connect({ 
            browserWSEndpoint,
            defaultViewport: null 
        });

        console.log('Connected to Chrome');

        const targets = await browser.targets();
        console.log(`Found ${targets.length} targets.`);
        
        const target = targets.find(t => t.url().includes('binance.com') && t.type() === 'page');

        if (!target) {
            console.log('No Binance page found.');
            return;
        }

        console.log(`Connecting to page: ${target.url()}`);
        const page = await target.page();
        console.log(`Page connected.`);

        if (!page) {
            console.log('Page object is null, cannot attach listener.');
            return;
        }

        console.log('Reloading page to ensure latest inject.js is loaded...');
        await page.reload({ waitUntil: 'domcontentloaded' });
        console.log('Page reloaded.');

        const targetPage = page;
        console.log(`Monitoring console logs for: ${targetPage.url()}`);

        targetPage.on('console', msg => {
            const type = msg.type();
            const text = msg.text();
            // Show all logs for now to verify connectivity
            if (text.includes('[Binance Mock]') || text.includes('[Bridge]') || type === 'error' || text.includes('Error')) {
                 console.log(`[PAGE ${type.toUpperCase()}] ${text}`);
            }
        });

        // Keep it running
        process.stdin.resume();

    } catch (err) {
        console.error('Error:', err.message);
    }
}

run();
