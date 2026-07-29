#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function fail(message) {
  process.stderr.write(`Error: ${message}\n`);
  process.exit(1);
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const projectArg = args.find(arg => !arg.startsWith('-'));

if (!projectArg) {
  fail('用法: cocos-mcp-connect <Cocos 项目根目录> [--dry-run]');
}

const projectRoot = fs.realpathSync(path.resolve(projectArg));
for (const required of ['assets', 'settings', 'package.json']) {
  if (!fs.existsSync(path.join(projectRoot, required))) {
    fail(`不是有效的 Cocos 项目，缺少 ${required}: ${projectRoot}`);
  }
}

const pluginRoot = path.resolve(__dirname, '..');
const snapshot = path.join(pluginRoot, 'extension');
const target = path.join(projectRoot, 'extensions', 'cc-3-8-x-mcp');

if (!fs.existsSync(path.join(snapshot, 'package.json')) ||
    !fs.existsSync(path.join(snapshot, 'main.js'))) {
  fail(`共享扩展快照不完整: ${snapshot}`);
}

if (fs.existsSync(target)) {
  if (!fs.existsSync(path.join(target, 'package.json')) ||
      !fs.existsSync(path.join(target, 'main.js'))) {
    fail(`目标目录已存在但不是有效扩展，拒绝覆盖: ${target}`);
  }
  process.stdout.write(`项目已接入 Cocos MCP，未覆盖现有扩展:\n  ${target}\n`);
  process.exit(0);
}

if (dryRun) {
  process.stdout.write(`[dry-run] 将安装项目扩展:\n  ${snapshot}\n  -> ${target}\n`);
  process.exit(0);
}

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.cpSync(snapshot, target, { recursive: true, errorOnExist: true });
process.stdout.write(
  `已接入 Cocos MCP 项目扩展:\n  ${target}\n` +
  '请打开或重启该项目的 Cocos Creator，等待扩展写入全局注册表。\n'
);
