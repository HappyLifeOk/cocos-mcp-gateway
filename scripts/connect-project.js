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

let creatorVersion = '';
try {
  const projectPackage = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
  creatorVersion = projectPackage.creator && typeof projectPackage.creator.version === 'string'
    ? projectPackage.creator.version
    : '';
} catch (error) {
  fail(`无法读取项目 Creator 版本: ${error.message}`);
}
if (!creatorVersion.startsWith('3.8.')) {
  fail(`cc-3-8-x-mcp 只支持 Cocos Creator 3.8.x，当前项目版本: ${creatorVersion || 'unknown'}`);
}

const pluginRoot = path.resolve(__dirname, '..');
const snapshot = path.join(pluginRoot, 'extension');
const extensionsRoot = path.join(projectRoot, 'extensions');
const target = path.join(extensionsRoot, 'cc-3-8-x-mcp');

function findInstalledExtension() {
  if (!fs.existsSync(extensionsRoot)) return '';
  for (const entry of fs.readdirSync(extensionsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(extensionsRoot, entry.name);
    const manifest = path.join(candidate, 'package.json');
    try {
      const data = JSON.parse(fs.readFileSync(manifest, 'utf8'));
      if (data.name === 'cc-3-8-x-mcp') return candidate;
    } catch (error) {
      // 不是目标 Cocos 扩展，继续扫描。
    }
  }
  return '';
}

if (!fs.existsSync(path.join(snapshot, 'package.json')) ||
    !fs.existsSync(path.join(snapshot, 'main.js'))) {
  fail(`共享扩展快照不完整: ${snapshot}`);
}

const installedExtension = findInstalledExtension();
if (installedExtension) {
  if (!fs.existsSync(path.join(installedExtension, 'main.js'))) {
    fail(`已安装扩展缺少 main.js: ${installedExtension}`);
  }
  process.stdout.write(`项目已接入 Cocos MCP 3.8.x Editor Bridge，未覆盖现有扩展:\n  ${installedExtension}\n`);
  process.exit(0);
}

if (fs.existsSync(target)) {
  fail(`目标目录已存在但不是 cc-3-8-x-mcp，拒绝覆盖: ${target}`);
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
