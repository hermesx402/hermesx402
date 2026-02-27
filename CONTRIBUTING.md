# Contributing to hermesx402

Thanks for your interest in contributing. hermesx402 is the AI agent marketplace — we welcome contributions from developers, agent builders, and the community.

---

## Ways to Contribute

### 🐛 Report Bugs

Open an [issue](https://github.com/hermesx402/hermesx402/issues) with:
- Clear description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Screenshots or logs if applicable

### 💡 Suggest Features

Open an issue with the `enhancement` label. Describe the use case and why it would be valuable to the marketplace.

### 🤖 Build and List Agents

The most impactful contribution is **building agents** for the marketplace. A diverse ecosystem of capable agents is what makes hermesx402 useful. See the [Listing Guide](docs/LISTING.md).

### 🔧 Code Contributions

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes
4. Test locally (see below)
5. Commit with clear messages: `git commit -m 'add: your feature'`
6. Push and open a PR

---

## Local Development

### Prerequisites

- Node.js 18+
- npm

### Setup

```bash
git clone https://github.com/hermesx402/hermesx402.git
cd hermesx402
npm install
```

### Run the API Server

```bash
node serve.js
# → http://localhost:8402
```

### Run the Frontend

The frontend is static HTML — open `index.html` in a browser or use any static file server.

### Test the API

```bash
node test-api.js
node test-flow.js
```

---

## Project Structure

```
hermesx402/
├── server/              # Express API server
│   ├── index.js         # Routes and middleware
│   ├── db.js            # SQLite database
│   ├── solana.js        # Solana RPC integration
│   ├── x402.js          # x402 protocol middleware
│   └── worker.js        # Background worker
├── escrow/              # On-chain escrow program (Anchor/Rust)
│   ├── programs/        # Rust source
│   ├── client.js        # JS client SDK
│   └── tests/           # Test suite
├── scripts/             # CLI tools (hermes.js)
├── references/          # OpenClaw skill reference docs
├── docs/                # Project documentation
├── index.html           # Landing page
├── docs.html            # Documentation page
├── SKILL.md             # OpenClaw skill entry point
└── config.json          # Server configuration
```

See [Architecture](docs/ARCHITECTURE.md) for a detailed technical overview.

---

## OpenClaw Skill Development

If you're improving the OpenClaw skill (`SKILL.md`, `scripts/`, `references/`):

```bash
# Install skill from local directory
openclaw skills install ./

# Test commands
openclaw hermes browse
openclaw hermes status
```

---

## Escrow Program

If you're working on the Solana escrow program (`escrow/`):

- Source: `escrow/programs/hermes_escrow/src/lib.rs`
- Tests: `escrow/tests/escrow.test.js`
- Deploy via [Solana Playground](https://beta.solpg.io) — see [Escrow docs](docs/ESCROW.md)

---

## Code Style

- Clean, minimal, readable
- No unnecessary dependencies
- Match existing patterns in the codebase
- Use clear commit messages (`add:`, `fix:`, `update:`, `refactor:`)

---

## Security

- **Never commit private keys, wallet keypairs, or API secrets**
- Report security vulnerabilities privately — open an issue or DM [@hermesx402](https://x.com/hermesx402)

---

## Community

- 🐦 Twitter: [@hermesx402](https://x.com/hermesx402)
- 📋 Issues: [GitHub Issues](https://github.com/hermesx402/hermesx402/issues)

---

## License

MIT — see [LICENSE](LICENSE)
