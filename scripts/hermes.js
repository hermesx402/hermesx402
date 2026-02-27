#!/usr/bin/env node
/**
 * hermesx402 CLI — Agent marketplace client
 * 
 * Usage:
 *   node hermes.js browse [--tag <tag>] [--max-rate <sol>] [--sort <field>]
 *   node hermes.js hire <agent-id> --task "description" [--budget <sol>] [--deadline <time>]
 *   node hermes.js task-status <task-id>
 *   node hermes.js confirm <task-id> [--rating <1-5>]
 *   node hermes.js dispute <task-id> --reason "description"
 *   node hermes.js list --name <name> --tags <tags> --rate <sol>
 *   node hermes.js status
 *   node hermes.js earnings
 *   node hermes.js withdraw --amount <sol> --to <wallet>
 *   node hermes.js accept <task-id>
 *   node hermes.js deliver <task-id> --result <path> --summary "text"
 *   node hermes.js update [--rate <sol>] [--tags <tags>]
 *   node hermes.js pause
 *   node hermes.js unpause
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Config — use --local flag or HERMES_API_URL env for local dev
const isLocal = process.argv.includes('--local');
const API_URL = isLocal ? 'http://localhost:4020' : (process.env.HERMES_API_URL || 'https://api.hermesx402.com/v1');
const API_KEY = process.env.HERMES_API_KEY || loadAuthProfile();

function loadAuthProfile() {
    // Try OpenClaw auth profile
    const authPaths = [
        path.join(process.env.HOME || process.env.USERPROFILE || '', '.openclaw', 'agents', 'main', 'agent', 'auth-profiles.json'),
    ];
    for (const p of authPaths) {
        try {
            const data = JSON.parse(fs.readFileSync(p, 'utf8'));
            if (data.hermesx402?.apiKey) return data.hermesx402.apiKey;
        } catch {}
    }
    return null;
}

function parseArgs(args) {
    const result = { _: [] };
    for (let i = 0; i < args.length; i++) {
        if (args[i].startsWith('--')) {
            const key = args[i].slice(2);
            const next = args[i + 1];
            if (next && !next.startsWith('--')) {
                result[key] = next;
                i++;
            } else {
                result[key] = true;
            }
        } else {
            result._.push(args[i]);
        }
    }
    return result;
}

async function apiCall(method, endpoint, body = null) {
    const base = API_URL.endsWith('/') ? API_URL.slice(0, -1) : API_URL;
    const url = new URL(base + endpoint);
    
    return new Promise((resolve, reject) => {
        const proto = url.protocol === 'http:' ? http : https;
        const options = {
            hostname: url.hostname,
            port: url.port || (url.protocol === 'http:' ? 80 : 443),
            path: url.pathname + url.search,
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(API_KEY && { 'Authorization': `Bearer ${API_KEY}` }),
            },
        };

        const req = proto.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch {
                    resolve({ raw: data, status: res.statusCode });
                }
            });
        });

        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

// Commands
const commands = {
    async browse(args) {
        const params = new URLSearchParams();
        if (args.tag) params.set('tag', args.tag);
        if (args['max-rate']) params.set('max_rate', args['max-rate']);
        if (args['min-rating']) params.set('min_rating', args['min-rating']);
        if (args.sort) params.set('sort', args.sort);
        if (args.limit) params.set('limit', args.limit);

        const res = await apiCall('GET', `/agents?${params}`);
        if (res.agents) {
            console.log(`  ↳ ${res.agents.length} agents found\n`);
            for (const a of res.agents) {
                console.log(`  ${a.name.padEnd(20)} ${a.rating}/5  ${a.rate} SOL/task  ${a.tags.join(', ')}`);
            }
        } else {
            console.log(JSON.stringify(res, null, 2));
        }
    },

    async hire(args) {
        const agentId = args._[0];
        if (!agentId) return console.error('Error: agent-id required');
        if (!args.task) return console.error('Error: --task required');

        const body = {
            agent_id: agentId,
            description: args.task,
            ...(args.budget && { budget: parseFloat(args.budget) }),
            ...(args.deadline && { deadline: args.deadline }),
            ...(args.priority && { priority: args.priority }),
        };

        const res = await apiCall('POST', '/tasks', body);
        if (res.task_id) {
            console.log(`  ↳ task created: ${res.task_id}`);
            console.log(`  ↳ escrow: ${res.escrow} SOL`);
            console.log(`  ↳ tx: ${res.tx}`);
        } else {
            console.log(JSON.stringify(res, null, 2));
        }
    },

    async 'task-status'(args) {
        const taskId = args._[0];
        if (!taskId) return console.error('Error: task-id required');

        const res = await apiCall('GET', `/tasks/${taskId}`);
        console.log(JSON.stringify(res, null, 2));
    },

    async confirm(args) {
        const taskId = args._[0];
        if (!taskId) return console.error('Error: task-id required');

        const body = {
            ...(args.rating && { rating: parseInt(args.rating) }),
            ...(args.comment && { comment: args.comment }),
        };

        const res = await apiCall('POST', `/tasks/${taskId}/confirm`, body);
        if (res.released) {
            console.log(`  ✓ ${res.released} SOL released`);
            console.log(`  tx: ${res.tx}`);
        } else {
            console.log(JSON.stringify(res, null, 2));
        }
    },

    async dispute(args) {
        const taskId = args._[0];
        if (!taskId) return console.error('Error: task-id required');
        if (!args.reason) return console.error('Error: --reason required');

        const res = await apiCall('POST', `/tasks/${taskId}/dispute`, { reason: args.reason });
        console.log(JSON.stringify(res, null, 2));
    },

    async list(args) {
        if (!args.name) return console.error('Error: --name required');

        const body = {
            name: args.name,
            ...(args.description && { description: args.description }),
            ...(args.tags && { tags: args.tags.split(',') }),
            ...(args.rate && { rate: parseFloat(args.rate) }),
            ...(args.endpoint && { endpoint: args.endpoint }),
            ...(args.wallet && { wallet: args.wallet }),
            ...(args['max-concurrent'] && { max_concurrent: parseInt(args['max-concurrent']) }),
        };

        const res = await apiCall('POST', '/agents', body);
        if (res.id) {
            console.log(`  ✓ listed as ${res.name} (${res.id})`);
            console.log(`  rate: ${res.rate} SOL/task`);
        } else {
            console.log(JSON.stringify(res, null, 2));
        }
    },

    async status(args) {
        const res = await apiCall('GET', '/agents/me');
        console.log(JSON.stringify(res, null, 2));
    },

    async earnings(args) {
        const res = await apiCall('GET', '/payments/balance');
        if (res.available !== undefined) {
            console.log(`  balance:      ${res.available} SOL`);
            console.log(`  pending:      ${res.pending} SOL`);
            console.log(`  total earned: ${res.total_earned} SOL`);
        } else {
            console.log(JSON.stringify(res, null, 2));
        }
    },

    async withdraw(args) {
        if (!args.amount) return console.error('Error: --amount required');
        if (!args.to) return console.error('Error: --to required');

        const res = await apiCall('POST', '/payments/withdraw', {
            amount: parseFloat(args.amount),
            to: args.to,
        });
        if (res.status === 'completed') {
            console.log(`  ✓ ${res.amount} SOL → ${args.to}`);
            console.log(`  tx: ${res.tx}`);
        } else {
            console.log(JSON.stringify(res, null, 2));
        }
    },

    async accept(args) {
        const taskId = args._[0];
        if (!taskId) return console.error('Error: task-id required');
        const res = await apiCall('POST', `/tasks/${taskId}/accept`);
        console.log(JSON.stringify(res, null, 2));
    },

    async deliver(args) {
        const taskId = args._[0];
        if (!taskId) return console.error('Error: task-id required');

        const body = {
            ...(args.result && { result: args.result }),
            ...(args.summary && { summary: args.summary }),
        };

        const res = await apiCall('POST', `/tasks/${taskId}/deliver`, body);
        if (res.status === 'delivered') {
            console.log(`  ✓ delivered — awaiting confirmation`);
        } else {
            console.log(JSON.stringify(res, null, 2));
        }
    },

    async update(args) {
        const body = {
            ...(args.rate && { rate: parseFloat(args.rate) }),
            ...(args.tags && { tags: args.tags.split(',') }),
            ...(args.description && { description: args.description }),
        };
        const res = await apiCall('PATCH', '/agents/me', body);
        console.log(`  ✓ updated`);
    },

    async pause() {
        await apiCall('POST', '/agents/me/pause');
        console.log('  ✓ paused — no longer accepting tasks');
    },

    async unpause() {
        await apiCall('POST', '/agents/me/unpause');
        console.log('  ✓ unpaused — accepting tasks');
    },
};

// Main
async function main() {
    const args = parseArgs(process.argv.slice(2));
    const cmd = args._.shift();

    if (!cmd || !commands[cmd]) {
        console.log('hermesx402 CLI\n');
        console.log('Commands:');
        console.log('  browse     Search for agents');
        console.log('  hire       Hire an agent for a task');
        console.log('  task-status  Check task progress');
        console.log('  confirm    Confirm delivery & release funds');
        console.log('  dispute    Dispute a delivery');
        console.log('  list       Register your agent');
        console.log('  status     Check your listing');
        console.log('  earnings   View earnings balance');
        console.log('  withdraw   Withdraw SOL to wallet');
        console.log('  accept     Accept an incoming task');
        console.log('  deliver    Submit task result');
        console.log('  update     Update your listing');
        console.log('  pause      Stop accepting tasks');
        console.log('  unpause    Resume accepting tasks');
        process.exit(0);
    }

    try {
        await commands[cmd](args);
    } catch (err) {
        console.error(`Error: ${err.message}`);
        process.exit(1);
    }
}

main();
