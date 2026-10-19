'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const router = path.resolve(__dirname, '../runtime/router/bin.js');
const statusTool = () => ({ name: 'local_get_status', description: '读取状态', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } });

async function harness() {
  let records = [], probeCount = 0, slowProbe = false;
  const descriptions = new Map(), invocations = [], messages = [], pending = new Map();
  let onInput, nextId = 1;
  const source = fs.readFileSync(router, 'utf8');
  const fakeFs = {
    existsSync: () => true, mkdirSync() {}, chmodSync() {}, unlinkSync() {},
    realpathSync: file => path.resolve(file),
    readdirSync: () => records.map((_, i) => i + '.json'),
    statSync: () => ({ mtimeMs: Date.now() }),
    readFileSync: file => JSON.stringify(records[Number(path.basename(file, '.json'))]),
  };
  const fakeRpc = {
    validateRegistryEntry: () => null, PROBE_TIMEOUT_MS: 1000, toolTimeoutMs: () => 1000,
    async bridgeJsonRpc(url, body) {
      if (body.method === 'bridge/describe') {
        probeCount++;
        if (slowProbe) await new Promise(resolve => setTimeout(resolve, 10));
        return { result: { bridgeApiVersion: 1, tools: descriptions.get(url) || [], resources: [] } };
      }
      invocations.push({ url, params: body.params });
      return { result: { content: [{ type: 'text', text: 'status:' + url }] } };
    },
  };
  const context = {
    require(name) {
      if (name === 'fs') return fakeFs;
      if (name === 'os') return { homedir: () => '/virtual/home' };
      if (name === './src/http-json-rpc.js') return fakeRpc;
      if (name === './src/offline-tools.js') return { OFFLINE_TOOLS: [], isOfflineTool: () => false };
      if (name === './src/editor-control.js') return { EDITOR_TOOLS: [], isEditorTool: () => false };
      return require(name);
    },
    process: {
      stdin: { setEncoding() {}, on(event, handler) { if (event === 'data') onInput = handler; } },
      stdout: { write(line) { const message = JSON.parse(line); messages.push(message); if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); } } },
      stderr: { write() {} },
    },
    setInterval() {},
  };
  vm.runInNewContext(source, context, { filename: router });
  async function request(method, params = {}) {
    const id = nextId++;
    const response = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error('RPC timeout: ' + method)), 2000);
      pending.set(id, message => { clearTimeout(timeout); resolve(message); });
    });
    onInput(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    return response;
  }
  const call = (name, args = {}) => request('tools/call', { name, arguments: args });
  await request('initialize');
  onInput(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  return {
    request, call, messages, invocations,
    notices: () => messages.filter(message => message.method === 'notifications/tools/list_changed').length,
    setEditors(items) {
      records = items.map((item, i) => {
        const url = 'http://127.0.0.1:' + (7523 + i) + '/bridge';
        descriptions.set(url, item.tools || [statusTool()]);
        return { url, pid: item.pid || 123 + i, projectShortName: item.name, projectPath: item.path,
          transport: 'editor-bridge', gatewayApiVersion: 2, bridgeApiVersion: 1, extensionVersion: '3.0.0' };
      });
    },
    probes: () => probeCount,
    slow() { slowProbe = true; },
  };
}

test('没有编辑器时也暴露固定项目入口，会话缓存不更新仍能调用后来打开的小鸡项目', async () => {
  const h = await harness();
  const initial = await h.request('tools/list');
  const names = initial.result.tools.map(tool => tool.name);
  assert.ok(names.includes('gateway_get_project_tools'));
  assert.ok(names.includes('gateway_call_project_tool'));
  h.setEditors([{ name: 'forest', path: '/projects/forest' }]);
  await h.call('gateway_list_editors');
  h.setEditors([{ name: 'creator', path: '/projects/xiaoji/creator' }]);
  // 模拟客户端仍使用会话开始时的工具表，不再发送 tools/list。
  const catalog = await h.call('gateway_get_project_tools', { projectPath: '/projects/xiaoji/creator' });
  const data = JSON.parse(catalog.result.content[0].text);
  assert.equal(data.shortName, 'creator');
  assert.equal(data.tools[0].name, 'local_get_status');
  const result = await h.call('gateway_call_project_tool', { projectPath: '/projects/xiaoji/creator', toolName: 'local_get_status', arguments: {} });
  assert.equal(result.result.isError, undefined);
  assert.equal(h.invocations[0].params.name, 'local_get_status');
});

