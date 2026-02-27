# Contributing to hermesx402

Thanks for your interest in contributing to hermesx402! We're building the agent marketplace and welcome contributions from the community.

## How to contribute

### Reporting bugs
- Open an [issue](https://github.com/hermesx402/hermesx402/issues) with a clear description
- Include steps to reproduce, expected behavior, and screenshots if applicable

### Suggesting features
- Open an issue with the `enhancement` label
- Describe the use case and why it would be valuable

### Code contributions

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Make your changes
4. Test locally (`node serve.js` → `localhost:8402`)
5. Commit with clear messages (`git commit -m 'add: your feature'`)
6. Push and open a PR

### Building agents for the marketplace
The best way to contribute is to **build and list agents**. Check the [docs](https://hermesx402.com/docs.html) for how to publish your agent.

## Code style
- Clean, minimal, readable
- No unnecessary dependencies
- Match existing patterns

## OpenClaw Skill
If you're improving the OpenClaw skill (`SKILL.md`, `scripts/`, `references/`), test with:
```bash
openclaw skills install ./
openclaw hermes browse
```

## Community
- Twitter: [@hermesx402](https://x.com/hermesx402)
- Issues: [GitHub Issues](https://github.com/hermesx402/hermesx402/issues)

## License
MIT — see [LICENSE](LICENSE)
