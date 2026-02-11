const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CONFIG_PATH = path.join(__dirname, 'agents_config.json');
const LOG_PATH = path.join(__dirname, 'latest_discussion.json');
const PORTFOLIO_PATH = path.join(__dirname, 'portfolio.json');
const CONFIG = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

async function getMarketData() {
    try {
        const response = await axios.get('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT', { timeout: 10000 });
        return response.data;
    } catch (error) {
        return { lastPrice: '97450.00', priceChangePercent: '+1.80', volume: '45000.0', symbol: 'BTCUSDT' };
    }
}

async function askAgent(agentName, prompt, systemRole) {
    const model = CONFIG.agents[agentName];
    try {
        const response = await axios.post(`${CONFIG.ollama_base_url}/api/generate`, {
            model: model,
            prompt: `[REQUIRED_REPORT]\nRole: ${systemRole}\nContext: ${prompt}`,
            stream: false,
            options: { num_predict: 200, temperature: 0.4 }
        }, { timeout: 180000 });
        return response.data.response.trim();
    } catch (error) {
        return `[ERROR] ${agentName} connection failed.`;
    }
}

async function runStrategyCycle() {
    console.log('--- STARTING ACTIVE COMMAND CYCLE ---');
    const data = await getMarketData();
    const portfolio = JSON.parse(fs.readFileSync(PORTFOLIO_PATH, 'utf8'));

    // 1. Commander's Direction
    const commanderOrder = `Market: BTC $${data.lastPrice} (${data.priceChangePercent}%). Analysts, provide immediate tactical recommendations.`;

    // 2. Continuous Intelligence Gathering
    const analysis = await askAgent('MasterAnalyst', `Current Price: $${data.lastPrice}. Identify the primary trend and next support/resistance levels.`, "Senior Market Analyst");
    const verification = await askAgent('FinalProver', `Review analysis: ${analysis}. Calculate risk/reward and provide final trade decision: [ACTION: BUY], [ACTION: SELL], or [ACTION: HOLD].`, "Strategic Decision Lead");

    // 3. Automated Execution
    let tradeLog = null;
    const decision = verification.toUpperCase();
    
    if (decision.includes('ACTION: BUY') && portfolio.cash > 1000) {
        const amount = 5000;
        const price = parseFloat(data.lastPrice);
        portfolio.cash -= amount;
        const entry = { symbol: data.symbol, side: 'BUY', entry: price, amount, size: amount/price, time: new Date().toISOString() };
        portfolio.positions.push(entry);
        tradeLog = entry;
    } else if (decision.includes('ACTION: SELL') && portfolio.positions.length > 0) {
        const idx = portfolio.positions.findIndex(p => p.symbol === data.symbol);
        if (idx > -1) {
            const pos = portfolio.positions[idx];
            const price = parseFloat(data.lastPrice);
            const pnl = (price - pos.entry) * pos.size;
            portfolio.cash += (pos.amount + pnl);
            tradeLog = { ...pos, closePrice: price, pnl, closeTime: new Date().toISOString(), side: 'SELL' };
            portfolio.history.unshift(tradeLog);
            portfolio.positions.splice(idx, 1);
        }
    }

    fs.writeFileSync(PORTFOLIO_PATH, JSON.stringify(portfolio, null, 2));
    
    const discussion = {
        timestamp: new Date().toISOString(),
        market: data,
        commanderOrder,
        thoughts: [
            { agent: 'MasterAnalyst', text: analysis },
            { agent: 'FinalProver', text: verification }
        ],
        lastTrade: tradeLog
    };

    fs.writeFileSync(LOG_PATH, JSON.stringify(discussion, null, 2));

    // Generate concise summary for Telegram
    let summary = `[REPORT] ${new Date().toLocaleTimeString()}\n`;
    summary += `Analysis: ${analysis.substring(0, 100)}...\n`;
    summary += `Verdict: ${verification}\n`;
    if (tradeLog) {
        summary += `TRADE EXECUTED: ${tradeLog.side} ${tradeLog.symbol} @ $${tradeLog.entry}\n`;
    }
    summary += `Next Topic: Assessing ${data.symbol} support stability at lower timeframes.`;
    fs.writeFileSync(path.join(__dirname, 'latest_report.txt'), summary);
    
    try {
        execSync('git add portfolio.json latest_discussion.json && git commit -m "Active Command Sync" && git push origin main');
        console.log('--- CYCLE COMPLETE: DATA SYNCED ---');
    } catch (e) {
        console.error('Git push failed');
    }
}

runStrategyCycle();
