/**
 * HermesX402 Escrow — Test Suite
 * Run with: anchor test (or paste into Solana Playground test tab)
 */

const anchor = require("@coral-xyz/anchor");
const { PublicKey, SystemProgram, Keypair, LAMPORTS_PER_SOL } = require("@solana/web3.js");
const assert = require("assert");

describe("hermes_escrow", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.HermesEscrow;

  const authority = provider.wallet.payer;
  const hirer = Keypair.generate();
  const agent = Keypair.generate();
  const feeWallet = Keypair.generate();
  const taskId = "test-task-" + Date.now();
  const amount = 1 * LAMPORTS_PER_SOL; // 1 SOL

  function deriveEscrow(id) {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), Buffer.from(id)],
      program.programId
    );
  }

  before(async () => {
    // Airdrop to hirer for testing
    const sig = await provider.connection.requestAirdrop(hirer.publicKey, 5 * LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sig);
    // Fund fee wallet so it's rent-exempt (needed to receive lamports)
    const sig2 = await provider.connection.requestAirdrop(feeWallet.publicKey, 0.01 * LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sig2);
    // Fund agent wallet
    const sig3 = await provider.connection.requestAirdrop(agent.publicKey, 0.01 * LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sig3);
  });

  it("creates a task escrow", async () => {
    const [escrowPDA] = deriveEscrow(taskId);

    await program.methods
      .createTask(taskId, new anchor.BN(amount))
      .accounts({
        hirer: hirer.publicKey,
        agent: agent.publicKey,
        authority: authority.publicKey,
        feeWallet: feeWallet.publicKey,
        escrow: escrowPDA,
        systemProgram: SystemProgram.programId,
      })
      .signers([hirer, authority])
      .rpc();

    const escrow = await program.account.escrow.fetch(escrowPDA);
    assert.equal(escrow.taskId, taskId);
    assert.equal(escrow.amount.toNumber(), amount);
    assert.deepEqual(escrow.status, { created: {} });
    assert.equal(escrow.hirer.toBase58(), hirer.publicKey.toBase58());
    assert.equal(escrow.agent.toBase58(), agent.publicKey.toBase58());
    console.log("✅ Task created:", taskId);
  });

  it("prevents cancel by non-hirer", async () => {
    const [escrowPDA] = deriveEscrow(taskId);
    try {
      await program.methods
        .cancelTask()
        .accounts({ hirer: agent.publicKey, escrow: escrowPDA })
        .signers([agent])
        .rpc();
      assert.fail("Should have thrown");
    } catch (e) {
      assert.ok(e.toString().includes("Unauthorized") || e.toString().includes("ConstraintHasOne"));
      console.log("✅ Non-hirer cancel rejected");
    }
  });

  it("completes task — pays agent and fee wallet", async () => {
    const [escrowPDA] = deriveEscrow(taskId);

    const agentBefore = await provider.connection.getBalance(agent.publicKey);
    const feeBefore = await provider.connection.getBalance(feeWallet.publicKey);

    await program.methods
      .completeTask()
      .accounts({
        authority: authority.publicKey,
        escrow: escrowPDA,
        agent: agent.publicKey,
        feeWallet: feeWallet.publicKey,
      })
      .signers([authority])
      .rpc();

    const agentAfter = await provider.connection.getBalance(agent.publicKey);
    const feeAfter = await provider.connection.getBalance(feeWallet.publicKey);

    const expectedFee = amount * 0.1;
    const expectedPayout = amount - expectedFee;

    assert.equal(agentAfter - agentBefore, expectedPayout);
    assert.equal(feeAfter - feeBefore, expectedFee);

    const escrow = await program.account.escrow.fetch(escrowPDA);
    assert.deepEqual(escrow.status, { completed: {} });
    console.log(`✅ Task completed. Agent got ${expectedPayout / LAMPORTS_PER_SOL} SOL, fee: ${expectedFee / LAMPORTS_PER_SOL} SOL`);
  });

  it("cancel flow — full refund", async () => {
    const cancelTaskId = "cancel-test-" + Date.now();
    const [escrowPDA] = deriveEscrow(cancelTaskId);

    await program.methods
      .createTask(cancelTaskId, new anchor.BN(amount))
      .accounts({
        hirer: hirer.publicKey,
        agent: agent.publicKey,
        authority: authority.publicKey,
        feeWallet: feeWallet.publicKey,
        escrow: escrowPDA,
        systemProgram: SystemProgram.programId,
      })
      .signers([hirer, authority])
      .rpc();

    const hirerBefore = await provider.connection.getBalance(hirer.publicKey);

    await program.methods
      .cancelTask()
      .accounts({ hirer: hirer.publicKey, escrow: escrowPDA })
      .signers([hirer])
      .rpc();

    const hirerAfter = await provider.connection.getBalance(hirer.publicKey);
    // Refund minus tx fee
    assert.ok(hirerAfter > hirerBefore);

    const escrow = await program.account.escrow.fetch(escrowPDA);
    assert.deepEqual(escrow.status, { cancelled: {} });
    console.log("✅ Task cancelled, hirer refunded");
  });

  it("dispute flow", async () => {
    const disputeTaskId = "dispute-test-" + Date.now();
    const [escrowPDA] = deriveEscrow(disputeTaskId);

    await program.methods
      .createTask(disputeTaskId, new anchor.BN(amount))
      .accounts({
        hirer: hirer.publicKey,
        agent: agent.publicKey,
        authority: authority.publicKey,
        feeWallet: feeWallet.publicKey,
        escrow: escrowPDA,
        systemProgram: SystemProgram.programId,
      })
      .signers([hirer, authority])
      .rpc();

    await program.methods
      .disputeTask()
      .accounts({ caller: hirer.publicKey, escrow: escrowPDA })
      .signers([hirer])
      .rpc();

    const escrow = await program.account.escrow.fetch(escrowPDA);
    assert.deepEqual(escrow.status, { disputed: {} });
    assert.ok(escrow.disputedAt.toNumber() > 0);
    console.log("✅ Task disputed");

    // Resolve should fail (timeout not reached)
    try {
      await program.methods
        .resolveDispute()
        .accounts({
          caller: authority.publicKey,
          escrow: escrowPDA,
          agent: agent.publicKey,
          feeWallet: feeWallet.publicKey,
        })
        .signers([authority])
        .rpc();
      assert.fail("Should have thrown");
    } catch (e) {
      assert.ok(e.toString().includes("DisputeNotExpired"));
      console.log("✅ Early resolve rejected (timeout not reached)");
    }
  });
});
