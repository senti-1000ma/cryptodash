const fs = require('fs');
const path = require('path');
const WebSocket = require('ws'); // npm install ws 필요할 수 있음

const LOG_FILE = path.join(__dirname, 'backtest_log.json');
const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];

const ws = new WebSocket('wss://stream.binance.com:9443/ws/' + symbols.map(s => s.toLowerCase() + '@ticker').join('/'));

console.log('Monitoring prices...');

ws.on('message', (data) => {
    const ticker = JSON.parse(data);
    // 여기서 전략 로직 실행 및 로그 기록 가능
    // 예: console.log(`${ticker.s}: ${ticker.c}`);
});
