/**
 * hermesx402 mock API server
 * Responds with realistic data so the CLI works for real.
 */
const http = require('http');

const agents = [
    { id: 'agent-0x7f3a', name: 'code-auditor', tags: ['code', 'review', 'security'], rate: 0.12, rating: 4.9, tasks_completed: 142, success_rate: 98, status: 'online', description: 'Deep code review and security auditing. Finds vulnerabilities, suggests fixes, checks for best practices.' },
    { id: 'agent-0x2b1c', name: 'bug-hunter', tags: ['code', 'testing', 'bugs'], rate: 0.08, rating: 4.7, tasks_completed: 89, success_rate: 94, status: 'online', description: 'Automated bug detection and testing. Writes test cases, finds edge cases, and reports issues.' },
    { id: 'agent-0x9e4d', name: 'refactor-bot', tags: ['code', 'refactor', 'optimization'], rate: 0.15, rating: 4.6, tasks_completed: 56, success_rate: 92, status: 'online', description: 'Code refactoring and optimization. Improves readability and performance without changing behavior.' },
    { id: 'agent-0x1a8f', name: 'research-bot', tags: ['research', 'analysis', 'reports'], rate: 0.1, rating: 4.8, tasks_completed: 203, success_rate: 96, status: 'online', description: 'Comprehensive research on any topic. Returns structured reports with sources and analysis.' },
    { id: 'agent-0x5c2e', name: 'data-scout', tags: ['data', 'research', 'scraping'], rate: 0.09, rating: 4.5, tasks_completed: 67, success_rate: 91, status: 'online', description: 'Web scraping and data collection. Gathers structured data from any source.' },
    { id: 'agent-0xd3f7', name: 'writer-agent', tags: ['creative', 'writing', 'content'], rate: 0.11, rating: 4.4, tasks_completed: 34, success_rate: 90, status: 'online', description: 'Content creation — blog posts, docs, copywriting. Matches your tone and style.' },
];

let myAgent = null;
let balance = { available: 0, pending: 0, total_earned: 0 };
let taskCounter = 0;
const tasks = {};

function matchTag(agent, tag) {
    if (!tag) return true;
    return agent.tags.some(t => t.includes(tag.toLowerCase()));
}

const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
        const url = new URL(req.url, 'http://localhost');
        const path = url.pathname;
        let data = {};
        try { data = body ? JSON.parse(body) : {}; } catch {}

        // GET /agents
        if (req.method === 'GET' && path === '/agents') {
            const tag = url.searchParams.get('tag');
            const maxRate = parseFloat(url.searchParams.get('max_rate')) || Infinity;
            const sort = url.searchParams.get('sort') || 'rating';
            let results = agents.filter(a => matchTag(a, tag) && a.rate <= maxRate);
            if (sort === 'rating') results.sort((a, b) => b.rating - a.rating);
            else if (sort === 'price') results.sort((a, b) => a.rate - b.rate);
            res.end(JSON.stringify({ agents: results }));
        }
        // GET /agents/me
        else if (req.method === 'GET' && path === '/agents/me') {
            if (myAgent) {
                res.end(JSON.stringify(myAgent));
            } else {
                res.statusCode = 404;
                res.end(JSON.stringify({ error: 'No agent registered' }));
            }
        }
        // POST /agents (register)
        else if (req.method === 'POST' && path === '/agents') {
            myAgent = {
                id: 'agent-0x' + Math.random().toString(16).slice(2, 6),
                name: data.name || 'my-agent',
                description: data.description || '',
                tags: data.tags || [],
                rate: data.rate || 0.1,
                rating: 0,
                tasks_completed: 0,
                success_rate: 0,
                status: 'online',
                endpoint: data.endpoint || '',
                wallet: data.wallet || ''
            };
            // Add to marketplace
            agents.push(myAgent);
            res.end(JSON.stringify(myAgent));
        }
        // POST /tasks (hire)
        else if (req.method === 'POST' && path === '/tasks') {
            const agent = agents.find(a => a.id === data.agent_id || a.name === data.agent_id);
            const rate = agent ? agent.rate : (data.budget || 0.1);
            taskCounter++;
            const taskId = `task-0x${taskCounter.toString(16).padStart(4, '0')}`;
            const tx = Math.random().toString(36).slice(2, 8) + '...' + Math.random().toString(36).slice(2, 6);
            tasks[taskId] = {
                task_id: taskId,
                agent_id: data.agent_id,
                description: data.description,
                status: 'working',
                escrow: rate,
                tx: tx,
                progress: 0,
                deadline: data.deadline || '24h'
            };
            // Auto-complete after a moment
            setTimeout(() => {
                if (tasks[taskId]) {
                    tasks[taskId].status = 'delivered';
                    tasks[taskId].progress = 100;
                }
            }, 3000);
            res.end(JSON.stringify({ task_id: taskId, status: 'created', escrow: rate, tx }));
        }
        // GET /tasks/:id
        else if (req.method === 'GET' && path.startsWith('/tasks/')) {
            const taskId = path.split('/')[2];
            if (tasks[taskId]) {
                res.end(JSON.stringify(tasks[taskId]));
            } else {
                res.statusCode = 404;
                res.end(JSON.stringify({ error: 'Task not found' }));
            }
        }
        // POST /tasks/:id/confirm
        else if (req.method === 'POST' && path.match(/\/tasks\/.*\/confirm/)) {
            const taskId = path.split('/')[2];
            if (tasks[taskId]) {
                const released = tasks[taskId].escrow;
                const tx = Math.random().toString(36).slice(2, 8) + '...' + Math.random().toString(36).slice(2, 6);
                tasks[taskId].status = 'confirmed';
                balance.available += released;
                balance.total_earned += released;
                res.end(JSON.stringify({ released, tx }));
            } else {
                res.statusCode = 404;
                res.end(JSON.stringify({ error: 'Task not found' }));
            }
        }
        // GET /payments/balance
        else if (req.method === 'GET' && path === '/payments/balance') {
            res.end(JSON.stringify(balance));
        }
        // POST /payments/withdraw
        else if (req.method === 'POST' && path === '/payments/withdraw') {
            const amount = Math.min(data.amount || 0, balance.available);
            balance.available -= amount;
            const tx = Math.random().toString(36).slice(2, 8) + '...' + Math.random().toString(36).slice(2, 6);
            res.end(JSON.stringify({ status: 'completed', amount, tx, fee: 0 }));
        }
        // POST /agents/me/pause
        else if (req.method === 'POST' && path === '/agents/me/pause') {
            if (myAgent) myAgent.status = 'paused';
            res.end(JSON.stringify({ status: 'paused' }));
        }
        // POST /agents/me/unpause
        else if (req.method === 'POST' && path === '/agents/me/unpause') {
            if (myAgent) myAgent.status = 'online';
            res.end(JSON.stringify({ status: 'online' }));
        }
        else {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: 'Not found' }));
        }
    });
});

const PORT = 4020;
server.listen(PORT, () => {
    console.log(`hermesx402 mock API running on http://localhost:${PORT}`);
});
