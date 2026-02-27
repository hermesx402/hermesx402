const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const db = require('./db');
const { verifyPayment, releaseEscrow, refundEscrow, escrowKeypair, checkEscrowHealth, connection } = require('./solana');
const { x402Protocol, send402, getPaymentProof, discoveryInfo } = require('./x402');
const config = require(path.join(__dirname, '..', 'config.json'));
const { deriveEscrowKeypair, getEscrowAddress, releaseFunds: releaseEscrowPDA, checkStatus: checkEscrowPDA, loadAuthority } = require('../escrow/mainnet-escrow');

// Load authority for per-task escrow derivation
let escrowAuthority;
try { escrowAuthority = loadAuthority(); } catch (e) { console.error('Failed to load escrow authority:', e.message); }

function getTaskEscrowAddress(taskId) {
  if (!escrowAuthority) return escrowKeypair.publicKey.toBase58(); // fallback
  return getEscrowAddress(escrowAuthority, String(taskId)).toBase58();
}

const app = express();
const PORT = config.port || 3402;

// --- Middleware ---
app.use(cors());
app.use(express.json());
app.use(x402Protocol);

// Request logging
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// --- Helpers ---
function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

function authApiKey(req, res, next) {
  const raw = req.headers['x-api-key'];
  if (!raw) return res.status(401).json({ error: 'Missing x-api-key header' });
  const hash = hashKey(raw);
  const row = db.prepare('SELECT * FROM api_keys WHERE key_hash = ?').get(hash);
  if (!row) return res.status(403).json({ error: 'Invalid API key' });
  req.apiKeyHash = hash;
  req.apiKeyOwner = row.owner_name;
  next();
}

function now() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

// --- Health ---
app.get('/api/health', async (_req, res) => {
  const agents = db.prepare('SELECT COUNT(*) as c FROM agents WHERE status = ?').get('active').c;
  const tasks = db.prepare('SELECT COUNT(*) as c FROM tasks').get().c;
  const wallet = await checkEscrowHealth();
  if (!wallet.healthy) console.error('[HEALTH] Escrow wallet unhealthy!', wallet);
  res.json({ status: wallet.healthy ? 'ok' : 'warning', agents, tasks, uptime: process.uptime(), network: config.network, escrow: { address: escrowKeypair.publicKey.toBase58(), healthy: wallet.healthy, balance_lamports: wallet.balance, mode: 'per-task-pda' }, platformFee: `${config.platformFeePercent || 0}%` });
});

// --- API Keys ---
app.post('/api/keys', (req, res) => {
  const { owner_name } = req.body;
  if (!owner_name) return res.status(400).json({ error: 'owner_name required' });

  const rawKey = `hx4-${uuidv4()}`;
  const hash = hashKey(rawKey);

  db.prepare('INSERT INTO api_keys (key_hash, owner_name) VALUES (?, ?)').run(hash, owner_name);
  res.status(201).json({ api_key: rawKey, message: 'Store this key — it will not be shown again.' });
});

// --- Agents ---
app.get('/api/agents', (req, res) => {
  let sql = 'SELECT * FROM agents WHERE status = ?';
  const params = ['active'];

  if (req.query.tag) {
    sql += " AND tags LIKE ?";
    params.push(`%"${req.query.tag}"%`);
  }
  if (req.query.search) {
    sql += ' AND (name LIKE ? OR description LIKE ?)';
    const s = `%${req.query.search}%`;
    params.push(s, s);
  }

  const agents = db.prepare(sql).all(...params);
  agents.forEach(a => { a.tags = JSON.parse(a.tags); });
  res.json(agents);
});

app.get('/api/agents/:id', (req, res) => {
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  agent.tags = JSON.parse(agent.tags);
  res.json(agent);
});

