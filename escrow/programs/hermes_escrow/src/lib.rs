use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("11111111111111111111111111111111"); // Replace after deployment

/// HermesX402 Escrow Program
/// Trust layer for the AI agent marketplace.
/// Hirer deposits SOL → PDA escrow → released to agent on completion (minus 10% platform fee).

const PLATFORM_FEE_BPS: u64 = 1000; // 10% = 1000 basis points
const DISPUTE_TIMEOUT_SECONDS: i64 = 72 * 3600; // 72 hours auto-release

#[program]
pub mod hermes_escrow {
    use super::*;

    /// Create a new task escrow. Hirer deposits `amount` lamports into the PDA.
    pub fn create_task(
        ctx: Context<CreateTask>,
        task_id: String,
        amount: u64,
    ) -> Result<()> {
        require!(amount > 0, EscrowError::ZeroAmount);
        require!(task_id.len() <= 64, EscrowError::TaskIdTooLong);

        // Transfer SOL from hirer to escrow PDA
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.hirer.to_account_info(),
                    to: ctx.accounts.escrow.to_account_info(),
                },
            ),
            amount,
        )?;

        // Initialize escrow state
        let escrow = &mut ctx.accounts.escrow;
        escrow.hirer = ctx.accounts.hirer.key();
        escrow.agent = ctx.accounts.agent.key();
        escrow.authority = ctx.accounts.authority.key();
        escrow.fee_wallet = ctx.accounts.fee_wallet.key();
        escrow.task_id = task_id;
        escrow.amount = amount;
        escrow.platform_fee_bps = PLATFORM_FEE_BPS;
        escrow.status = TaskStatus::Created;
        escrow.created_at = Clock::get()?.unix_timestamp;
        escrow.bump = ctx.bumps.escrow;

        emit!(TaskCreated {
            task_id: escrow.task_id.clone(),
            hirer: escrow.hirer,
            agent: escrow.agent,
            amount,
        });

        Ok(())
    }

    /// Authority marks task complete → pays agent (minus fee) and platform fee wallet.
    pub fn complete_task(ctx: Context<CompleteTask>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(
            escrow.status == TaskStatus::Created || escrow.status == TaskStatus::Disputed,
            EscrowError::InvalidStatus
        );

        let fee = escrow
            .amount
            .checked_mul(escrow.platform_fee_bps)
            .unwrap()
            .checked_div(10_000)
            .unwrap();
        let agent_payout = escrow.amount.checked_sub(fee).unwrap();

        // Transfer from PDA (requires seeds signer)
        let task_id_bytes = escrow.task_id.as_bytes();
        let bump = &[escrow.bump];
        let seeds: &[&[u8]] = &[b"escrow", task_id_bytes, bump];
        let signer_seeds = &[seeds];

        // Pay agent
        **escrow.to_account_info().try_borrow_mut_lamports()? -= agent_payout;
        **ctx.accounts.agent.to_account_info().try_borrow_mut_lamports()? += agent_payout;

        // Pay platform fee
        **escrow.to_account_info().try_borrow_mut_lamports()? -= fee;
        **ctx.accounts.fee_wallet.to_account_info().try_borrow_mut_lamports()? += fee;

        escrow.status = TaskStatus::Completed;

        emit!(TaskCompleted {
            task_id: escrow.task_id.clone(),
            agent_payout,
            platform_fee: fee,
        });

        Ok(())
    }

    /// Hirer cancels task → full refund. Only if status is Created.
    pub fn cancel_task(ctx: Context<CancelTask>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(escrow.status == TaskStatus::Created, EscrowError::InvalidStatus);

        let refund = escrow.amount;

        **escrow.to_account_info().try_borrow_mut_lamports()? -= refund;
        **ctx.accounts.hirer.to_account_info().try_borrow_mut_lamports()? += refund;

        escrow.status = TaskStatus::Cancelled;

        emit!(TaskCancelled {
            task_id: escrow.task_id.clone(),
            refund,
        });

        Ok(())
    }

    /// Either party opens a dispute. After DISPUTE_TIMEOUT_SECONDS with no resolution,
    /// anyone can call resolve_dispute to auto-release to the agent.
    pub fn dispute_task(ctx: Context<DisputeTask>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(escrow.status == TaskStatus::Created, EscrowError::InvalidStatus);

        let caller = ctx.accounts.caller.key();
        require!(
            caller == escrow.hirer || caller == escrow.agent,
            EscrowError::Unauthorized
        );

        escrow.status = TaskStatus::Disputed;
        escrow.disputed_at = Clock::get()?.unix_timestamp;

        emit!(TaskDisputed {
            task_id: escrow.task_id.clone(),
            disputed_by: caller,
        });

        Ok(())
    }

    /// Auto-release after dispute timeout. Anyone can call this (permissionless crank).
    pub fn resolve_dispute(ctx: Context<ResolveDispute>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(escrow.status == TaskStatus::Disputed, EscrowError::InvalidStatus);

        let now = Clock::get()?.unix_timestamp;
        require!(
            now >= escrow.disputed_at + DISPUTE_TIMEOUT_SECONDS,
            EscrowError::DisputeNotExpired
        );

        // Same logic as complete — pay agent minus fee
        let fee = escrow.amount.checked_mul(escrow.platform_fee_bps).unwrap().checked_div(10_000).unwrap();
        let agent_payout = escrow.amount.checked_sub(fee).unwrap();

        **escrow.to_account_info().try_borrow_mut_lamports()? -= agent_payout;
        **ctx.accounts.agent.to_account_info().try_borrow_mut_lamports()? += agent_payout;

        **escrow.to_account_info().try_borrow_mut_lamports()? -= fee;
        **ctx.accounts.fee_wallet.to_account_info().try_borrow_mut_lamports()? += fee;

        escrow.status = TaskStatus::Resolved;

        emit!(TaskResolved {
            task_id: escrow.task_id.clone(),
            agent_payout,
            platform_fee: fee,
        });

        Ok(())
    }
}

