// Client-side logic extracted from template; attaches event listeners on DOM ready.
// ─── CLIENT STATE ──────────────────────────────────────────────────────────
// blockchain array is maintained client-side for rendering,
// but all logic (hashing, PoW, validation) runs in Python (Flask).
let blockchain = [];
let difficulty = 3;
let mining = false;

// ─── SSE STREAMING FETCH ───────────────────────────────────────────────────
async function streamPost(url, body, onProgress, onEvent) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop();
    for (const part of parts) {
      for (const line of part.split('\n')) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.progress) {
              onProgress && onProgress(data);
            } else {
              onEvent && onEvent(data);
            }
          } catch (e) { /* ignore parse errors */ }
        }
      }
    }
  }
}

// ─── INITIALIZE CHAIN ─────────────────────────────────────────────────────
async function initBlockchain() {
  difficulty = parseInt(document.getElementById('difficulty-slider').value);
  blockchain = [];
  setMiningUI(true);

  await streamPost(
    '/api/init',
    { difficulty },
    (d) => { document.getElementById('mine-nonce').textContent = `nonce: ${d.nonce.toLocaleString()}`; },
    (d) => {
      if (d.done) {
        blockchain = d.chain;
        setMiningUI(false);
        updateUI();
        document.getElementById('add-panel').style.display = 'block';
        document.getElementById('chain-panel').style.display = 'block';
        document.getElementById('tamper-panel').style.display = 'block';
        hideValidation();
        showToast('⬡ Genesis block mined. Chain initialized.');
      }
    }
  );
}

// ─── ADD BLOCK ─────────────────────────────────────────────────────────────
async function addBlock() {
  if (mining) return;
  const dataInput = document.getElementById('block-data');
  const data = dataInput.value.trim();
  if (!data) { showToast('⚠ Enter transaction data first.'); return; }

  setMiningUI(true);

  await streamPost(
    '/api/add_block',
    { data },
    (d) => { document.getElementById('mine-nonce').textContent = `nonce: ${d.nonce.toLocaleString()}`; },
    (d) => {
      if (d.done) {
        blockchain = d.chain;
        dataInput.value = '';
        setMiningUI(false);
        updateUI();
        hideValidation();
        showToast(`✓ Block #${d.block.index} mined. Nonce: ${d.block.nonce.toLocaleString()}`);
      }
    }
  );
}

// ─── LOAD SAMPLE BLOCKS ────────────────────────────────────────────────────
async function addSampleBlocks() {
  if (mining) return;
  setMiningUI(true);

  await streamPost(
    '/api/add_samples',
    {},
    (d) => {
      document.getElementById('mine-nonce').textContent = `nonce: ${d.nonce.toLocaleString()}`;
    },
    (d) => {
      if (d.block_done) {
        blockchain = d.chain;
        updateBlockCards();
        updateTamperSelect();
        document.getElementById('stat-blocks').textContent = blockchain.length;
        showToast(`✓ Block #${d.block.index} mined. Nonce: ${d.block.nonce.toLocaleString()}`);
      }
      if (d.all_done) {
        blockchain = d.chain;
        setMiningUI(false);
        updateUI();
        hideValidation();
        showToast('✓ 4 sample blocks added.');
      }
    }
  );
}

// ─── VALIDATE CHAIN ────────────────────────────────────────────────────────
async function validateChain() {
  const res = await fetch('/api/validate', { method: 'POST' });
  const data = await res.json();
  blockchain = data.chain;

  const resultEl = document.getElementById('validation-result');
  resultEl.className = data.valid ? 'valid' : 'invalid';
  resultEl.style.display = 'flex';
  document.getElementById('val-message').textContent = data.message;
  document.querySelector('#validation-result .val-icon').textContent = data.valid ? '✓' : '✗';
  updateBlockCards();
  showToast(data.valid ? '✓ Chain is valid.' : '✗ Chain integrity compromised!');
}

// ─── TAMPER BLOCK ──────────────────────────────────────────────────────────
async function tamperBlock() {
  const idx = parseInt(document.getElementById('tamper-index').value);
  const newData = document.getElementById('tamper-data').value.trim();
  if (!newData) { showToast('⚠ Enter new data to tamper.'); return; }

  const res = await fetch('/api/tamper', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ index: idx, data: newData })
  });
  const result = await res.json();
  if (result.success) {
    blockchain = result.chain;
    updateBlockCards();
    hideValidation();
    showToast(`⚠ Block #${idx} data tampered. Validate chain to detect.`);
  }
}

// ─── REHASH FROM ───────────────────────────────────────────────────────────
async function rehashFrom() {
  const idx = parseInt(document.getElementById('tamper-index').value);
  setMiningUI(true);

  await streamPost(
    '/api/rehash',
    { from_index: idx },
    (d) => {
      const label = d.block_index !== undefined
        ? `block #${d.block_index} · nonce: ${d.nonce.toLocaleString()}`
        : `nonce: ${d.nonce.toLocaleString()}`;
      document.getElementById('mine-nonce').textContent = label;
    },
    (d) => {
      if (d.done) {
        blockchain = d.chain;
        setMiningUI(false);
        updateBlockCards();
        hideValidation();
        showToast(`↺ Rehashed from block #${idx}. Chain reconstructed.`);
      }
    }
  );
}

