'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const router = path.join(root, 'runtime', 'router', 'bin.js');

function initializeGateway() {
  return new Promise((resolve, reject) => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cocos-mcp-gateway-test-'));
    const child = spawn(process.execPath, [router], {
      env: { ...process.env, HOME: tempHome },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';

    const finish = (error, value) => {
      child.kill();
      fs.rmSync(tempHome, { recursive: true, force: true });
      if (error) reject(error);
      else resolve(value);
    };

    const timer = setTimeout(() => {
      finish(new Error(`initialize timeout\n${stderr}`));
    }, 5000);

    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => {
      clearTimeout(timer);
      finish(error);
    });
    child.stdout.on('data', chunk => {
      stdout += chunk;
      const newline = stdout.indexOf('\n');
      if (newline < 0) return;
      clearTimeout(timer);
      try {
        finish(null, JSON.parse(stdout.slice(0, newline)));
      } catch (error) {
        finish(error);
      }
    });

    child.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'gateway-test', version: '1.0.0' },
      },
    }) + '\n');
  });
}

test('initialize 返回跨平台 Gateway instructions', async () => {
  const response = await initializeGateway();
  assert.equal(response.id, 1);
  assert.equal(response.result.serverInfo.name, 'cocos-mcp-gateway');
  assert.equal(response.result.serverInfo.version, '0.3.1');
  assert.equal(response.result.protocolVersion, '2025-06-18');
  const first512 = response.result.instructions.slice(0, 512);
  assert.match(first512, /gateway_list_editors/);
  assert.match(first512, /projectPath/);
  assert.match(first512, /authToken/);
  assert.match(response.result.instructions, /gateway_list_editors/);
  assert.match(response.result.instructions, /projectPath/);
  assert.match(response.result.instructions, /不得直接调用或注册为 MCP Server/);
  assert.match(response.result.instructions, /prefab_query/);
  assert.match(response.result.instructions, /dry-run/);
  assert.match(response.result.instructions, /不得用 force 绕过保护/);
});

test('runtime 与扩展快照中的 Gateway router 保持一致', () => {
  const runtime = fs.readFileSync(path.join(root, 'runtime', 'router', 'bin.js'));
  const snapshot = fs.readFileSync(path.join(root, 'extension', 'router', 'bin.js'));
  assert.deepEqual(snapshot, runtime);
});
