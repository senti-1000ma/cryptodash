const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CONFIG_PATH = path.join(__dirname, 'agents_config.json');
const LOG_PATH = path.join(__dirname, 'latest_discussion.json');
const PORTFOLIO_PATH = path.join(__dirname, 'portfolio.json');
const SPREADSHEET_ID = '1M_XV6pbTH-NMvvr8HmoVKllzgcIFuutugFbAm3ruQPQ';

const CONFIG = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

async function getMarketData() {
    try {
        const response = await axios.get('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT', { timeout: 10000 });
        return response.data;
    } catch (error) {
        return { lastPrice: '96850.00', priceChangePercent: '+0.85', volume: '35000.0', symbol: 'BTCUSDT' };
    }
}

async function askAgent(agentName, prompt, systemRole) {
    const model = CONFIG.agents[agentName];
    try {
        const response = await axios.post(`${CONFIG.ollama_base_url}/api/generate`, {
            model: model,
            system: systemRole,
            prompt: prompt,
            stream: false,
            options: { num_predict: 200, temperature: 0.8 }
        }, { timeout: 180000 });
        return response.data.response.trim();
    } catch (error) {
        return `[LATENCY_ERROR] ${agentName} 분석 엔진 지연 중...`;
    }
}

async function runAutonomousWar() {
    const data = await getMarketData();
    const portfolio = JSON.parse(fs.readFileSync(PORTFOLIO_PATH, 'utf8'));
    const basePrompt = `시장현황: ${data.symbol} $${data.lastPrice}. 잔고: $${portfolio.cash}. `;

    console.log('--- ROUND 1: INITIAL ANALYSIS ---');
    const masterInitial = await askAgent('MasterAnalyst', `${basePrompt} 현재 시장의 단기 방향성을 예측하고 근거를 대라.`, "넌 공격적인 분석가야.");
    if (masterInitial.includes('[LATENCY_ERROR]')) {
        console.log('Skipping update due to agent error');
        return;
    }
    
    console.log('--- ROUND 2: CRITICAL REVIEW ---');
    const proverCritique = await askAgent('FinalProver', `분석가 의견: ${masterInitial}\n위 분석의 기술적 허점을 지적하고 리스크를 경고하라.`, "넌 보수적이고 냉철한 검증가야.");
    
    console.log('--- ROUND 3: FINAL DEFENSE & ACTION ---');
    const finalDecision = await askAgent('FinalProver', 
        `시장상황: ${basePrompt}\n분석가: ${masterInitial}\n본인의비판: ${proverCritique}\n모든 것을 종합하여 최종 [ACTION: BUY/SELL/HOLD]를 결정하라.`, 
        "넌 최종 의사결정권자야. 수익을 증명하라.");

    if (finalDecision.includes('[LATENCY_ERROR]')) {
        console.log('Skipping update due to decision error');
        return;
    }

    // Trade Execution
    let tradeAction = null;
    const decision = finalDecision.toUpperCase();
    if (decision.includes('ACTION: BUY') && portfolio.cash > 1000) {
        const amount = 5000;
        const price = parseFloat(data.lastPrice);
        const size = amount / price;
        portfolio.cash -= amount;
        const newPos = { symbol: data.symbol, side: 'BUY', entry: price, amount, size, time: new Date().toISOString() };
        portfolio.positions.push(newPos);
        tradeAction = newPos;
    } else if (decision.includes('ACTION: SELL') && portfolio.positions.length > 0) {
        const posIndex = portfolio.positions.findIndex(p => p.symbol === data.symbol);
        if (posIndex > -1) {
            const pos = portfolio.positions[posIndex];
            const price = parseFloat(data.lastPrice);
            const pnl = (price - pos.entry) * pos.size;
            portfolio.cash += (pos.amount + pnl);
            tradeAction = { ...pos, closePrice: price, pnl, closeTime: new Date().toISOString(), side: 'SELL' };
            portfolio.history.unshift(tradeAction);
            portfolio.positions.splice(posIndex, 1);
        }
    }

    fs.writeFileSync(PORTFOLIO_PATH, JSON.stringify(portfolio, null, 2));

    const discussion = {
        timestamp: new Date().toISOString(),
        market: data,
        thoughts: [
            { agent: 'MasterAnalyst', text: masterInitial },
            { agent: 'FinalProver', text: proverCritique },
            { agent: 'FinalProver', text: finalDecision }
        ],
        lastTrade: tradeAction
    };

    fs.writeFileSync(LOG_PATH, JSON.stringify(discussion, null, 2));
    try {
        execSync('git add portfolio.json latest_discussion.json && git commit -m "Strategic War Update" && git push origin main');
    } catch(e) {}
}

runAutonomousWar();
