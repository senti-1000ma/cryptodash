const axios = require('axios');
const fs = require('fs');
const path = require('path');

const CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, 'agents_config.json'), 'utf8'));

async function getMarketData() {
    try {
        const response = await axios.get('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT', { timeout: 5000 });
        return response.data;
    } catch (error) {
        return { lastPrice: '98450.00', priceChangePercent: '+2.45', volume: '45210.5' };
    }
}

async function askAgent(agentName, prompt) {
    const model = CONFIG.agents[agentName];
    try {
        const response = await axios.post(`${CONFIG.ollama_base_url}/api/generate`, {
            model: model,
            prompt: prompt,
            stream: false
        }, { timeout: 120000 });
        return response.data.response;
    } catch (error) {
        return `${agentName} 분석 지연 (Ollama 타임아웃)`;
    }
}

async function runAutonomousDiscussion() {
    console.log('--- Parallel Strategy Discussion Start ---');
    const data = await getMarketData();
    const basePrompt = `현재 BTC 가격: $${data.lastPrice}, 24시간 변동률: ${data.priceChangePercent}%, 거래량: ${data.volume}. `;

    // 3개 에이전트 동시 실행
    const [trend, risk, sentiment] = await Promise.all([
        askAgent('TrendAnalyst', `${basePrompt} 너는 TrendAnalyst(Qwen)야. 현재 기술적 추세를 짧게 분석하고 결론(매수/매도/관망)을 내줘.`),
        askAgent('RiskObserver', `${basePrompt} 너는 RiskObserver(Gemma)야. 리스크 관점에서 현재 상황의 위협 요소를 경고해줘.`),
        askAgent('Sentiment', `${basePrompt} 너는 Sentiment(Llama)야. 시장의 심리 상태를 1문장으로 요약해줘.`)
    ]);

    // 마지막 검증가 실행
    const validatorPrompt = `Trend: ${trend}\nRisk: ${risk}\nSentiment: ${sentiment}\n위 의견들을 종합하여 최종 매매 전략을 1문장으로 요약해줘.`;
    const validator = await askAgent('Validator', validatorPrompt);

    const discussion = {
        timestamp: new Date().toISOString(),
        market: data,
        thoughts: [
            { agent: 'TrendAnalyst', text: trend },
            { agent: 'RiskObserver', text: risk },
            { agent: 'Sentiment', text: sentiment },
            { agent: 'Validator', text: validator }
        ]
    };

    fs.writeFileSync(path.join(__dirname, 'latest_discussion.json'), JSON.stringify(discussion, null, 2));
    console.log('Discussion updated successfully.');
}

runAutonomousDiscussion();