// ─── Accounts ───────────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(task_id: String, amount: u64)]
pub struct CreateTask<'info> {
    #[account(mut)]
    pub hirer: Signer<'info>,

    /// CHECK: Agent wallet, receives payout on completion. Not validated beyond being a valid pubkey.
    pub agent: UncheckedAccount<'info>,

    /// The server/backend authority that can mark tasks complete.
    pub authority: Signer<'info>,

    /// CHECK: Platform fee recipient. Stored in escrow state.
    pub fee_wallet: UncheckedAccount<'info>,

    #[account(
        init,
        payer = hirer,
        space = 8 + Escrow::INIT_SPACE,
        seeds = [b"escrow", task_id.as_bytes()],
        bump,
    )]
    pub escrow: Account<'info, Escrow>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CompleteTask<'info> {
    /// Authority (server wallet) must sign to complete.
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"escrow", escrow.task_id.as_bytes()],
        bump = escrow.bump,
        has_one = authority @ EscrowError::Unauthorized,
        has_one = agent @ EscrowError::WrongAgent,
    )]
    pub escrow: Account<'info, Escrow>,

    /// CHECK: Must match escrow.agent
    #[account(mut)]
    pub agent: UncheckedAccount<'info>,

    /// CHECK: Must match escrow.fee_wallet
    #[account(mut, constraint = fee_wallet.key() == escrow.fee_wallet @ EscrowError::WrongFeeWallet)]
    pub fee_wallet: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct CancelTask<'info> {
    #[account(mut)]
    pub hirer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"escrow", escrow.task_id.as_bytes()],
        bump = escrow.bump,
        has_one = hirer @ EscrowError::Unauthorized,
    )]
    pub escrow: Account<'info, Escrow>,
}

#[derive(Accounts)]
pub struct DisputeTask<'info> {
    pub caller: Signer<'info>,

    #[account(
        mut,
        seeds = [b"escrow", escrow.task_id.as_bytes()],
        bump = escrow.bump,
    )]
    pub escrow: Account<'info, Escrow>,
}

#[derive(Accounts)]
pub struct ResolveDispute<'info> {
    /// Anyone can crank this after timeout (permissionless).
    pub caller: Signer<'info>,

    #[account(
        mut,
        seeds = [b"escrow", escrow.task_id.as_bytes()],
        bump = escrow.bump,
        has_one = agent @ EscrowError::WrongAgent,
    )]
    pub escrow: Account<'info, Escrow>,

    /// CHECK: Must match escrow.agent
    #[account(mut)]
    pub agent: UncheckedAccount<'info>,

    /// CHECK: Must match escrow.fee_wallet
    #[account(mut, constraint = fee_wallet.key() == escrow.fee_wallet @ EscrowError::WrongFeeWallet)]
    pub fee_wallet: UncheckedAccount<'info>,
}

// ─── State ──────────────────────────────────────────────────────────────────

#[account]
#[derive(InitSpace)]
pub struct Escrow {
    pub hirer: Pubkey,           // 32
    pub agent: Pubkey,           // 32
    pub authority: Pubkey,       // 32
    pub fee_wallet: Pubkey,      // 32
    #[max_len(64)]
    pub task_id: String,         // 4 + 64
    pub amount: u64,             // 8
    pub platform_fee_bps: u64,   // 8
    pub status: TaskStatus,      // 1
    pub created_at: i64,         // 8
    pub disputed_at: i64,        // 8
    pub bump: u8,                // 1
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum TaskStatus {
    Created,
    Completed,
    Cancelled,
    Disputed,
    Resolved,
}

// ─── Errors ─────────────────────────────────────────────────────────────────

#[error_code]
pub enum EscrowError {
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Task ID too long (max 64 chars)")]
    TaskIdTooLong,
    #[msg("Invalid task status for this operation")]
    InvalidStatus,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Wrong agent account")]
    WrongAgent,
    #[msg("Wrong fee wallet")]
    WrongFeeWallet,
    #[msg("Dispute timeout has not expired yet")]
    DisputeNotExpired,
}

// ─── Events ─────────────────────────────────────────────────────────────────

#[event]
pub struct TaskCreated {
    pub task_id: String,
    pub hirer: Pubkey,
    pub agent: Pubkey,
    pub amount: u64,
}

#[event]
pub struct TaskCompleted {
    pub task_id: String,
    pub agent_payout: u64,
    pub platform_fee: u64,
}

#[event]
pub struct TaskCancelled {
    pub task_id: String,
    pub refund: u64,
}

#[event]
pub struct TaskDisputed {
    pub task_id: String,
    pub disputed_by: Pubkey,
}

#[event]
pub struct TaskResolved {
    pub task_id: String,
    pub agent_payout: u64,
    pub platform_fee: u64,
}
