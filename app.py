import hashlib
import datetime
import json
from flask import Flask, request, jsonify, Response, render_template

app = Flask(__name__)

# ── In-memory blockchain state ──────────────────────────────────────────────
blockchain = []
difficulty = 3


# ── Core blockchain logic ────────────────────────────────────────────────────

def compute_hash(index, timestamp, data, previous_hash, nonce):
    """SHA-256 hash of all block fields concatenated."""
    raw = f"{index}{timestamp}{data}{previous_hash}{nonce}"
    return hashlib.sha256(raw.encode()).hexdigest()


def mine(index, timestamp, data, previous_hash, diff):
    """
    Proof-of-Work: increment nonce until hash starts with `diff` leading zeros.
    Returns a generator that streams SSE progress events, then a final done event.
    """
    target = '0' * diff
    nonce = 0
    while True:
        h = compute_hash(index, timestamp, data, previous_hash, nonce)
        if h.startswith(target):
            yield nonce, h
            return
        nonce += 1


# ── SSE helper ───────────────────────────────────────────────────────────────

def sse(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


def stream_mine(index, timestamp, data, previous_hash, diff):
    """
    Generator for SSE-streaming a single block's PoW.
    Yields progress events every 500 nonces, then a done event.
    """
    target = '0' * diff
    nonce = 0
    while True:
        h = compute_hash(index, timestamp, data, previous_hash, nonce)
        if h.startswith(target):
            yield sse({'done': True, 'nonce': nonce, 'hash': h})
            return
        nonce += 1
        if nonce % 500 == 0:
            yield sse({'progress': True, 'nonce': nonce})


# ── Routes ───────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/init', methods=['POST'])
def init_chain():
    """Initialize chain: clear state, mine genesis block (streamed)."""
    global blockchain, difficulty
    body = request.get_json()
    difficulty = int(body.get('difficulty', 3))
    blockchain = []
    ts = datetime.datetime.utcnow().isoformat()

    def generate():
        target = '0' * difficulty
        nonce = 0
        while True:
            h = compute_hash(0, ts, 'Genesis Block', '0000000000000000', nonce)
            if h.startswith(target):
                block = {
                    'index': 0,
                    'timestamp': ts,
                    'data': 'Genesis Block',
                    'previousHash': '0000000000000000',
                    'nonce': nonce,
                    'hash': h
                }
                blockchain.append(block)
                yield sse({'done': True, 'block': block, 'chain': blockchain})
                return
            nonce += 1
            if nonce % 500 == 0:
                yield sse({'progress': True, 'nonce': nonce})

    return Response(generate(), mimetype='text/event-stream',
                    headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})


@app.route('/api/add_block', methods=['POST'])
def add_block():
    """Mine a new block and append it to the chain (streamed)."""
    body = request.get_json()
    data = body.get('data', '').strip()
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    if not blockchain:
        return jsonify({'error': 'Chain not initialized'}), 400

    prev = blockchain[-1]
    index = len(blockchain)
    ts = datetime.datetime.utcnow().isoformat()

    def generate():
        target = '0' * difficulty
        nonce = 0
        while True:
            h = compute_hash(index, ts, data, prev['hash'], nonce)
            if h.startswith(target):
                block = {
                    'index': index,
                    'timestamp': ts,
                    'data': data,
                    'previousHash': prev['hash'],
                    'nonce': nonce,
                    'hash': h
                }
                blockchain.append(block)
                yield sse({'done': True, 'block': block, 'chain': blockchain})
                return
            nonce += 1
            if nonce % 500 == 0:
                yield sse({'progress': True, 'nonce': nonce})

    return Response(generate(), mimetype='text/event-stream',
                    headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})


