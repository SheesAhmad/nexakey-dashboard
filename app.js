// NexaKey DataStore App Logic
let accounts = [];
let activeFilter = 'ALL';
let currentOperator = 'ALL';
let searchQuery = '';
let autoRefreshTimer = null;

const STORAGE_KEY_DB = 'nexakey_db_url';
const STORAGE_KEY_PASS = 'nexakey_db_pass';
const STORAGE_KEY_LOCAL = 'nexakey_local_cache';

// DOM Elements
const accountsList = document.getElementById('accountsList');
const searchInput = document.getElementById('searchInput');
const operatorFilter = document.getElementById('operatorFilter');
const tabButtons = document.querySelectorAll('.tab-btn');
const statCards = document.querySelectorAll('.stat-card');
const configModal = document.getElementById('configModal');
const openConfigBtn = document.getElementById('openConfigBtn');
const closeConfigBtn = document.getElementById('closeConfigBtn');
const saveConfigBtn = document.getElementById('saveConfigBtn');
const loadSampleDataBtn = document.getElementById('loadSampleDataBtn');
const dbUrlInput = document.getElementById('dbUrlInput');
const dbPasscode = document.getElementById('dbPasscode');
const copyAllValidBtn = document.getElementById('copyAllValidBtn');
const exportBtn = document.getElementById('exportBtn');
const toast = document.getElementById('toast');
const liveStatusText = document.getElementById('liveStatusText');

// Init
document.addEventListener('DOMContentLoaded', () => {
    // Load config from localStorage
    const savedUrl = localStorage.getItem(STORAGE_KEY_DB) || '';
    dbUrlInput.value = savedUrl;
    
    // Load local cache if available
    try {
        const local = JSON.parse(localStorage.getItem(STORAGE_KEY_LOCAL) || '[]');
        if (local && local.length > 0) {
            accounts = local;
            render();
        }
    } catch (e) {}

    fetchAccounts();

    // Start auto-poll every 5 seconds
    autoRefreshTimer = setInterval(fetchAccounts, 5000);

    setupEventListeners();
});

