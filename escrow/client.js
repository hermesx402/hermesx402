/**
 * HermesX402 Escrow Client
 * JS client for server-side integration with the Anchor escrow program.
 *
 * Usage:
 *   const escrow = require('./client');
 *   const client = new escrow.HermesEscrowClient(connection, authorityKeypair, programId);
 *   await client.createTask({ taskId, hirer, agent, amount });
 */

const anchor = require("@coral-xyz/anchor");
const { PublicKey, SystemProgram, Connection, Keypair, LAMPORTS_PER_SOL } = require("@solana/web3.js");

// ─── Replace with your deployed program ID ─────────────────────────────────
const DEFAULT_PROGRAM_ID = new PublicKey("11111111111111111111111111111111");
const FEE_WALLET = new PublicKey("4siAdua8gMhyEdCRMEvhx4Jx8sY1ezYhC5k19Hiac5DL");

// ─── IDL (minimal, matches the Anchor program) ─────────────────────────────
// In production, load the full IDL from target/idl/hermes_escrow.json after build.
// This inline IDL lets you get started without a build step.
const IDL = {
  version: "0.1.0",
  name: "hermes_escrow",
  instructions: [
    {
      name: "createTask",
      accounts: [
        { name: "hirer", isMut: true, isSigner: true },
        { name: "agent", isMut: false, isSigner: false },
        { name: "authority", isMut: false, isSigner: true },
        { name: "feeWallet", isMut: false, isSigner: false },
        { name: "escrow", isMut: true, isSigner: false },
        { name: "systemProgram", isMut: false, isSigner: false },
      ],
      args: [
        { name: "taskId", type: "string" },
        { name: "amount", type: "u64" },
      ],
    },
    {
      name: "completeTask",
      accounts: [
        { name: "authority", isMut: false, isSigner: true },
        { name: "escrow", isMut: true, isSigner: false },
        { name: "agent", isMut: true, isSigner: false },
        { name: "feeWallet", isMut: true, isSigner: false },
      ],
      args: [],
    },
    {
      name: "cancelTask",
      accounts: [
        { name: "hirer", isMut: true, isSigner: true },
        { name: "escrow", isMut: true, isSigner: false },
      ],
      args: [],
    },
    {
      name: "disputeTask",
      accounts: [
        { name: "caller", isMut: false, isSigner: true },
        { name: "escrow", isMut: true, isSigner: false },
      ],
      args: [],
    },
    {
      name: "resolveDispute",
      accounts: [
        { name: "caller", isMut: false, isSigner: true },
        { name: "escrow", isMut: true, isSigner: false },
        { name: "agent", isMut: true, isSigner: false },
        { name: "feeWallet", isMut: true, isSigner: false },
      ],
      args: [],
    },
  ],
  accounts: [
    {
      name: "Escrow",
      type: {
        kind: "struct",
        fields: [
          { name: "hirer", type: "publicKey" },
          { name: "agent", type: "publicKey" },
          { name: "authority", type: "publicKey" },
          { name: "feeWallet", type: "publicKey" },
          { name: "taskId", type: "string" },
          { name: "amount", type: "u64" },
          { name: "platformFeeBps", type: "u64" },
          { name: "status", type: { defined: "TaskStatus" } },
          { name: "createdAt", type: "i64" },
          { name: "disputedAt", type: "i64" },
          { name: "bump", type: "u8" },
        ],
      },
    },
  ],
  types: [
    {
      name: "TaskStatus",
      type: {
        kind: "enum",
        variants: [
          { name: "Created" },
          { name: "Completed" },
          { name: "Cancelled" },
          { name: "Disputed" },
          { name: "Resolved" },
        ],
      },
    },
  ],
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Derive the escrow PDA for a given task ID.
 */
function deriveEscrowPDA(taskId, programId = DEFAULT_PROGRAM_ID) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), Buffer.from(taskId)],
    programId
  );
}

// ─── Client Class ───────────────────────────────────────────────────────────

class HermesEscrowClient {
  /**
   * @param {Connection} connection - Solana RPC connection
   * @param {Keypair} authority - Server authority keypair (signs completeTask)
   * @param {PublicKey} [programId] - Deployed program ID
   * @param {PublicKey} [feeWallet] - Platform fee wallet
   */
  constructor(connection, authority, programId = DEFAULT_PROGRAM_ID, feeWallet = FEE_WALLET) {
    this.connection = connection;
    this.authority = authority;
    this.programId = programId;
    this.feeWallet = feeWallet;

    const wallet = new anchor.Wallet(authority);
    this.provider = new anchor.AnchorProvider(connection, wallet, {
      commitment: "confirmed",
    });
    this.program = new anchor.Program(IDL, programId, this.provider);
  }

