// --- STATE MANAGEMENT ---
const state = {
    direction: 'JPY_TO_EUR',
    rate: 160.00,
    lastUpdate: null,
    inputValue: '0',
    bankFee: 2.0,
    shopFee: 5.0,
    history: []
};

// Costanti
const API_URL = 'https://open.er-api.com/v6/latest/EUR';
const STORAGE_KEY = 'travel_fx_state';
let autosaveTimer = null;

// --- INIZIALIZZAZIONE ---
function init() {
    loadState();
    registerServiceWorker();
    setupEventListeners();
    updateDOM();
    fetchRate(); 
}

// --- NETWORK E DATI ---
async function fetchRate() {
    const statusEl = document.getElementById('status-indicator');
    statusEl.textContent = "Aggiornamento in corso...";
    statusEl.className = 'status-offline';

    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error('Network error');
        const data = await response.json();
        
        state.rate = data.rates.JPY;
        state.lastUpdate = new Date().getTime();
        saveState();
        
        statusEl.textContent = `Online - Aggiornato ora`;
        statusEl.className = 'status-online';
        document.getElementById('custom-rate').value = state.rate;
        updateDOM();
    } catch (error) {
        const dateStr = state.lastUpdate ? new Date(state.lastUpdate).toLocaleString() : 'Mai';
        statusEl.textContent = `Offline (Tasso: ${dateStr})`;
        statusEl.className = 'status-offline';
    }
}

function loadState() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        const parsed = JSON.parse(saved);
        state.rate = parsed.rate || state.rate;
        state.lastUpdate = parsed.lastUpdate || state.lastUpdate;
        state.bankFee = parsed.bankFee ?? state.bankFee;
        state.shopFee = parsed.shopFee ?? state.shopFee;
        state.history = parsed.history || [];
        
        document.getElementById('custom-rate').value = state.rate;
        document.getElementById('bank-fee').value = state.bankFee;
        document.getElementById('shop-fee').value = state.shopFee;
    }
}

function saveState() {
    const toSave = { ...state, inputValue: '0' }; 
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
}

// --- LOGICA DI CALCOLO ---
function calculate() {
    const amount = parseFloat(state.inputValue) || 0;
    if (amount === 0) return { base: 0, fee: 0, total: 0, feeText: '' };

    if (state.direction === 'JPY_TO_EUR') {
        const baseEur = amount / state.rate;
        const feeAmount = baseEur * (state.bankFee / 100);
        return {
            base: baseEur,
            fee: feeAmount,
            total: baseEur + feeAmount,
            feeText: `+ ${feeAmount.toFixed(2)} € (Comm. Banca ${state.bankFee}%)`
        };
    } else {
        const baseYen = amount * state.rate;
        const feeAmount = baseYen * (state.shopFee / 100);
        return {
            base: baseYen,
            fee: feeAmount,
            total: baseYen - feeAmount,
            feeText: `- ${Math.round(feeAmount)} ¥ (Comm. Cambio ${state.shopFee}%)`
        };
    }
}

// --- AUTOSAVE (DEBOUNCE) ---
function triggerAutosave() {
    clearTimeout(autosaveTimer);
    
    autosaveTimer = setTimeout(() => {
        const amt = parseFloat(state.inputValue);
        if (amt && amt > 0) {
            const calc = calculate();
            
            state.history.push({
                time: new Date().getTime(),
                dir: state.direction,
                inAmount: amt,
                outTotal: calc.total,
                rate: state.rate,
                fee: state.direction === 'JPY_TO_EUR' ? state.bankFee : state.shopFee
            });
            
            if(state.history.length > 50) state.history.shift(); 
            
            saveState();
            updateHistory(); 
            
            const statusEl = document.getElementById('status-indicator');
            const oldText = statusEl.textContent;
            const oldClass = statusEl.className;
            
            statusEl.textContent = "Salvato ✓";
            statusEl.className = 'status-online';
            
            setTimeout(() => {
                statusEl.textContent = oldText;
                statusEl.className = oldClass;
            }, 1500);
        }
    }, 2000);
}

// --- DOM UPDATES ---
function updateDOM() {
    const inputDisplay = document.getElementById('input-display');
    inputDisplay.textContent = state.direction === 'JPY_TO_EUR' 
        ? Number(state.inputValue).toLocaleString('it-IT') 
        : state.inputValue;

    document.getElementById('from-currency-label').textContent = state.direction === 'JPY_TO_EUR' ? 'JPY' : 'EUR';
    document.getElementById('to-currency-label').textContent = state.direction === 'JPY_TO_EUR' ? 'EUR' : 'JPY';

    const calc = calculate();
    const isJpyToEur = state.direction === 'JPY_TO_EUR';
    
    document.getElementById('output-base').textContent = isJpyToEur 
        ? `${calc.base.toFixed(2)} €` 
        : `${Math.round(calc.base).toLocaleString('it-IT')} ¥`;
        
    document.getElementById('fee-breakdown').textContent = calc.fee > 0 ? calc.feeText : 'Nessuna commissione';
    
    document.getElementById('output-total').textContent = isJpyToEur 
        ? `Tot: ${calc.total.toFixed(2)} €` 
        : `Netto: ${Math.round(calc.total).toLocaleString('it-IT')} ¥`;

    updateCheatSheet();
    updateHistory();
}