function setupEventListeners() {
    // Search
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase().trim();
        render();
    });

    // Operator dropdown
    operatorFilter.addEventListener('change', (e) => {
        currentOperator = e.target.value;
        render();
    });

    // Filter tabs
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeFilter = btn.dataset.filter;
            render();
        });
    });

    // Stat cards click to filter
    statCards.forEach(card => {
        card.addEventListener('click', () => {
            const status = card.dataset.status;
            if (!status) return;
            activeFilter = status;
            tabButtons.forEach(b => {
                b.classList.toggle('active', b.dataset.filter === status);
            });
            render();
        });
    });

    // Copy all valid
    copyAllValidBtn.addEventListener('click', () => {
        const validAccounts = accounts.filter(a => (a.status || '').toUpperCase() === 'VALID');
        if (validAccounts.length === 0) {
            showToast('No valid accounts to copy!');
            return;
        }
        const text = validAccounts.map(a => `${a.email}:${a.password}:${a.token}`).join('\n');
        navigator.clipboard.writeText(text).then(() => {
            showToast(`Copied ${validAccounts.length} valid combo(s)!`);
        });
    });

    // Export TXT
    exportBtn.addEventListener('click', () => {
        if (accounts.length === 0) {
            showToast('No accounts to export!');
            return;
        }
        const filtered = getFilteredAccounts();
        let content = `# NexaKey DataStore Export (${new Date().toLocaleString()})\n`;
        content += `# Total: ${filtered.length}\n\n`;
        filtered.forEach(a => {
            content += `[${a.status}] ${a.email}:${a.password}:${a.token} | Operator: ${a.operator || 'Unknown'} | Provider: ${a.provider || 'N/A'} | ${a.timestamp || ''}\n`;
        });
        
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `nexakey_export_${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Exported to TXT file!');
    });

    // Modal events
    openConfigBtn.addEventListener('click', () => configModal.classList.add('active'));
    closeConfigBtn.addEventListener('click', () => configModal.classList.remove('active'));
    configModal.addEventListener('click', (e) => {
        if (e.target === configModal) configModal.classList.remove('active');
    });

    saveConfigBtn.addEventListener('click', () => {
        const url = dbUrlInput.value.trim().replace(/\/$/, '');
        localStorage.setItem(STORAGE_KEY_DB, url);
        configModal.classList.remove('active');
        showToast('Database URL saved!');
        fetchAccounts();
    });

    loadSampleDataBtn.addEventListener('click', () => {
        loadSampleData();
        configModal.classList.remove('active');
        showToast('Demo data loaded!');
    });
}

// Fetch accounts from REST / Firebase
async function fetchAccounts() {
    const dbUrl = localStorage.getItem(STORAGE_KEY_DB);
    if (!dbUrl) {
        liveStatusText.textContent = accounts.length > 0 ? 'Local Mode' : 'Configure Database';
        return;
    }

    try {
        // Firebase Realtime DB format: URL/accounts.json
        let endpoint = dbUrl.endsWith('.json') ? dbUrl : `${dbUrl}/accounts.json`;
        const res = await fetch(endpoint);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        
        const data = await res.json();
        if (!data) {
            accounts = [];
        } else if (Array.isArray(data)) {
            accounts = data.filter(Boolean);
        } else if (typeof data === 'object') {
            // Convert Firebase key-value object to array
            accounts = Object.keys(data).map(key => ({
                id: key,
                ...data[key]
            }));
        }

        // Sort by timestamp descending (newest first)
        accounts.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

        // Save local cache
        localStorage.setItem(STORAGE_KEY_LOCAL, JSON.stringify(accounts));
        liveStatusText.textContent = `Connected (${accounts.length} synced)`;
        render();
    } catch (e) {
        liveStatusText.textContent = 'Sync Offline / Check URL';
    }
}

function getFilteredAccounts() {
    return accounts.filter(acc => {
        // Status filter
        const status = (acc.status || '').toUpperCase();
        if (activeFilter !== 'ALL' && status !== activeFilter) return false;

        // Operator filter
        const op = acc.operator || 'Unknown';
        if (currentOperator !== 'ALL' && op !== currentOperator) return false;

        // Search query
        if (searchQuery) {
            const haystack = `${acc.email || ''} ${acc.token || ''} ${acc.operator || ''} ${acc.provider || ''} ${acc.timestamp || ''}`.toLowerCase();
            if (!haystack.includes(searchQuery)) return false;
        }

        return true;
    });
}

function render() {
    updateStats();
    updateOperatorDropdown();

    const filtered = getFilteredAccounts();

    if (filtered.length === 0) {
        accountsList.innerHTML = `
            <div class="empty-state">
                <div style="font-size: 36px; margin-bottom: 12px;">📭</div>
                <p>No accounts found matching your filters.</p>
                <small style="color: var(--text-muted);">Accounts generated by NexaKey Gen will show up here automatically.</small>
            </div>
        `;
        return;
    }

    accountsList.innerHTML = filtered.map(acc => {
        const status = (acc.status || 'VALID').toUpperCase();
        const email = acc.email || 'N/A';
        const pass = acc.password || '';
        const token = acc.token || '';
        const op = acc.operator || 'User';
        const provider = acc.provider || 'Draxono';
        const ts = acc.timestamp ? new Date(acc.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' }) : 'Recent';
        const combo = `${email}:${pass}:${token}`;

        return `
            <div class="account-card">
                <div class="account-left">
                    <span class="status-badge ${status}">${status}</span>
                    <div class="account-main-details">
                        <div class="account-combo-line">${escapeHtml(combo)}</div>
                        <div class="account-meta-line">
                            <span class="meta-item">👤 <strong>${escapeHtml(op)}</strong></span>
                            <span class="meta-item">⚡ <strong>${escapeHtml(provider)}</strong></span>
                            <span class="meta-item">🕒 ${ts}</span>
                        </div>
                    </div>
                </div>
                <div class="account-actions">
                    <button class="copy-btn" onclick="copyText('${escapeJs(combo)}', 'Combo copied!')">📋 Copy Combo</button>
                    <button class="copy-btn" onclick="copyText('${escapeJs(token)}', 'Token copied!')">🎫 Copy Token</button>
                </div>
            </div>
        `;
    }).join('');
}

function updateStats() {
    let total = accounts.length;
    let valid = 0, locked = 0, invalid = 0;

    accounts.forEach(a => {
        const s = (a.status || '').toUpperCase();
        if (s === 'VALID') valid++;
        else if (s === 'LOCKED') locked++;
        else if (s === 'INVALID') invalid++;
    });

    document.getElementById('statTotal').textContent = total;
    document.getElementById('statValid').textContent = valid;
    document.getElementById('statLocked').textContent = locked;
    document.getElementById('statInvalid').textContent = invalid;

    document.getElementById('countAll').textContent = total;
    document.getElementById('countValid').textContent = valid;
    document.getElementById('countLocked').textContent = locked;
    document.getElementById('countInvalid').textContent = invalid;
}

function updateOperatorDropdown() {
    const ops = new Set(accounts.map(a => a.operator || 'User'));
    const currentVal = operatorFilter.value;
    
    let html = '<option value="ALL">👤 All Operators</option>';
    ops.forEach(op => {
        html += `<option value="${escapeHtml(op)}"${op === currentVal ? ' selected' : ''}>👤 ${escapeHtml(op)}</option>`;
    });
    operatorFilter.innerHTML = html;
}

function copyText(text, msg = 'Copied to clipboard!') {
    navigator.clipboard.writeText(text).then(() => showToast(msg));
}

function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2200);
}

function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeJs(str) {
    return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
}

// Sample mock data for demo testing
function loadSampleData() {
    const sampleOperators = ['Shees', 'Alex', 'Shadow', 'Ghost'];
    const sampleProviders = ['Draxono', 'CyberTemp', 'Hotmail007'];
    
    accounts = [
        {
            email: 'shees.gen991@luckyharbor.cyou',
            password: 'Pass_' + Math.random().toString(36).substring(7),
            token: 'OTgzNDUx' + Math.random().toString(36).substring(2, 15) + '.' + Math.random().toString(36).substring(2, 25),
            status: 'VALID',
            operator: 'Shees',
            provider: 'Draxono',
            timestamp: new Date().toISOString()
        },
        {
            email: 'alex_nitro44@dianeplumber.mom',
            password: 'Pass_' + Math.random().toString(36).substring(7),
            token: 'MTA0ODk0' + Math.random().toString(36).substring(2, 15) + '.' + Math.random().toString(36).substring(2, 25),
            status: 'VALID',
            operator: 'Alex',
            provider: 'CyberTemp',
            timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString()
        },
        {
            email: 'locked_acc_12@coldmails.shop',
            password: 'Pass_' + Math.random().toString(36).substring(7),
            token: 'MTEwNDUx' + Math.random().toString(36).substring(2, 15) + '.' + Math.random().toString(36).substring(2, 25),
            status: 'LOCKED',
            operator: 'Shadow',
            provider: 'Draxono',
            timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString()
        }
    ];

    localStorage.setItem(STORAGE_KEY_LOCAL, JSON.stringify(accounts));
    render();
}
