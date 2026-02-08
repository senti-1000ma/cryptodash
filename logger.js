const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const LOG_FILE = path.join(__dirname, 'backtest_log.json');
const SPREADSHEET_ID = '1M_XV6pbTH-NMvvr8HmoVKllzgcIFuutugFbAm3ruQPQ';

function logTrade(trade) {
    // 1. Local logging
    const logs = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
    const entry = {
        date: new Date().toISOString(),
        ...trade
    };
    logs.push(entry);
    fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2));
    
    // 2. Google Sheets sync (Attempt)
    // Note: This requires GOG_ACCOUNT and GOG_KEYRING_PASSWORD if keyring is used.
    // Since we are in a non-interactive shell, we'll try to append.
    try {
        const valuesJson = JSON.stringify([[entry.date, entry.symbol, entry.entryPrice, entry.exitPrice, entry.profit]]);
        const cmd = `gog sheets append ${SPREADSHEET_ID} "A:E" --values-json '${valuesJson}' --insert INSERT_ROWS --no-input`;
        execSync(cmd, { stdio: 'inherit' });
        console.log('Synced to Google Sheets');
    } catch (err) {
        console.error('Failed to sync to Google Sheets, kept in local log.');
    }
}

const [,, symbol, entryPrice, exitPrice, profit] = process.argv;
if (symbol) {
    logTrade({ symbol, entryPrice, exitPrice, profit: `${profit}%` });
}