test('工具数量不变时，改名、改参数、改说明或 annotations 都会发送变更通知', async () => {
  const h = await harness();
  h.setEditors([{ name: 'creator', path: '/projects/xiaoji/creator' }]);
  await h.call('gateway_list_editors');
  let count = h.notices();
  for (const tool of [
    { ...statusTool(), name: 'preview_query_url' },
    { ...statusTool(), inputSchema: { type: 'object', properties: { verbose: { type: 'boolean' } } } },
    { ...statusTool(), description: '新的说明' },
    { ...statusTool(), annotations: { readOnlyHint: false } },
  ]) {
    h.setEditors([{ name: 'creator', path: '/projects/xiaoji/creator', tools: [tool] }]);
    await h.call('gateway_list_editors');
    assert.equal(h.notices(), ++count);
  }
});

test('forest 切换为 creator 时 Gateway 发出通知并返回新前缀，不保留旧前缀', async () => {
  const h = await harness();
  h.setEditors([{ name: 'forest', path: '/projects/forest' }]);
  await h.call('gateway_list_editors');
  const before = h.notices();
  h.setEditors([{ name: 'creator', path: '/projects/xiaoji/creator' }]);
  const result = await h.request('tools/list');
  assert.equal(h.notices(), before + 1);
  assert.ok(result.result.tools.some(tool => tool.name === 'creator__local_get_status'));
  assert.ok(!result.result.tools.some(tool => tool.name === 'forest__local_get_status'));
});

test('参数对象键顺序及工具顺序不影响签名，重复查询不发送通知', async () => {
  const h = await harness();
  const a = { ...statusTool(), inputSchema: { type: 'object', properties: { a: { type: 'string' }, b: { type: 'boolean' } } } };
  const b = { ...statusTool(), name: 'preview_query_url' };
  h.setEditors([{ name: 'creator', path: '/projects/xiaoji/creator', tools: [a, b] }]);
  await h.call('gateway_list_editors');
  const before = h.notices();
  const reordered = { ...a, inputSchema: { properties: { b: { type: 'boolean' }, a: { type: 'string' } }, type: 'object' } };
  h.setEditors([{ name: 'creator', path: '/projects/xiaoji/creator', tools: [b, reordered] }]);
  await h.call('gateway_list_editors');
  await h.request('tools/list');
  assert.equal(h.notices(), before);
});

test('并发发现共用一轮探测，避免旧探测结果覆盖新列表', async () => {
  const h = await harness();
  h.setEditors([{ name: 'creator', path: '/projects/xiaoji/creator' }]);
  h.slow();
  const before = h.probes();
  await Promise.all([h.call('gateway_list_editors'), h.request('tools/list'), h.call('gateway_get_project_tools', { projectPath: '/projects/xiaoji/creator' })]);
  assert.equal(h.probes() - before, 1);
});

test('固定入口严格绑定项目路径，不会将过期前缀或不存在的项目转到另一个项目', async () => {
  const h = await harness();
  h.setEditors([{ name: 'forest', path: '/projects/forest' }, { name: 'creator', path: '/projects/xiaoji/creator' }]);
  for (const args of [
    { projectPath: 'creator', toolName: 'local_get_status', arguments: {} },
    { projectPath: '/projects/unknown', toolName: 'local_get_status', arguments: {} },
    { projectPath: '/projects/xiaoji/creator', toolName: 'forest__local_get_status', arguments: {} },
    { projectPath: '/projects/xiaoji/creator', toolName: 'local_get_status', arguments: [] },
  ]) assert.ok((await h.call('gateway_call_project_tool', args)).error);
  assert.equal(h.invocations.length, 0);
  await h.call('gateway_call_project_tool', { projectPath: '/projects/xiaoji/./creator', toolName: 'local_get_status', arguments: {} });
  assert.equal(h.invocations[0].url, 'http://127.0.0.1:7524/bridge');
});

test('同项目多实例必须显式传 PID，annotations 在普通工具列表中保留', async () => {
  const h = await harness();
  h.setEditors([{ name: 'creator', path: '/projects/xiaoji/creator', pid: 111 }, { name: 'creator', path: '/projects/xiaoji/creator', pid: 222 }]);
  assert.match((await h.call('gateway_get_project_tools', { projectPath: '/projects/xiaoji/creator' })).error.message, /指定 pid/);
  const catalog = await h.call('gateway_get_project_tools', { projectPath: '/projects/xiaoji/creator', pid: 222 });
  assert.equal(JSON.parse(catalog.result.content[0].text).pid, 222);
  const listing = await h.request('tools/list');
  assert.ok(listing.result.tools.filter(tool => tool.name.endsWith('__local_get_status')).every(tool => tool.annotations.readOnlyHint));
});