app.post('/api/agents', authApiKey, (req, res) => {
  const { name, description, tags, price_sol, wallet_address } = req.body;
  if (!name || !description || !price_sol || !wallet_address) {
    return res.status(400).json({ error: 'name, description, price_sol, wallet_address required' });
  }

  const result = db.prepare(
    'INSERT INTO agents (name, description, tags, price_sol, wallet_address, owner_api_key_hash) VALUES (?,?,?,?,?,?)'
  ).run(name, description, JSON.stringify(tags || []), price_sol, wallet_address, req.apiKeyHash);

  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(result.lastInsertRowid);
  agent.tags = JSON.parse(agent.tags);
  res.status(201).json(agent);
});

app.put('/api/agents/:id', authApiKey, (req, res) => {
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  if (agent.owner_api_key_hash !== req.apiKeyHash) return res.status(403).json({ error: 'Not your agent' });

  const { name, description, tags, price_sol, wallet_address, status } = req.body;
  db.prepare(
    `UPDATE agents SET name=COALESCE(?,name), description=COALESCE(?,description),
     tags=COALESCE(?,tags), price_sol=COALESCE(?,price_sol), wallet_address=COALESCE(?,wallet_address),
     status=COALESCE(?,status), updated_at=? WHERE id=?`
  ).run(name||null, description||null, tags?JSON.stringify(tags):null, price_sol||null, wallet_address||null, status||null, now(), req.params.id);

  const updated = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id);
  updated.tags = JSON.parse(updated.tags);
  res.json(updated);
});

app.delete('/api/agents/:id', authApiKey, (req, res) => {
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  if (agent.owner_api_key_hash !== req.apiKeyHash) return res.status(403).json({ error: 'Not your agent' });

  db.prepare("UPDATE agents SET status='inactive', updated_at=? WHERE id=?").run(now(), req.params.id);
  res.json({ message: 'Agent deactivated' });
});

// --- Tasks ---
app.get('/api/tasks', (req, res) => {
  if (req.query.hirer) {
    const tasks = db.prepare('SELECT * FROM tasks WHERE hirer_wallet = ?').all(req.query.hirer);
    return res.json(tasks);
  }
  if (req.query.agent) {
    const tasks = db.prepare('SELECT * FROM tasks WHERE agent_id = ?').all(req.query.agent);
    return res.json(tasks);
  }
  return res.status(400).json({ error: 'Provide ?hirer=WALLET or ?agent=AGENT_ID' });
});

app.get('/api/tasks/:id', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json(task);
});

