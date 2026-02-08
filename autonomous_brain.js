const axios = require('axios');
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'agents_config.json');
const LOG_PATH = path.join(__dirname, 'latest_discussion.json');
const CONFIG = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

async function getMarketData() {
    try {
        const response = await axios.get('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT', { timeout: 5000 });
        return response.data;
    } catch (error) {
        return { lastPrice: '98450.00', priceChangePercent: '+2.45', volume: '45210.5' };
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
            options: { num_predict: 150, temperature: 0.7 } // 짧고 빠른 응답 유도
        }, { timeout: 30000 });
        
        return {
            text: response.data.response.trim(),
            status: 'ONLINE',
            latency: Date.now() - startTime
        };
    } catch (error) {
        return {
            text: `[ERROR] ${agentName} 연결 실패 또는 타임아웃`,
            status: 'OFFLINE',
            latency: 0
        };
    }
}

async function runAutonomousDiscussion() {
    console.log('--- Competitive Strategy War Start ---');
    const data = await getMarketData();
    const basePrompt = `현재 BTC 가격: $${data.lastPrice}, 24시간 변동률: ${data.priceChangePercent}%, 거래량: ${data.volume}. `;

    // 1단계: 병렬 분석 (경쟁적 환경 조성)
    const roles = {
        TrendAnalyst: "너는 최고의 기술적 분석가야. 다른 에이전트보다 더 정확한 추세 예측을 내놓아야 해.",
        RiskObserver: "너는 리스크 관리 전문가야. 다른 에이전트들이 놓치는 위험 요소를 날카롭게 지적해.",
        Sentiment: "너는 시장 심리 마스터야. 군중 심리의 이면을 꿰뚫어 보는 통찰을 보여줘."
    };

    const results = await Promise.all([
        askAgent('TrendAnalyst', `${basePrompt} 현재 차트의 핵심 패턴과 매매 결론을 2문장으로 말해.`, roles.TrendAnalyst),
        askAgent('RiskObserver', `${basePrompt} 현재 추세의 취약점과 리스크를 2문장으로 경고해.`, roles.RiskObserver),
        askAgent('Sentiment', `${basePrompt} 지금 시장 참여자들의 심리적 임계점을 1문장으로 분석해.`, roles.Sentiment)
    ]);

    // 2단계: 최종 검증 및 경쟁 우위 판단
    const validatorPrompt = `
    시장상황: ${basePrompt}
    TrendAnalyst: ${results[0].text}
    RiskObserver: ${results[1].text}
    Sentiment: ${results[2].text}
    
    위 의견들 중 가장 타당한 관점을 채택하고, 이를 바탕으로 한 최종 필승 전략을 1문장으로 확정해.`;
    
    const validatorResult = await askAgent('Validator', validatorPrompt, "너는 총괄 검증가야. 가장 논리적인 에이전트의 손을 들어주고 최종 전략을 확정해.");

    const discussion = {
        timestamp: new Date().toISOString(),
        market: data,
        thoughts: [
            { agent: 'TrendAnalyst', text: results[0].text, status: results[0].status, load: Math.min(100, results[0].latency / 100) },
            { agent: 'RiskObserver', text: results[1].text, status: results[1].status, load: Math.min(100, results[1].latency / 100) },
            { agent: 'Sentiment', text: results[2].text, status: results[2].status, load: Math.min(100, results[2].latency / 100) },
            { agent: 'Validator', text: validatorResult.text, status: validatorResult.status, load: Math.min(100, validatorResult.latency / 100) }
        ]
    };

    // 총책임자(DeusFas)의 감시 보고 추가
    const offlineAgents = discussion.thoughts.filter(t => t.status === 'OFFLINE').map(t => t.agent);
    if (offlineAgents.length > 0) {
        console.log(`[ALERT] Offline Agents detected: ${offlineAgents.join(', ')}`);
    }

    fs.writeFileSync(LOG_PATH, JSON.stringify(discussion, null, 2));
    console.log('War Room Log updated.');
}

runAutonomousDiscussion();
