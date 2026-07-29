#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function fail(message) {
  process.stderr.write(`Error: ${message}\n`);
  process.exit(1);
}

const sourceArg = process.argv[2];
const pluginRoot = path.resolve(__dirname, '..');

if (!sourceArg) {
  fail('用法: node scripts/sync-runtime.js <cc-3-8-x-mcp 扩展目录>');
}

const source = path.resolve(sourceArg);
if (!fs.existsSync(path.join(source, 'router', 'bin.js'))) {
  fail(`不是有效的扩展目录，缺少 router/bin.js: ${source}`);
}
if (!fs.existsSync(path.join(source, 'cli', 'bin', 'cocos-mcp-cli.js'))) {
  fail(`不是有效的扩展目录，缺少 cli/bin/cocos-mcp-cli.js: ${source}`);
}

for (const name of ['router', 'cli']) {
  const from = path.join(source, name);
  const to = path.join(pluginRoot, 'runtime', name);
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(from, to, {
    recursive: true,
    filter(item) {
      return path.basename(item) !== 'test';
    },
  });
}

const extensionTarget = path.join(pluginRoot, 'extension');
fs.rmSync(extensionTarget, { recursive: true, force: true });
fs.cpSync(source, extensionTarget, {
  recursive: true,
  filter(item) {
    const name = path.basename(item);
    return name !== '.git' && name !== '.gitmodules' && name !== 'test';
  },
});

for (const name of ['LICENSE', 'NOTICE']) {
  const from = path.join(source, name);
  if (fs.existsSync(from)) {
    fs.copyFileSync(from, path.join(pluginRoot, name));
  }
}

process.stdout.write(`已同步 Cocos MCP runtime 和项目扩展快照:\n  ${source}\n  -> ${pluginRoot}\n`);
