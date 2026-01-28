const fs = require('fs');
const path = require('path');

// --- Helper Functions ---

function parseLocalTime(timeStr, timezone) {
    // timeStr: "YYYY-MM-DD HH:mm"
    // We assume the system is running in UTC or we need to manually offset.
    // For simplicity in this Node script, we can use the 'date-fns-tz' or just simple string manipulation if we assume UTC+8 strictly.
    // Since we don't have external libs guaranteed, let's do simple parsing assuming the input is "YYYY-MM-DD HH:mm" in UTC+8.
    
    // Parse "2025-12-30 09:22"
    const [datePart, timePart] = timeStr.split(' ');
    const [y, m, d] = datePart.split('-').map(Number);
    const [hh, mm] = timePart.split(':').map(Number);
    
    // Create Date object in UTC
    // UTC+8 09:22 means UTC 01:22
    // We can construct the date string with offset
    const isoStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+08:00`;
    return new Date(isoStr).getTime();
}

// Simple seeded random for Gaussian noise
function mulberry32(a) {
    return function() {
      var t = a += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

function gaussianRandom(seed) {
    const rand = mulberry32(seed || Date.now());
    let u = 0, v = 0;
    while(u === 0) u = rand(); //Converting [0,1) to (0,1)
    while(v === 0) v = rand();
    return Math.sqrt( -2.0 * Math.log( u ) ) * Math.cos( 2.0 * Math.PI * v );
}

// --- Main Mixer Class ---

class Mixer {
    constructor(configPath) {
        this.config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        this.dataDir = path.join(__dirname, 'data');
        this.outputDir = path.join(__dirname, this.config.outputs.dir);
        
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
        
        // Parse segments time
        this.segments = this.config.segments.map(seg => ({
            ...seg,
            startTs: parseLocalTime(seg.start_local, this.config.timezone),
            endTs: parseLocalTime(seg.end_local, this.config.timezone)
        })).sort((a, b) => a.priority - b.priority); // Low priority first, so high priority overrides (or we check high first)
        
        // Actually, we should check segments in reverse priority or just find the highest priority match for each point
        // Let's sort by priority DESCENDING so we find the first match
        this.segments.sort((a, b) => b.priority - a.priority);
    }

    findSegment(ts, exchange, symbol, metric) {
        for (const seg of this.segments) {
            if (ts >= seg.startTs && ts < seg.endTs) {
                // Check if target matches
                if (seg.target.exchange === exchange && seg.target.symbol === symbol && seg.target.metrics.includes(metric)) {
                    return seg;
                }
            }
        }
        return null;
    }

    applyFundingOps(rate, ops) {
        let newRate = rate;
        for (const op of ops) {
            if (op.type === 'scale') newRate *= op.value;
            if (op.type === 'offset') newRate += op.value;
            if (op.type === 'clamp') newRate = Math.max(op.min, Math.min(op.max, newRate));
        }
        return newRate;
    }

    applyPriceOps(price, refPrice, ops, ts) {
        let newPrice = price;
        for (const op of ops) {
            if (op.type === 'scale') newPrice *= op.value;
            if (op.type === 'offset') newPrice += op.value;
            if (op.type === 'target_spread_pct') {
                if (refPrice !== null) {
                    // new_price = ref_price * (1 + spread_pct)
                    newPrice = refPrice * (1 + op.value);
                }
            }
            if (op.type === 'noise') {
                if (op.mode === 'gaussian') {
                    // Seed logic could be improved to be deterministic per timestamp
                    const seed = (op.seed || 42) + ts; 
                    const noise = gaussianRandom(seed) * op.amplitude * newPrice; // relative amplitude? or absolute?
                    // Usually amplitude is absolute or percentage. 
                    // Prompt says "amplitude: 0.0005". If it's percentage, we multiply.
                    // Let's assume amplitude is a percentage of price for now, or raw value?
                    // In the prompt "target_spread_pct" is 0.0015 (0.15%).
                    // "amplitude: 0.0005" looks like 0.05%.
                    // Let's assume it's relative.
                    newPrice = newPrice * (1 + (gaussianRandom(seed) * op.amplitude));
                }
            }
        }
        return newPrice;
    }

    async run() {
        console.log(`[Mixer] Starting mixer: ${this.config.mixer_name}`);
        
        // 1. Load all data
        const dataMap = {}; // { "exchange_symbol": { klines: [], funding: [] } }
        
        for (const leg of this.config.legs) {
            const key = `${leg.exchange}_${leg.symbol}`;
            const klineFile = `${leg.exchange}_${leg.symbol}.json`;
            const fundingFile = `${leg.exchange}_funding_${leg.symbol}.json`;
            
            dataMap[key] = {
                klines: JSON.parse(fs.readFileSync(path.join(this.dataDir, klineFile), 'utf8')),
                funding: JSON.parse(fs.readFileSync(path.join(this.dataDir, fundingFile), 'utf8')),
                exchange: leg.exchange,
                symbol: leg.symbol
            };
            console.log(`[Mixer] Loaded ${key}: ${dataMap[key].klines.length} klines, ${dataMap[key].funding.length} funding rates.`);
        }

        // 2. Identify Reference Leg (Time Source)
        const refLegConfig = this.config.legs.find(l => l.exchange === this.config.alignment.time_source);
        const refKey = `${refLegConfig.exchange}_${refLegConfig.symbol}`;
        const refKlines = dataMap[refKey].klines;
        
        // Build a map for reference price lookup (ts -> price) for fast access
        const refPriceMap = new Map();
        refKlines.forEach(k => refPriceMap.set(k.ts, k.price));

        // 3. Process each leg
        for (const leg of this.config.legs) {
            const key = `${leg.exchange}_${leg.symbol}`;
            const legData = dataMap[key];
            
            // --- Process Funding ---
            const mixedFunding = legData.funding.map(item => {
                const seg = this.findSegment(item.ts, leg.exchange, leg.symbol, 'funding');
                if (seg) {
                    const oldRate = item.rate;
                    const newRate = this.applyFundingOps(oldRate, seg.ops.funding);
                    return { ...item, rate: newRate, _original_rate: oldRate, _segment: seg.id };
                }
                return item;
            });
            
            // --- Process Klines (Price) ---
            const mixedKlines = legData.klines.map(item => {
                const seg = this.findSegment(item.ts, leg.exchange, leg.symbol, 'price');
                if (seg) {
                    // Need reference price
                    let refPrice = null;
                    // Exact match check first
                    if (refPriceMap.has(item.ts)) {
                        refPrice = refPriceMap.get(item.ts);
                    } else {
                        // Find nearest within tolerance?
                        // For efficiency, assume aligned or close enough. 
                        // If we implement tolerance search here, it might be slow for large datasets.
                        // Let's try simple lookups or just use the item.price if ref not found (fallback).
                        // Or if this IS the reference leg, refPrice is itself (but modifying ref leg based on spread is weird).
                        // Usually we modify the 'other' leg.
                        if (key === refKey) {
                            refPrice = item.price; 
                        }
                    }

                    // If we are modifying the reference leg itself, "target_spread_pct" doesn't make sense unless against ANOTHER ref.
                    // But here we assume we modify 'target' based on 'time_source' (ref).
                    
                    const oldPrice = item.price;
                    // If refPrice is missing (and we need it for spread), we might skip modification or use own price
                    const basePrice = (refPrice !== null) ? refPrice : oldPrice;
                    
                    const newPrice = this.applyPriceOps(oldPrice, basePrice, seg.ops.price, item.ts);
                    return { ...item, price: newPrice, _original_price: oldPrice, _segment: seg.id };
                }
                return item;
            });

            // 4. Write Output
            const klineOutFile = path.join(this.outputDir, `${leg.exchange}_${leg.symbol}.json`);
            const fundingOutFile = path.join(this.outputDir, `${leg.exchange}_funding_${leg.symbol}.json`);
            
            fs.writeFileSync(klineOutFile, JSON.stringify(mixedKlines, null, 2));
            fs.writeFileSync(fundingOutFile, JSON.stringify(mixedFunding, null, 2));
            
            console.log(`[Mixer] Wrote mixed data for ${key} to ${this.outputDir}`);
        }
        
        // 5. Generate Audit Report
        const auditFile = path.join(this.outputDir, 'audit_report.md');
        let auditContent = `# Audit Report: ${this.config.mixer_name}\n\nGenerated at: ${new Date().toISOString()}\n\n`;
        auditContent += `## Segments\n`;
        this.segments.forEach(seg => {
            auditContent += `- **${seg.id}**: ${seg.start_local} to ${seg.end_local} (Priority: ${seg.priority})\n`;
            auditContent += `  - Target: ${seg.target.exchange} ${seg.target.symbol}\n`;
            auditContent += `  - Ops: ${JSON.stringify(seg.ops)}\n`;
        });
        fs.writeFileSync(auditFile, auditContent);
        console.log(`[Mixer] Audit report written to ${auditFile}`);
    }
}

// Run
const configFile = path.join(__dirname, 'config/mixer/demo_mix_trx_okx_binance.json');
const mixer = new Mixer(configFile);
mixer.run().catch(console.error);