function updateCheatSheet() {
    const tbody = document.getElementById('cheatsheet-body');
    tbody.innerHTML = '';
    const isJpyToEur = state.direction === 'JPY_TO_EUR';
    
    document.getElementById('cs-col-from').textContent = isJpyToEur ? 'JPY' : 'EUR';
    document.getElementById('cs-col-total').textContent = isJpyToEur ? 'EUR (con Fee)' : 'JPY (Netto)';

    const amounts = isJpyToEur 
        ? [100, 500, 1000, 5000, 10000, 50000] 
        : [1, 5, 10, 20, 50, 100];

    amounts.forEach(amt => {
        const tr = document.createElement('tr');
        if (isJpyToEur) {
            const baseEur = amt / state.rate;
            const totalEur = baseEur * (1 + state.bankFee / 100);
            tr.innerHTML = `<td>${amt.toLocaleString('it-IT')}</td><td>${baseEur.toFixed(2)} €</td><td><strong>${totalEur.toFixed(2)} €</strong></td>`;
        } else {
            const baseYen = amt * state.rate;
            const totalYen = baseYen * (1 - state.shopFee / 100);
            tr.innerHTML = `<td>${amt} €</td><td>${Math.round(baseYen).toLocaleString('it-IT')} ¥</td><td><strong>${Math.round(totalYen).toLocaleString('it-IT')} ¥</strong></td>`;
        }
        tbody.appendChild(tr);
    });
}

function updateHistory() {
    const list = document.getElementById('history-list');
    list.innerHTML = '';
    
    [...state.history].reverse().forEach((item, index) => {
        const li = document.createElement('li');
        li.className = 'history-item';
        
        const date = new Date(item.time).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute:'2-digit' });
        
        let html = `<div class="history-details">
            <span class="history-time">${date}</span>`;
            
        if(item.dir === 'JPY_TO_EUR') {
            html += `<strong>${item.inAmount} ¥ ➔ ${item.outTotal.toFixed(2)} €</strong>`;
            html += `<small>Tasso: ${item.rate} (Fee: ${item.fee}%)</small>`;
        } else {
            html += `<strong>${item.inAmount} € ➔ ${Math.round(item.outTotal)} ¥</strong>`;
            html += `<small>Tasso: ${item.rate} (Fee: ${item.fee}%)</small>`;
        }
        
        html += `</div>
            <button class="del-history" data-index="${state.history.length - 1 - index}">🗑</button>`;
            
        li.innerHTML = html;
        list.appendChild(li);
    });
}

// --- AZIONI CONDIVISE ---
function swapCurrencies() {
    state.direction = state.direction === 'JPY_TO_EUR' ? 'EUR_TO_JPY' : 'JPY_TO_EUR';
    state.inputValue = '0'; 
    updateDOM();
}

// --- EVENT LISTENERS ---
function setupEventListeners() {
    // Navigazione Menu
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active', 'hidden'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
            
            e.target.classList.add('active');
            document.getElementById(e.target.dataset.target).classList.remove('hidden');
            document.getElementById(e.target.dataset.target).classList.add('active');
        });
    });

    // Tastierino
    document.querySelectorAll('.key').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const val = e.target.dataset.val;
            if (val === 'C') {
                state.inputValue = '0';
            } else if (val === 'DEL') {
                state.inputValue = state.inputValue.length > 1 ? state.inputValue.slice(0, -1) : '0';
            } else {
                if (state.inputValue === '0') state.inputValue = val;
                else if (state.inputValue.length < 10) state.inputValue += val;
            }
            updateDOM();
            triggerAutosave();
        });
    });

    // Eventi di Swap (Pulsante e Click sulle Card)
    document.getElementById('swap-btn').addEventListener('click', swapCurrencies);
    document.getElementById('card-from').addEventListener('click', swapCurrencies);
    document.getElementById('card-to').addEventListener('click', swapCurrencies);

    // Altri Eventi
    document.getElementById('toggle-cheatsheet-btn').addEventListener('click', (e) => {
        state.direction = state.direction === 'JPY_TO_EUR' ? 'EUR_TO_JPY' : 'JPY_TO_EUR';
        e.target.textContent = state.direction === 'JPY_TO_EUR' ? 'Mostra EUR ➔ JPY' : 'Mostra JPY ➔ EUR';
        updateDOM();
    });

    document.getElementById('history-list').addEventListener('click', (e) => {
        if(e.target.classList.contains('del-history')) {
            const idx = parseInt(e.target.dataset.index);
            state.history.splice(idx, 1);
            saveState();
            updateDOM();
        }
    });

    document.getElementById('clear-history-btn').addEventListener('click', () => {
        if(confirm('Cancellare tutta la cronologia?')) {
            state.history = [];
            saveState();
            updateDOM();
        }
    });

    document.getElementById('custom-rate').addEventListener('change', (e) => {
        const val = parseFloat(e.target.value);
        if(val > 0) { state.rate = val; saveState(); updateDOM(); }
    });
    
    document.getElementById('bank-fee').addEventListener('change', (e) => {
        state.bankFee = parseFloat(e.target.value) || 0; saveState(); updateDOM();
    });
    
    document.getElementById('shop-fee').addEventListener('change', (e) => {
        state.shopFee = parseFloat(e.target.value) || 0; saveState(); updateDOM();
    });

    document.getElementById('force-fetch-btn').addEventListener('click', fetchRate);
}

// --- SERVICE WORKER ---
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then(reg => console.log('SW registrato', reg.scope))
                .catch(err => console.error('Errore SW', err));
        });
    }
}

init();