// ─── RESET ─────────────────────────────────────────────────────────────────
async function resetChain() {
  await fetch('/api/reset', { method: 'POST' });
  blockchain = [];
  difficulty = 3;
  document.getElementById('add-panel').style.display = 'none';
  document.getElementById('chain-panel').style.display = 'none';
  document.getElementById('tamper-panel').style.display = 'none';
  document.getElementById('chain-container').innerHTML = '';
  document.getElementById('stat-blocks').textContent = '0';
  document.getElementById('stat-status').textContent = '—';
  document.getElementById('stat-status').style.color = 'var(--muted)';
  hideValidation();
  showToast('↺ Chain reset.');
}

// ─── UI HELPERS ────────────────────────────────────────────────────────────
function setMiningUI(active) {
  mining = active;
  document.getElementById('mine-btn').disabled = active;
  document.getElementById('mining-status').classList.toggle('active', active);
  if (!active) document.getElementById('mine-nonce').textContent = 'nonce: 0';
}

function hideValidation() {
  const el = document.getElementById('validation-result');
  el.style.display = 'none';
  el.className = '';
}

function updateUI() {
  updateBlockCards();
  updateTamperSelect();
  document.getElementById('stat-blocks').textContent = blockchain.length;
  document.getElementById('stat-status').textContent = 'VALID';
  document.getElementById('stat-status').style.color = 'var(--green)';
}

function updateBlockCards() {
  const container = document.getElementById('chain-container');
  container.innerHTML = '';
  blockchain.forEach((block, i) => {
    if (i > 0) {
      const conn = document.createElement('div');
      conn.className = 'connector';
      container.appendChild(conn);
    }
    const link = document.createElement('div');
    link.className = 'chain-link';
    const isGenesis = i === 0;
    const ts = new Date(block.timestamp).toLocaleString();
    link.innerHTML = `
      <div class="block-card ${isGenesis ? 'genesis' : ''}">
        <div class="block-header">
          <div class="block-index ${isGenesis ? 'genesis-idx' : ''}">#${String(block.index).padStart(3,'0')}</div>
          <span class="block-badge ${isGenesis ? 'badge-genesis' : 'badge-mined'}">${isGenesis ? 'GENESIS' : 'MINED'}</span>
        </div>
        <div class="block-grid">
          <div class="block-field">
            <span class="bf-label">TIMESTAMP</span>
            <span class="bf-value">${ts}</span>
          </div>
          <div class="block-field">
            <span class="bf-label">NONCE</span>
            <span class="bf-value nonce-val">${block.nonce.toLocaleString()}</span>
          </div>
          <div class="block-field full">
            <span class="bf-label">DATA</span>
            <span class="bf-value data-val">${escapeHtml(block.data)}</span>
          </div>
          <div class="block-field full">
            <span class="bf-label">PREVIOUS HASH</span>
            <span class="bf-value prev-hash">${block.previousHash}</span>
          </div>
          <div class="block-field full">
            <span class="bf-label">BLOCK HASH</span>
            <span class="bf-value hash-val">${block.hash}</span>
          </div>
        </div>
        <div class="pow-indicator">
          <div class="pow-dot"></div>
          PROOF-OF-WORK SATISFIED · LEADING ZEROS: ${difficulty}
        </div>
      </div>`;
    container.appendChild(link);
  });
}

function updateTamperSelect() {
  const sel = document.getElementById('tamper-index');
  sel.innerHTML = '';
  blockchain.forEach((_, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `Block #${i}`;
    sel.appendChild(opt);
  });
  if (blockchain.length > 1) sel.value = 1;
}

function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

// Attach UI event listeners after DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const initBtn = document.getElementById('init-btn');
  if (initBtn) initBtn.addEventListener('click', initBlockchain);

  const resetBtn = document.getElementById('reset-btn');
  if (resetBtn) resetBtn.addEventListener('click', resetChain);

  const mineBtn = document.getElementById('mine-btn');
  if (mineBtn) mineBtn.addEventListener('click', addBlock);

  const loadSamplesBtn = document.getElementById('load-samples-btn');
  if (loadSamplesBtn) loadSamplesBtn.addEventListener('click', addSampleBlocks);

  const validateBtn = document.getElementById('validate-btn');
  if (validateBtn) validateBtn.addEventListener('click', validateChain);

  const tamperBtn = document.getElementById('tamper-btn');
  if (tamperBtn) tamperBtn.addEventListener('click', tamperBlock);

  const rehashBtn = document.getElementById('rehash-btn');
  if (rehashBtn) rehashBtn.addEventListener('click', rehashFrom);

  const difficultySlider = document.getElementById('difficulty-slider');
  if (difficultySlider) {
    difficultySlider.addEventListener('input', function() {
      document.getElementById('diff-display').textContent = this.value;
      document.getElementById('stat-diff').textContent = this.value;
    });
  }
});