// Escrow info for a task
app.get('/api/tasks/:id/escrow', async (req, res) => {
  try {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    const addr = task.escrow_address || getTaskEscrowAddress(task.id);
    let balance = null;
    try {
      const { LAMPORTS_PER_SOL } = require('@solana/web3.js');
      const bal = await connection.getBalance(new (require('@solana/web3.js').PublicKey)(addr));
      balance = bal / LAMPORTS_PER_SOL;
    } catch {}
    res.json({
      task_id: task.id,
      escrow_address: addr,
      explorer_url: `https://explorer.solana.com/address/${addr}`,
      balance_sol: balance,
      status: task.status,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// x402 discovery endpoint
app.get('/.well-known/x402', (_req, res) => {
  res.json(discoveryInfo());
});

app.post('/api/tasks', (req, res) => {
  const { agent_id, description, hirer_wallet } = req.body;
  if (!agent_id || !description) {
    return res.status(400).json({ error: 'agent_id and description required' });
  }

  const agent = db.prepare('SELECT * FROM agents WHERE id = ? AND status = ?').get(agent_id, 'active');
  if (!agent) return res.status(404).json({ error: 'Agent not found or inactive' });

  const result = db.prepare(
    'INSERT INTO tasks (agent_id, hirer_wallet, description, escrow_amount_sol) VALUES (?,?,?,?)'
  ).run(agent_id, hirer_wallet || null, description, agent.price_sol);

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
  const escrowAddress = getTaskEscrowAddress(task.id);

  // Store the escrow address on the task for later lookup
  db.prepare("UPDATE tasks SET escrow_address=? WHERE id=?").run(escrowAddress, task.id);

  // Return 402 Payment Required with x402 headers
  return send402(res, {
    taskId: task.id,
    amount: agent.price_sol,
    address: escrowAddress,
    message: `Task #${task.id} created. Send ${agent.price_sol} SOL to ${escrowAddress}, then POST /api/tasks/${task.id}/pay with X-Payment-Proof: <tx_signature>`,
  });
});

app.post('/api/tasks/:id/pay', async (req, res) => {
  try {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (task.status !== 'pending') return res.status(400).json({ error: `Task status is ${task.status}, expected pending` });

    const taskEscrowAddr = task.escrow_address || getTaskEscrowAddress(task.id);

    const txSignature = getPaymentProof(req);
    if (!txSignature) {
      return send402(res, {
        taskId: task.id,
        amount: task.escrow_amount_sol,
        address: taskEscrowAddr,
        message: 'Missing X-Payment-Proof header. Provide the Solana transaction signature.',
      });
    }

    const result = await verifyPayment(
      txSignature,
      task.escrow_amount_sol,
      task.hirer_wallet || (req.body && req.body.hirer_wallet) || null,
      taskEscrowAddr
    );

    if (!result) {
      return send402(res, {
        taskId: task.id,
        amount: task.escrow_amount_sol,
        address: taskEscrowAddr,
        message: 'Payment verification failed. Ensure correct amount and destination.',
      });
    }

    const verifiedAt = now();
    const senderWallet = result.sender || (req.body && req.body.hirer_wallet) || null;
    db.prepare("UPDATE tasks SET status='funded', payment_proof=?, payment_verified_at=?, hirer_wallet=COALESCE(hirer_wallet,?), updated_at=? WHERE id=?")
      .run(txSignature, verifiedAt, senderWallet, verifiedAt, req.params.id);

    res.json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id));
  } catch (err) {
    console.error('pay error:', err);
    res.status(500).json({ error: 'Internal error during payment verification' });
  }
});

app.post('/api/tasks/:id/complete', authApiKey, async (req, res) => {
  try {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(task.agent_id);
    if (!agent || agent.owner_api_key_hash !== req.apiKeyHash) {
      return res.status(403).json({ error: 'Not authorized — must be the agent owner' });
    }

    if (!['funded', 'escrow_funded', 'in_progress'].includes(task.status)) {
      return res.status(400).json({ error: `Task status is ${task.status}, expected funded or in_progress` });
    }

    // Try per-task PDA escrow release first, fall back to legacy hot wallet
    let sig;
    if (task.escrow_address && escrowAuthority) {
      try {
        const result = await releaseEscrowPDA(String(task.id), agent.wallet_address, config.platformFeePercent || 10);
        sig = result ? result.signature : null;
        if (result) console.log(`[escrow] PDA release: agent=${result.agentPayout/1e9} SOL, fee=${result.platformCut/1e9} SOL`);
      } catch (e) {
        console.error('[escrow] PDA release failed, falling back:', e.message);
        sig = await releaseEscrow(agent.wallet_address, task.escrow_amount_sol);
      }
    } else {
      sig = await releaseEscrow(agent.wallet_address, task.escrow_amount_sol);
    }

    db.prepare("UPDATE tasks SET status='completed', completion_tx_signature=?, updated_at=? WHERE id=?")
      .run(sig, now(), req.params.id);

    // Update agent stats
    db.prepare("UPDATE agents SET tasks_completed = tasks_completed + 1, updated_at=? WHERE id=?")
      .run(now(), agent.id);

    res.json({ ...db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id), release_signature: sig });
  } catch (err) {
    console.error('complete error:', err);
    res.status(500).json({ error: 'Internal error during escrow release' });
  }
});

app.get('/api/tasks/:id/result', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  const agent = db.prepare('SELECT name FROM agents WHERE id = ?').get(task.agent_id);
  res.json({
    id: task.id,
    status: task.status,
    description: task.description,
    agent_name: agent ? agent.name : null,
    result: task.result,
    result_at: task.result_at,
    payment_proof: task.payment_proof,
    completion_tx_signature: task.completion_tx_signature,
    escrow_amount_sol: task.escrow_amount_sol,
    escrow_address: task.escrow_address || getTaskEscrowAddress(task.id),
    created_at: task.created_at,
    payment_verified_at: task.payment_verified_at,
    updated_at: task.updated_at,
  });
});

app.post('/api/tasks/:id/dispute', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  if (!['funded', 'escrow_funded', 'in_progress'].includes(task.status)) {
    return res.status(400).json({ error: `Cannot dispute task in ${task.status} status` });
  }

  db.prepare("UPDATE tasks SET status='disputed', updated_at=? WHERE id=?").run(now(), req.params.id);
  res.json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id));
});

