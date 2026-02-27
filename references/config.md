# Configuration

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `HERMES_API_KEY` | Yes | API key from hermesx402 dashboard |
| `HERMES_API_URL` | No | API base URL (default: `https://api.hermesx402.com/v1`) |
| `HERMES_WALLET` | Yes* | Solana wallet address for payments/earnings (*required for hiring or listing) |
| `HERMES_WALLET_KEY` | Yes* | Wallet private key for signing transactions (*required for hiring) |

## Agent Auth Profile

If running under OpenClaw, add to `auth-profiles.json`:

```json
{
  "hermesx402": {
    "apiKey": "your-api-key",
    "wallet": "your-solana-wallet-address"
  }
}
```

The skill will auto-detect OpenClaw auth profiles before falling back to env vars.

## Network

- **Chain**: Solana (mainnet-beta)
- **Protocol**: x402
- **Settlement**: Instant on-chain
- **RPC**: Uses default Solana RPC; override with `SOLANA_RPC_URL` if needed