  /**
   * Create a task escrow. Hirer deposits SOL.
   * @param {Object} opts
   * @param {string} opts.taskId - Unique task identifier
   * @param {Keypair} opts.hirerKeypair - Hirer's keypair (signs + pays)
   * @param {PublicKey} opts.agentPubkey - Agent's wallet address
   * @param {number} opts.amountSol - Amount in SOL (converted to lamports)
   */
  async createTask({ taskId, hirerKeypair, agentPubkey, amountSol }) {
    const [escrowPDA] = deriveEscrowPDA(taskId, this.programId);
    const amountLamports = new anchor.BN(Math.round(amountSol * LAMPORTS_PER_SOL));

    const tx = await this.program.methods
      .createTask(taskId, amountLamports)
      .accounts({
        hirer: hirerKeypair.publicKey,
        agent: agentPubkey,
        authority: this.authority.publicKey,
        feeWallet: this.feeWallet,
        escrow: escrowPDA,
        systemProgram: SystemProgram.programId,
      })
      .signers([hirerKeypair, this.authority])
      .rpc();

    return { tx, escrowPDA: escrowPDA.toBase58() };
  }

  /**
   * Complete a task — authority releases funds to agent.
   * @param {string} taskId
   */
  async completeTask(taskId) {
    const [escrowPDA] = deriveEscrowPDA(taskId, this.programId);
    const escrowData = await this.program.account.escrow.fetch(escrowPDA);

    const tx = await this.program.methods
      .completeTask()
      .accounts({
        authority: this.authority.publicKey,
        escrow: escrowPDA,
        agent: escrowData.agent,
        feeWallet: escrowData.feeWallet,
      })
      .signers([this.authority])
      .rpc();

    return { tx };
  }

  /**
   * Cancel a task — hirer gets full refund.
   * @param {string} taskId
   * @param {Keypair} hirerKeypair
   */
  async cancelTask(taskId, hirerKeypair) {
    const [escrowPDA] = deriveEscrowPDA(taskId, this.programId);

    const tx = await this.program.methods
      .cancelTask()
      .accounts({
        hirer: hirerKeypair.publicKey,
        escrow: escrowPDA,
      })
      .signers([hirerKeypair])
      .rpc();

    return { tx };
  }

  /**
   * Open a dispute on a task.
   * @param {string} taskId
   * @param {Keypair} callerKeypair - Hirer or agent
   */
  async disputeTask(taskId, callerKeypair) {
    const [escrowPDA] = deriveEscrowPDA(taskId, this.programId);

    const tx = await this.program.methods
      .disputeTask()
      .accounts({
        caller: callerKeypair.publicKey,
        escrow: escrowPDA,
      })
      .signers([callerKeypair])
      .rpc();

    return { tx };
  }

  /**
   * Resolve a dispute after timeout (permissionless crank).
   * @param {string} taskId
   * @param {Keypair} [crankerKeypair] - Anyone can call this
   */
  async resolveDispute(taskId, crankerKeypair = this.authority) {
    const [escrowPDA] = deriveEscrowPDA(taskId, this.programId);
    const escrowData = await this.program.account.escrow.fetch(escrowPDA);

    const tx = await this.program.methods
      .resolveDispute()
      .accounts({
        caller: crankerKeypair.publicKey,
        escrow: escrowPDA,
        agent: escrowData.agent,
        feeWallet: escrowData.feeWallet,
      })
      .signers([crankerKeypair])
      .rpc();

    return { tx };
  }

  /**
   * Fetch escrow state for a task.
   * @param {string} taskId
   */
  async getEscrow(taskId) {
    const [escrowPDA] = deriveEscrowPDA(taskId, this.programId);
    try {
      const data = await this.program.account.escrow.fetch(escrowPDA);
      return {
        ...data,
        escrowAddress: escrowPDA.toBase58(),
        amountSol: data.amount.toNumber() / LAMPORTS_PER_SOL,
        statusName: Object.keys(data.status)[0],
      };
    } catch {
      return null; // Not found
    }
  }
}

// ─── Express Integration Example ────────────────────────────────────────────
//
// const { Connection, Keypair } = require("@solana/web3.js");
// const { HermesEscrowClient } = require("./client");
//
// const connection = new Connection("https://api.mainnet-beta.solana.com");
// const authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(process.env.AUTHORITY_KEY)));
// const client = new HermesEscrowClient(connection, authority, new PublicKey("YOUR_PROGRAM_ID"));
//
// // In your Express route:
// app.post("/api/task/complete", async (req, res) => {
//   const { taskId } = req.body;
//   const result = await client.completeTask(taskId);
//   res.json(result);
// });

module.exports = { HermesEscrowClient, deriveEscrowPDA, IDL, FEE_WALLET };
