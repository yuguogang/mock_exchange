const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 配置
const CAPTURE_DIR = path.join(__dirname, 'captured');
const KNOWN_KEYWORDS = [
    'positionRisk', 'userTrades', 'openOrders', 'allOrders', 
    'income', 'balance', 'account', 'ticker', 'depth', 'exchangeInfo'
];

// 获取 Chrome 调试地址
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
                    reject(new Error('无法解析 Chrome 调试信息，请确认 Chrome 是否以 --remote-debugging-port=9222 启动'));
                }
            });
        });
        req.on('error', (e) => reject(new Error('无法连接到 Chrome，请确认 Chrome 是否已启动且开启了调试端口 9222')));
    });
}

// 格式化文件名
function safeFilename(str) {
    return str.replace(/[^a-zA-Z0-9-_]/g, '_');
}

// 生成唯一哈希 (用于区分相同 URL 不同参数的请求)
function generateRequestHash(method, url, postData) {
    const content = `${method}|${url}|${postData || ''}`;
    return crypto.createHash('md5').update(content).digest('hex').substring(0, 8);
}

async function run() {
    try {
        console.log('🔍 正在尝试连接 Chrome...');
        const browserWSEndpoint = await getDebuggerUrl();
        const browser = await puppeteer.connect({ 
            browserWSEndpoint,
            defaultViewport: null 
        });
        console.log('✅ 已连接到 Chrome');

        // 查找包含 binance 的页面
        const pages = await browser.pages();
        const targetPage = pages.find(p => p.url().includes('binance.com') && p.url().includes('futures'));

        if (!targetPage) {
            console.error('❌ 未找到 Binance 合约页面，请在 Chrome 中打开 https://www.binance.com/zh-CN/futures/TRXUSDT');
            process.exit(1);
        }

        console.log(`🎯 正在监听页面: ${targetPage.url()}`);
        console.log('📡 开始录制流量... (按 Ctrl+C 停止)');

        targetPage.on('response', async (response) => {
            try {
                const url = response.url();
                
                // 1. 域名过滤：只看 binance 相关
                if (!url.includes('binance.com')) return;

                // 2. 类型过滤：只看 JSON 接口 (忽略图片、CSS、JS)
                const contentType = response.headers()['content-type'] || '';
                if (!contentType.includes('application/json')) return;

                // 3. 获取请求信息
                const request = response.request();
                const method = request.method();
                const postData = request.postData();
                
                // 4. 获取响应体
                let responseBody;
                try {
                    responseBody = await response.json();
                } catch (e) {
                    // 即使声明是 json，有时可能为空或格式错误
                    return; 
                }

                // 5. 分类逻辑
                let saveDir = 'uncategorized';
                let matchedKeyword = 'unknown';

                for (const keyword of KNOWN_KEYWORDS) {
                    if (url.includes(keyword)) {
                        saveDir = 'known';
                        matchedKeyword = keyword;
                        break;
                    }
                }

                // 6. 构建保存路径
                const urlObj = new URL(url);
                const pathName = safeFilename(urlObj.pathname); // e.g., _fapi_v1_userTrades
                const hash = generateRequestHash(method, url, postData);
                const timestamp = Date.now();
                
                // 文件名格式: [关键词/路径]_[HASH]_[时间戳].json
                const filename = matchedKeyword !== 'unknown' 
                    ? `${matchedKeyword}_${hash}_${timestamp}.json`
                    : `${pathName}_${hash}_${timestamp}.json`;

                const fullPath = path.join(CAPTURE_DIR, saveDir, filename);

                // 7. 写入文件
                const dataToSave = {
                    meta: {
                        url: url,
                        method: method,
                        pathname: urlObj.pathname,
                        query: Object.fromEntries(urlObj.searchParams),
                        postData: postData ? JSON.parse(postData) : null, // 尝试解析 postData
                        timestamp: timestamp,
                        category: matchedKeyword
                    },
                    response: responseBody
                };

                fs.writeFileSync(fullPath, JSON.stringify(dataToSave, null, 2));
                
                // 控制台反馈
                const logSymbol = saveDir === 'known' ? '🟢' : '🟡';
                console.log(`${logSymbol} [${method}] ${urlObj.pathname.substring(0, 40)}... -> ${filename}`);

            } catch (err) {
                // 忽略一些常见的网络错误或 detach 错误
                // console.error('Error processing response:', err.message);
            }
        });

    } catch (err) {
        console.error('❌ 启动失败:', err.message);
    }
}

run();
