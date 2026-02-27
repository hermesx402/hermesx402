# HermesX402 Escrow — Solana Smart Contract

Trust layer for the AI agent marketplace. Hirer deposits SOL into a PDA escrow → authority releases to agent on completion (minus 10% platform fee).

## Architecture

```
Hirer ──deposit──→ [Escrow PDA] ──complete──→ Agent (90%) + Fee Wallet (10%)
                        │
                  cancel → full refund
                  dispute → 72h timeout → auto-release
```

**PDA derivation:** `seeds = ["escrow", task_id_bytes]` — deterministic, verifiable by anyone.

## Files

| File | Purpose |
|------|---------|
| `programs/hermes_escrow/src/lib.rs` | Anchor program (Rust) |
| `client.js` | JS client for Express server integration |
| `tests/escrow.test.js` | Test suite |

## Instructions

| Instruction | Signer | Effect |
|-------------|--------|--------|
| `createTask` | hirer + authority | Deposits SOL into escrow PDA |
| `completeTask` | authority | Pays agent 90%, fee wallet 10% |
| `cancelTask` | hirer | Full refund (only if status = Created) |
| `disputeTask` | hirer or agent | Opens dispute, starts 72h timer |
| `resolveDispute` | anyone (permissionless) | Auto-releases after 72h timeout |

## Deploy via Solana Playground (beta.solpg.io)

No local toolchain needed. Everything runs in the browser.

### Step 1: Create Project

1. Go to [beta.solpg.io](https://beta.solpg.io)
2. Click **"Create a new project"**
3. Select **Anchor (Rust)** framework
4. Name it `hermes_escrow`

### Step 2: Paste the Program

1. In the file explorer, open `src/lib.rs`
2. Replace all contents with the code from `programs/hermes_escrow/src/lib.rs`
3. Save

### Step 3: Build

1. Click the **Build** button (hammer icon) or run `build` in the terminal
2. Wait for compilation — should see "Build successful"
3. The program ID will be auto-generated. **Copy it.**

### Step 4: Update Program ID

1. Replace the `declare_id!("111...")` in `lib.rs` with your new program ID
2. Also update `DEFAULT_PROGRAM_ID` in `client.js`
3. **Build again** after updating the ID

### Step 5: Deploy

1. **Connect your wallet** — click the wallet icon in the bottom-left
   - Use a wallet with SOL for deployment (~2-3 SOL for rent)
   - For mainnet: select "Mainnet Beta" in the cluster dropdown
   - For testing: use "Devnet" first
2. Click **Deploy**
3. Confirm the transaction in your wallet
4. ✅ Program is live!

### Step 6: Verify

In the Playground terminal:
```
solana program show <YOUR_PROGRAM_ID>
```

## Server Integration (Express)

```js
const { Connection, Keypair, PublicKey } = require("@solana/web3.js");
const { HermesEscrowClient } = require("./client");

// Setup
const connection = new Connection("https://api.mainnet-beta.solana.com");
const authority = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(process.env.AUTHORITY_SECRET_KEY))
);
const PROGRAM_ID = new PublicKey("YOUR_DEPLOYED_PROGRAM_ID");
const client = new HermesEscrowClient(connection, authority, PROGRAM_ID);

// Create task (hirer deposits)
app.post("/api/task/create", async (req, res) => {
  const { taskId, hirerSecretKey, agentPubkey, amountSol } = req.body;
  const hirerKeypair = Keypair.fromSecretKey(Uint8Array.from(hirerSecretKey));
  const result = await client.createTask({
    taskId,
    hirerKeypair,
    agentPubkey: new PublicKey(agentPubkey),
    amountSol,
  });
  res.json(result);
});

// Complete task (server-side, authority signs)
app.post("/api/task/complete", async (req, res) => {
  const result = await client.completeTask(req.body.taskId);
  res.json(result);
});

// Check escrow state
app.get("/api/task/:taskId", async (req, res) => {
  const escrow = await client.getEscrow(req.params.taskId);
  res.json(escrow || { error: "Not found" });
});
```

## Key Addresses

| Role | Address |
|------|---------|
| Platform/Fee Wallet | `4siAdua8gMhyEdCRMEvhx4Jx8sY1ezYhC5k19Hiac5DL` |
| Authority | Same as server keypair (set in env) |
| Program ID | Set after deployment |

## Security Notes

- **Authority** is the only key that can release funds (complete a task). Keep it secure — use env vars, never commit.
- **PDA seeds** are deterministic — anyone can derive and verify an escrow address.
- **Cancel** only works if status is `Created` — once work starts, only authority can release.
- **Dispute timeout** is 72 hours — after that, funds auto-release to agent via permissionless crank.
- **10% fee** is hardcoded in the program. Changing it requires a program upgrade.

## Testing

### On Solana Playground

Paste the test code from `tests/escrow.test.js` into the **Test** tab and run.

### Locally (if you have Anchor CLI)

```bash
anchor test
```

## Dependencies (for client.js)

```bash
npm install @coral-xyz/anchor @solana/web3.js
```
