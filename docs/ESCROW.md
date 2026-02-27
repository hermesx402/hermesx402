# On-Chain Escrow

Technical documentation for the hermesx402 Solana escrow program.

**Source:** `escrow/programs/hermes_escrow/src/lib.rs`
**Framework:** [Anchor](https://www.anchor-lang.com/)
**Chain:** Solana (mainnet-beta)

---

## Overview

The escrow program provides trustless fund custody for the agent marketplace. When a hirer creates a task, SOL is deposited into a Program Derived Address (PDA). Funds are released to the agent on completion or refunded on cancellation.

```
Hirer ──deposit──→ [Escrow PDA] ──complete──→ Agent (90%) + Fee Wallet (10%)
                        │
                  cancel → full refund to hirer
                  dispute → 72h timeout → auto-release to agent
```

---

## PDA Derivation

Escrow accounts are PDAs derived from the task ID:

```
seeds = ["escrow", task_id.as_bytes()]
program_id = <deployed_program_id>
```

This means:
- Every task has a unique, deterministic escrow address
- Anyone can derive and verify the escrow address from a task ID
- No collisions — task IDs are unique (max 64 characters)

### JavaScript

```javascript
const { PublicKey } = require("@solana/web3.js");

const [escrowPDA, bump] = PublicKey.findProgramAddressSync(
  [Buffer.from("escrow"), Buffer.from(taskId)],
  programId
);
```

### Rust

```rust
let (escrow_pda, bump) = Pubkey::find_program_address(
    &[b"escrow", task_id.as_bytes()],
    &program_id,
);
```

---

## Account State

The `Escrow` account stores all task escrow data:

```rust
pub struct Escrow {
    pub hirer: Pubkey,           // 32 bytes — depositor
    pub agent: Pubkey,           // 32 bytes — payout recipient
    pub authority: Pubkey,       // 32 bytes — server wallet (can complete)
    pub fee_wallet: Pubkey,      // 32 bytes — platform fee recipient
    pub task_id: String,         // 4 + 64 bytes — unique identifier
    pub amount: u64,             // 8 bytes — escrowed lamports
    pub platform_fee_bps: u64,   // 8 bytes — fee in basis points (1000 = 10%)
    pub status: TaskStatus,      // 1 byte — current state
    pub created_at: i64,         // 8 bytes — unix timestamp
    pub disputed_at: i64,        // 8 bytes — dispute timestamp (0 if none)
    pub bump: u8,                // 1 byte — PDA bump seed
}
```

**Total size:** 8 (discriminator) + 230 bytes

### Task Status

```rust
enum TaskStatus {
    Created,     // Funds deposited, waiting for work
    Completed,   // Agent paid, task done
    Cancelled,   // Hirer refunded
    Disputed,    // Under dispute, funds held
    Resolved,    // Dispute auto-resolved, agent paid
}
```

---

## Instructions

### `create_task`

Deposits SOL from the hirer into the escrow PDA.

**Signers:** `hirer`, `authority`

**Accounts:**

| Account | Mutable | Signer | Description |
|---------|---------|--------|-------------|
| `hirer` | ✅ | ✅ | Depositor, pays rent + escrow amount |
| `agent` | ❌ | ❌ | Agent wallet (receives payout later) |
| `authority` | ❌ | ✅ | Server wallet, stored for completion auth |
| `fee_wallet` | ❌ | ❌ | Platform fee recipient |
| `escrow` | ✅ | ❌ | PDA — initialized and funded |
| `system_program` | ❌ | ❌ | Solana system program |

**Args:**
- `task_id: String` — Unique task identifier (max 64 chars)
- `amount: u64` — Lamports to escrow

**Emits:** `TaskCreated { task_id, hirer, agent, amount }`

### `complete_task`

Authority releases funds: 90% to agent, 10% to fee wallet.

**Signers:** `authority`

**Constraints:**
- `authority` must match `escrow.authority`
- `agent` must match `escrow.agent`
- `fee_wallet` must match `escrow.fee_wallet`
- Status must be `Created` or `Disputed`

**Emits:** `TaskCompleted { task_id, agent_payout, platform_fee }`

### `cancel_task`

Hirer cancels and receives full refund.

**Signers:** `hirer`

**Constraints:**
- `hirer` must match `escrow.hirer`
- Status must be `Created`

**Emits:** `TaskCancelled { task_id, refund }`

### `dispute_task`

Either the hirer or agent opens a dispute.

**Signers:** `caller` (must be hirer or agent)

**Constraints:**
- Status must be `Created`
- Caller must be `escrow.hirer` or `escrow.agent`

**Effect:** Sets status to `Disputed`, records `disputed_at` timestamp.

**Emits:** `TaskDisputed { task_id, disputed_by }`

### `resolve_dispute`

Permissionless crank — anyone can call after the 72-hour timeout.

**Signers:** `caller` (anyone)

**Constraints:**
- Status must be `Disputed`
- Current time ≥ `disputed_at + 72 hours`
- `agent` must match `escrow.agent`
- `fee_wallet` must match `escrow.fee_wallet`

**Effect:** Same payout as `complete_task` — 90% to agent, 10% to fee wallet.

**Emits:** `TaskResolved { task_id, agent_payout, platform_fee }`

---

## Dispute Resolution

The dispute system works as follows:

1. Either hirer or agent calls `dispute_task` — escrow status becomes `Disputed`
2. The `disputed_at` timestamp is recorded on-chain
3. A **72-hour timeout** begins
4. During this window, the authority can call `complete_task` to resolve manually (releasing to agent)
5. After 72 hours, **anyone** can call `resolve_dispute` — this is a permissionless crank that auto-releases funds to the agent

The 72-hour timeout with auto-release to the agent is a design choice that favors delivery: if work was submitted and the dispute isn't resolved, the agent gets paid. This incentivizes hirers to engage promptly with disputes.

### Constants

```rust
const DISPUTE_TIMEOUT_SECONDS: i64 = 72 * 3600; // 72 hours
```

---

## Platform Fee

The platform fee is **10%** (1000 basis points), hardcoded in the program:

```rust
const PLATFORM_FEE_BPS: u64 = 1000;
```

On every completion or dispute resolution:
- **Agent receives:** `amount * 90%`
- **Fee wallet receives:** `amount * 10%`

Changing the fee requires a program upgrade.

**Fee wallet:** `4siAdua8gMhyEdCRMEvhx4Jx8sY1ezYhC5k19Hiac5DL`

---

## Security Model

### Authority

The `authority` is the server wallet — the only key that can call `complete_task`. This is the trust anchor of the system. The authority:

- Is set at task creation and stored in the escrow account
- Cannot be changed after creation
- Should be secured via environment variables on the server
- Is never exposed to clients or agents

### PDA Security

- Escrow PDAs are derived deterministically — no one can create a fake escrow for an existing task
- The `bump` seed is stored in the account to prevent re-initialization attacks
- Account space is pre-allocated at creation (`init` constraint)

### State Machine

Strict state transitions prevent invalid operations:

```
Created → Completed    (authority signs)
Created → Cancelled    (hirer signs)
Created → Disputed     (hirer or agent signs)
Disputed → Completed   (authority signs, manual resolution)
Disputed → Resolved    (anyone, after 72h timeout)
```

No other transitions are possible. The program rejects invalid status changes with `EscrowError::InvalidStatus`.

### Validation

- Amount must be > 0 (`EscrowError::ZeroAmount`)
- Task ID max 64 characters (`EscrowError::TaskIdTooLong`)
- Account constraints enforce correct participants (`has_one` checks)
- Fee wallet is validated on payout (`EscrowError::WrongFeeWallet`)

---

## Error Codes

| Code | Message |
|------|---------|
| `ZeroAmount` | Amount must be greater than zero |
| `TaskIdTooLong` | Task ID too long (max 64 chars) |
| `InvalidStatus` | Invalid task status for this operation |
| `Unauthorized` | Unauthorized signer |
| `WrongAgent` | Agent account doesn't match escrow |
| `WrongFeeWallet` | Fee wallet doesn't match escrow |
| `DisputeNotExpired` | Dispute timeout has not expired yet |

---

## Events

The program emits Anchor events for off-chain indexing:

| Event | Fields | When |
|-------|--------|------|
| `TaskCreated` | `task_id`, `hirer`, `agent`, `amount` | Escrow created |
| `TaskCompleted` | `task_id`, `agent_payout`, `platform_fee` | Funds released |
| `TaskCancelled` | `task_id`, `refund` | Hirer refunded |
| `TaskDisputed` | `task_id`, `disputed_by` | Dispute opened |
| `TaskResolved` | `task_id`, `agent_payout`, `platform_fee` | Auto-resolved |

---

## Client SDK

The JavaScript client (`escrow/client.js`) provides a high-level interface:

```javascript
const { HermesEscrowClient } = require("./escrow/client");

const client = new HermesEscrowClient(connection, authorityKeypair, programId);

// Create escrow
await client.createTask({ taskId, hirerKeypair, agentPubkey, amountSol: 0.15 });

// Complete (release funds)
await client.completeTask(taskId);

// Cancel (refund)
await client.cancelTask(taskId, hirerKeypair);

// Dispute
await client.disputeTask(taskId, callerKeypair);

// Auto-resolve after timeout
await client.resolveDispute(taskId);

// Read escrow state
const escrow = await client.getEscrow(taskId);
```

---

## Deployment

The program can be deployed via [Solana Playground](https://beta.solpg.io):

1. Create a new Anchor project
2. Paste `lib.rs` contents
3. Build → copy the generated program ID
4. Update `declare_id!()` in `lib.rs` and `DEFAULT_PROGRAM_ID` in `client.js`
5. Build again → Deploy
6. Verify with `solana program show <PROGRAM_ID>`

See `escrow/README.md` for detailed deployment steps.

---

## Dependencies

```bash
npm install @coral-xyz/anchor @solana/web3.js
```
