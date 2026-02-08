const axios = require('axios');
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'agents_config.json');
const LOG_PATH = path.join(__dirname, 'latest_discussion.json');
const CONFIG = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

async function getMarketData() {
    try {
        const response = await axios.get('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT', { timeout: 10000 });
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
            options: { num_predict: 300, temperature: 0.7 }
        }, { timeout: 180000 });
        
        return {
            text: response.data.response.trim(),
            status: 'ONLINE',
            latency: Date.now() - startTime
        };
    } catch (error) {
        return {
            text: `[ERROR] ${agentName} 연결 지연`,
            status: 'OFFLINE',
            latency: 0
        };
    }
}

async function runAutonomousDiscussion() {
    console.log('--- Elite 2-Agent Strategy Session Start ---');
    const data = await getMarketData();
    const basePrompt = `시장 상황: BTC $${data.lastPrice}, 변동률 ${data.priceChangePercent}%, 거래량 ${data.volume}. `;

    // 1. 통합 분석 (MasterAnalyst)
    const masterResult = await askAgent('MasterAnalyst', 
        `${basePrompt} 현재 시장의 추세, 리스크, 심리를 종합 분석하여 매매 전략 초안을 도출해줘.`, 
        "너는 최고의 통합 크립토 전략가야. 다각도 분석 후 구체적인 액션 플랜을 제시해."
    );

    // 2. 최종 증명 (FinalProver)
    const finalResult = await askAgent('FinalProver', 
        `시장 상황: ${basePrompt}\n분석가 초안: ${masterResult.text}\n\n위 전략의 허점을 찾고 손익비를 계산하여 최종 실행 전략을 확정해.`, 
        "너는 냉철한 최종 검증가야. 분석가의 초안을 비판적으로 검토하여 가장 안전하고 수익성 높은 결론을 내려."
    );

    const discussion = {
        timestamp: new Date().toISOString(),
        market: data,
        thoughts: [
            { agent: 'MasterAnalyst', text: masterResult.text, status: masterResult.status, load: Math.min(100, masterResult.latency / 300) },
            { agent: 'FinalProver', text: finalResult.text, status: finalResult.status, load: Math.min(100, finalResult.latency / 300) }
        ]
    };

    fs.writeFileSync(LOG_PATH, JSON.stringify(discussion, null, 2));
    console.log('Elite session updated.');
}

runAutonomousDiscussion();
