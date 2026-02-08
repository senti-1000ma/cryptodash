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
        return { lastPrice: '96500.00', priceChangePercent: '+1.20', volume: '38210.5', symbol: 'BTCUSDT' };
    }
}

async function askAgent(agentName, prompt, systemRole) {
    const model = CONFIG.agents[agentName];
    console.log(`[SYSTEM] ${agentName} (${model}) 가동 중...`);
    try {
        const response = await axios.post(`${CONFIG.ollama_base_url}/api/generate`, {
            model: model,
            system: systemRole,
            prompt: prompt,
            stream: false,
            options: { num_predict: 300, temperature: 0.6 }
        }, { timeout: 300000 }); // 5분으로 상향
        
        let text = response.data.response.trim();
        if (!text) throw new Error("Empty response");
        
        console.log(`[SUCCESS] ${agentName} 응답 완료`);
        return text;
    } catch (error) {
        console.error(`[ERROR] ${agentName} 실패:`, error.message);
        return `[SYSTEM_ERROR] ${agentName} 엔진 일시 지연. 재부팅 및 리소스 확인 권장.`;
    }
}

async function runAutonomousWar() {
    const data = await getMarketData();
    const portfolio = JSON.parse(fs.readFileSync(PORTFOLIO_PATH, 'utf8'));
    
    let userContext = "";
    if (fs.existsSync(USER_MSG_PATH)) {
        const userMsgs = JSON.parse(fs.readFileSync(USER_MSG_PATH, 'utf8'));
        if (userMsgs.length > 0) {
            userContext = "\n[천마님의 명령]: " + userMsgs[userMsgs.length - 1].text;
        }
    }

    const basePrompt = `현재 시장: ${data.symbol} 가격 $${data.lastPrice}, 변동률 ${data.priceChangePercent}%. ${userContext}`;

    // 1. MasterAnalyst
    const masterText = await askAgent('MasterAnalyst', 
        `${basePrompt}\n위 데이터를 바탕으로 현재 시장의 핵심 기회와 위험을 분석하고 전략 초안을 제시하라.`, 
        "넌 천마님의 정예 분석가야. 시장의 이면을 분석하라.");

    // 2. FinalProver (Validator)
    const proverText = await askAgent('FinalProver', 
        `시장상황: ${basePrompt}\n분석가 초안: ${masterText}\n\n위 전략을 비판적으로 검증하고 수익성을 증명하라. 마지막에는 반드시 [ACTION: BUY], [ACTION: SELL], [ACTION: HOLD] 중 하나를 명시하라.`, 
        "넌 냉혹한 검증가야. 분석가의 오류를 잡아내고 최종 결정을 내려라.");

    // 3. Trade Execution
    let tradeAction = null;
    const decision = proverText.toUpperCase();
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
        thoughts: [
            { agent: 'MasterAnalyst', text: masterText },
            { agent: 'FinalProver', text: proverText }
        ],
        lastTrade: tradeAction
    };

    fs.writeFileSync(LOG_PATH, JSON.stringify(discussion, null, 2));
    try {
        execSync('git add portfolio.json latest_discussion.json && git commit -m "Autonomous Cycle" && git push origin main');
    } catch(e) {}
}

runAutonomousWar();