@app.route('/api/add_samples', methods=['POST'])
def add_samples():
    """Mine 4 sample transaction blocks (streamed, one block at a time)."""
    samples = [
        'Alice \u2192 Bob: 3.2 BTC',
        'Bob \u2192 Carol: 1.5 ETH',
        'Carol \u2192 Dave: 50 USDC',
        'Dave \u2192 Alice: 0.01 BTC'
    ]

    def generate():
        for s in samples:
            prev = blockchain[-1]
            index = len(blockchain)
            ts = datetime.datetime.utcnow().isoformat()
            target = '0' * difficulty
            nonce = 0
            while True:
                h = compute_hash(index, ts, s, prev['hash'], nonce)
                if h.startswith(target):
                    block = {
                        'index': index,
                        'timestamp': ts,
                        'data': s,
                        'previousHash': prev['hash'],
                        'nonce': nonce,
                        'hash': h
                    }
                    blockchain.append(block)
                    yield sse({'block_done': True, 'block': block, 'chain': blockchain})
                    break
                nonce += 1
                if nonce % 500 == 0:
                    yield sse({'progress': True, 'nonce': nonce})
        yield sse({'all_done': True, 'chain': blockchain})

    return Response(generate(), mimetype='text/event-stream',
                    headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})


@app.route('/api/validate', methods=['POST'])
def validate():
    """
    Validate chain integrity:
      1. Recompute each block's hash and compare.
      2. Verify each block's previousHash matches the prior block's hash.
    """
    valid = True
    msg = ''
    for i in range(1, len(blockchain)):
        block = blockchain[i]
        recomputed = compute_hash(
            block['index'], block['timestamp'], block['data'],
            block['previousHash'], block['nonce']
        )
        if recomputed != block['hash']:
            valid = False
            msg = f"Block #{i} hash mismatch. Data may have been tampered."
            break
        if block['previousHash'] != blockchain[i - 1]['hash']:
            valid = False
            msg = f"Block #{i} has invalid previous hash reference."
            break
    if valid:
        msg = f"All {len(blockchain)} blocks verified. Chain integrity confirmed."
    return jsonify({'valid': valid, 'message': msg, 'chain': blockchain})


@app.route('/api/tamper', methods=['POST'])
def tamper():
    """Directly mutate a block's data without re-mining (breaks chain integrity)."""
    body = request.get_json()
    idx = int(body.get('index', 0))
    new_data = body.get('data', '').strip()
    if not new_data:
        return jsonify({'error': 'No data provided'}), 400
    blockchain[idx]['data'] = new_data
    return jsonify({'success': True, 'chain': blockchain})


@app.route('/api/rehash', methods=['POST'])
def rehash():
    """Re-mine all blocks from a given index (attacker reconstruction, streamed)."""
    body = request.get_json()
    from_idx = int(body.get('from_index', 0))

    def generate():
        for i in range(from_idx, len(blockchain)):
            block = blockchain[i]
            prev_hash = '0000000000000000' if i == 0 else blockchain[i - 1]['hash']
            block['previousHash'] = prev_hash
            ts = datetime.datetime.utcnow().isoformat()
            block['timestamp'] = ts
            target = '0' * difficulty
            nonce = 0
            while True:
                h = compute_hash(block['index'], ts, block['data'], prev_hash, nonce)
                if h.startswith(target):
                    block['nonce'] = nonce
                    block['hash'] = h
                    break
                nonce += 1
                if nonce % 500 == 0:
                    yield sse({'progress': True, 'nonce': nonce, 'block_index': i})
        yield sse({'done': True, 'chain': blockchain})

    return Response(generate(), mimetype='text/event-stream',
                    headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})


@app.route('/api/reset', methods=['POST'])
def reset():
    """Clear the entire chain and reset difficulty."""
    global blockchain, difficulty
    blockchain = []
    difficulty = 3
    return jsonify({'success': True})


@app.route('/api/chain', methods=['GET'])
def get_chain():
    """Return current chain state."""
    return jsonify({'chain': blockchain, 'difficulty': difficulty})


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == '__main__':
    app.run(debug=True)
