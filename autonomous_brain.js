const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CONFIG_PATH = path.join(__dirname, 'agents_config.json');
const LOG_PATH = path.join(__dirname, 'latest_discussion.json');
const PORTFOLIO_PATH = path.join(__dirname, 'portfolio.json');
const SPREADSHEET_ID = '1M_XV6pbTH-NMvvr8HmoVKllzgcIFuutugFbAm3ruQPQ';

const CONFIG = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

// 초기 포트폴리오 설정
if (!fs.existsSync(PORTFOLIO_PATH)) {
    fs.writeFileSync(PORTFOLIO_PATH, JSON.stringify({
        cash: 30000,
        positions: [],
        history: []
    }, null, 2));
}

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
    const startTime = Date.now();
    try {
        const response = await axios.post(`${CONFIG.ollama_base_url}/api/generate`, {
            model: model,
            system: systemRole,
            prompt: prompt,
            stream: false,
            options: { num_predict: 250, temperature: 0.7 }
        }, { timeout: 180000 });
        
        return {
            text: response.data.response.trim(),
            status: 'ONLINE',
            latency: Date.now() - startTime
        };
    } catch (error) {
        return { text: `[ERROR] ${agentName} 응답 지연`, status: 'OFFLINE', latency: 0 };
    }
}

async function logToGoogleSheet(trade) {
    try {
        const valuesJson = JSON.stringify([[new Date().toISOString(), trade.symbol, trade.side, trade.price, trade.amount, trade.pnl || '0']]);
        const cmd = `export GOG_ACCOUNT=tnqhd8545@gmail.com && export GOG_KEYRING_PASSWORD=deusfas && gog sheets append ${SPREADSHEET_ID} "시트1!A:F" --values-json '${valuesJson}' --insert INSERT_ROWS --no-input`;
        execSync(cmd);
    } catch (e) {
        console.error('Google Sheet Log Failed');
    }
}

async function runAutonomousDiscussion() {
    const data = await getMarketData();
    const portfolio = JSON.parse(fs.readFileSync(PORTFOLIO_PATH, 'utf8'));
    const basePrompt = `현재 시장: ${data.symbol} 가격 $${data.lastPrice}, 변동률 ${data.priceChangePercent}%. 보유현금: $${portfolio.cash}. `;

    // 1. 에이전트 토론
    const master = await askAgent('MasterAnalyst', `${basePrompt} 현재 데이터를 분석하고 전략 초안을 짜줘.`, "넌 최고의 분석가야.");
    const validator = await askAgent('FinalProver', 
        `분석가 의견: ${master.text}\n위 의견을 검토하고 [ACTION: BUY], [ACTION: SELL], [ACTION: HOLD] 중 하나를 반드시 포함하여 최종 결론을 내려줘.`, 
        "넌 엄격한 검증가야. 매수/매도 신호를 명확히 해야해.");

    // 2. 자동 매매 실행 로직
    let tradeAction = null;
    const decision = validator.text.toUpperCase();
    
    if (decision.includes('ACTION: BUY') && portfolio.cash > 1000) {
        const amount = 5000; // 회당 5000달러 투자
        const price = parseFloat(data.lastPrice);
        const size = amount / price;
        portfolio.cash -= amount;
        const newPos = { symbol: data.symbol, side: 'BUY', entry: price, amount, size, time: new Date().toISOString() };
        portfolio.positions.push(newPos);
        tradeAction = newPos;
        await logToGoogleSheet(newPos);
    } else if (decision.includes('ACTION: SELL') && portfolio.positions.length > 0) {
        const posIndex = portfolio.positions.findIndex(p => p.symbol === data.symbol);
        if (posIndex > -1) {
            const pos = portfolio.positions[posIndex];
            const price = parseFloat(data.lastPrice);
            const pnl = (price - pos.entry) * pos.size;
            portfolio.cash += (pos.amount + pnl);
            const closedPos = { ...pos, closePrice: price, pnl, closeTime: new Date().toISOString(), side: 'SELL' };
            portfolio.history.unshift(closedPos);
            portfolio.positions.splice(posIndex, 1);
            tradeAction = closedPos;
            await logToGoogleSheet(closedPos);
        }
    }

    // 3. 결과 저장
    fs.writeFileSync(PORTFOLIO_PATH, JSON.stringify(portfolio, null, 2));
    
    const discussion = {
        timestamp: new Date().toISOString(),
        market: data,
        portfolio: { total: portfolio.cash + portfolio.positions.reduce((a,b) => a + b.amount, 0), cash: portfolio.cash },
        thoughts: [
            { agent: 'MasterAnalyst', text: master.text, status: master.status, load: 100 },
            { agent: 'FinalProver', text: validator.text, status: validator.status, load: 100 }
        ],
        lastTrade: tradeAction
    };

    fs.writeFileSync(LOG_PATH, JSON.stringify(discussion, null, 2));
    // Git Push
    try {
        execSync('git add portfolio.json latest_discussion.json && git commit -m "Auto-Trade Update" && git push origin main');
    } catch(e) {}
}

runAutonomousDiscussion();
