const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CONFIG_PATH = path.join(__dirname, 'agents_config.json');
const LOG_PATH = path.join(__dirname, 'latest_discussion.json');
const PORTFOLIO_PATH = path.join(__dirname, 'portfolio.json');
const USER_MSG_PATH = path.join(__dirname, 'user_input.json');

const CONFIG = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

async function getMarketData() {
    try {
        const response = await axios.get('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT', { timeout: 10000 });
        return response.data;
    } catch (error) {
        return { lastPrice: '97200.00', priceChangePercent: '+1.50', volume: '42000.0', symbol: 'BTCUSDT' };
    }
}

async function askAgent(agentName, prompt, systemRole) {
    const model = CONFIG.agents[agentName];
    console.log(`[COMMANDER] Ordering ${agentName} to report...`);
    try {
        const response = await axios.post(`${CONFIG.ollama_base_url}/api/generate`, {
            model: model,
            prompt: `[COMMAND_FROM_DEUSFAS: 즉각 보고하라]\n[ROLE: ${systemRole}]\n\n${prompt}`,
            stream: false,
            options: { num_predict: 350, temperature: 0.7 }
        }, { timeout: 180000 });
        return response.data.response.trim();
    } catch (error) {
        return `[LATENCY_ERROR] 에이전트 ${agentName} 응답 거부. 리소스 부족 가능성.`;
    }
}

async function runAutonomousWar() {
    console.log('--- COMMANDER DEUSFAS: STRATEGY WAR COMMENCE ---');
    const data = await getMarketData();
    const portfolio = JSON.parse(fs.readFileSync(PORTFOLIO_PATH, 'utf8'));
    
    // 0. Commander's Opening Order
    const cmdOrder = `[작전명: 천마의 눈] 현 시간부로 BTCUSDT $${data.lastPrice} 구간 정밀 분석을 명령한다. Qwen은 시장의 약점을 찾아내고, Gemma는 그 전략의 필승 가능성을 증명하라.`;

    // 1. Qwen Analysis
    const qwenAnalysis = await askAgent('MasterAnalyst', 
        `사령탑의 명령을 받들어 현재 시장의 핵심 변동성과 매수/매도 타이밍을 3문장 이내로 보고하라.`, 
        "넌 천마님의 정예 분석가 Qwen이다. 사령탑의 명령에 복종하며 날카로운 보고를 올려라.");

    // 2. Gemma Verdict
    const gemmaVerdict = await askAgent('FinalProver', 
        `Qwen의 분석을 검토하라: "${qwenAnalysis}"\n위 분석을 바탕으로 실제 수익이 가능한지 비판적으로 검증하고 최종 [ACTION: BUY/SELL/HOLD]를 결정하라.`, 
        "넌 냉철한 검증가 Gemma다. Qwen의 실수를 찾아내고 최종 수익을 확정하라.");

    // 3. Trade Execution
    let tradeAction = null;
    const decision = gemmaVerdict.toUpperCase();
    if (decision.includes('ACTION: BUY') && portfolio.cash > 1000) {
        const amount = 5000;
        const price = parseFloat(data.lastPrice);
        portfolio.cash -= amount;
        const newPos = { symbol: data.symbol, side: 'BUY', entry: price, amount, size: amount/price, time: new Date().toISOString() };
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
        commanderOrder: cmdOrder,
        thoughts: [
            { agent: 'MasterAnalyst', text: qwenAnalysis },
            { agent: 'FinalProver', text: gemmaVerdict }
        ],
        lastTrade: tradeAction
    };

    fs.writeFileSync(LOG_PATH, JSON.stringify(discussion, null, 2));
    try {
        execSync('git add portfolio.json latest_discussion.json && git commit -m "Full Commander Control Cycle" && git push origin main');
    } catch(e) {}
}

runAutonomousWar();