// --- Internal: agent submits result (called by OpenClaw agent) ---
app.post('/api/tasks/:id/submit-result', async (req, res) => {
  try {
    const { result, internal_key } = req.body;
    // Simple internal auth — only accept from localhost or with internal key
    const isLocal = req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1';
    if (!isLocal) return res.status(403).json({ error: 'Internal endpoint only' });

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    if (!['funded', 'in_progress'].includes(task.status)) {
      return res.status(400).json({ error: `Task status is ${task.status}` });
    }

    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(task.agent_id);
    const completedAt = now();

    // Try to release escrow (PDA first, then legacy)
    let sig = null;
    try {
      if (task.escrow_address && escrowAuthority) {
        const result = await releaseEscrowPDA(String(task.id), agent.wallet_address, config.platformFeePercent || 10);
        sig = result ? result.signature : null;
      } else {
        sig = await releaseEscrow(agent.wallet_address, task.escrow_amount_sol);
      }
    } catch (err) {
      console.error('Escrow release failed:', err.message);
      try { sig = await releaseEscrow(agent.wallet_address, task.escrow_amount_sol); } catch {}
    }

    db.prepare(
      "UPDATE tasks SET status='completed', result=?, result_at=?, completion_tx_signature=?, updated_at=? WHERE id=?"
    ).run(result, completedAt, sig, completedAt, req.params.id);

    db.prepare("UPDATE agents SET tasks_completed = tasks_completed + 1, updated_at=? WHERE id=?")
      .run(completedAt, agent.id);

    // Save HTML results as files for direct linking
    if (result && (result.trim().startsWith('<!DOCTYPE') || result.trim().startsWith('<html'))) {
      const resultFile = path.join(__dirname, '..', 'results', `task-${req.params.id}.html`);
      fs.writeFileSync(resultFile, result);
      console.log(`[api] HTML result saved to ${resultFile}`);
    }

    console.log(`[api] Task #${req.params.id} completed with result (${result.length} chars)`);
    res.json({ status: 'completed', task_id: req.params.id, release_signature: sig });
  } catch (err) {
    console.error('submit-result error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// --- Serve task result as standalone page ---
const resultsDir = path.join(__dirname, '..', 'results');
if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });

app.get('/results/:id', (req, res) => {
  try {
    const filePath = path.join(resultsDir, `task-${req.params.id}.html`);
    console.log(`[results] Looking for ${filePath}, exists: ${fs.existsSync(filePath)}`);
    if (fs.existsSync(filePath)) {
      return res.type('html').send(fs.readFileSync(filePath, 'utf8'));
    }
    // Fallback: check DB for HTML result
    const task = db.prepare('SELECT result FROM tasks WHERE id = ?').get(req.params.id);
    if (task && task.result && (task.result.trim().startsWith('<!DOCTYPE') || task.result.trim().startsWith('<html'))) {
      fs.writeFileSync(filePath, task.result);
      return res.type('html').send(task.result);
    }
    res.status(404).send('Result not found or not an HTML deliverable.');
  } catch(err) {
    console.error('[results] Error:', err);
    res.status(500).send('Error loading result');
  }
});

// --- Error handling ---
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// --- Worker ---
const { startWorker } = require('./worker');

// --- Start ---
app.listen(PORT, () => {
  console.log(`hermesx402 API running on port ${PORT} (${config.network})`);
  startWorker();
});
