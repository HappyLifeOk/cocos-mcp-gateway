#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { writeClientRegistry } = require('./client-registry');

const DEFAULT_REPO = 'https://gitee.com/Fu_Rao/cocos-mcp-extension.git';

function fail(message) {
  process.stderr.write(`Error: ${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const result = {
    project: '',
    mode: 'submodule',
    repo: DEFAULT_REPO,
    branch: 'main',
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--mode') result.mode = argv[++i];
    else if (arg === '--repo') result.repo = argv[++i];
    else if (arg === '--branch') result.branch = argv[++i];
    else if (arg === '--dry-run') result.dryRun = true;
    else if (!arg.startsWith('-') && !result.project) result.project = arg;
    else fail(`未知参数: ${arg}`);
  }
  return result;
}

function runGit(args, cwd, dryRun) {
  const printable = ['git', '-C', cwd, ...args].map(value =>
    /\s/.test(value) ? JSON.stringify(value) : value
  ).join(' ');
  if (dryRun) {
    process.stdout.write(`[dry-run] ${printable}\n`);
    return;
  }
  const result = spawnSync('git', ['-C', cwd, ...args], { stdio: 'inherit' });
  if (result.error) fail(result.error.message);
  if (result.status !== 0) process.exit(result.status || 1);
}

const options = parseArgs(process.argv.slice(2));
writeClientRegistry(path.resolve(__dirname, '..'));
if (!options.project) {
  fail('用法: cocos-mcp-connect <Cocos 项目根目录> [--mode submodule|clone] [--branch main] [--repo URL] [--dry-run]');
}
if (!['submodule', 'clone'].includes(options.mode)) {
  fail(`不支持的安装模式: ${options.mode}`);
}

const projectInput = path.resolve(options.project);
if (!fs.existsSync(projectInput)) fail(`项目路径不存在: ${projectInput}`);
const projectRoot = fs.realpathSync(projectInput);
for (const required of ['assets', 'settings', 'package.json']) {
  if (!fs.existsSync(path.join(projectRoot, required))) {
    fail(`不是有效的 Cocos 项目，缺少 ${required}: ${projectRoot}`);
  }
}

const target = path.join(projectRoot, 'extensions', 'cc-3-8-x-mcp');
if (fs.existsSync(target)) {
  if (!fs.existsSync(path.join(target, 'package.json')) ||
      !fs.existsSync(path.join(target, 'main.js'))) {
    fail(`目标目录已存在但不是有效扩展，拒绝覆盖: ${target}`);
  }
  process.stdout.write(`项目已接入 Cocos MCP，未覆盖现有扩展:\n  ${target}\n`);
  process.exit(0);
}

if (options.mode === 'clone') {
  if (!options.dryRun) fs.mkdirSync(path.dirname(target), { recursive: true });
  runGit(
    ['clone', '--depth', '1', '--branch', options.branch, options.repo, target],
    projectRoot,
    options.dryRun
  );
} else {
  const topResult = spawnSync(
    'git',
    ['-C', projectRoot, 'rev-parse', '--show-toplevel'],
    { encoding: 'utf8' }
  );
  if (topResult.status !== 0) {
    fail('submodule 模式要求 Cocos 项目位于 Git 仓库中；可改用 --mode clone');
  }
  const gitRoot = fs.realpathSync(topResult.stdout.trim());
  const relativeTarget = path.relative(gitRoot, target);
  runGit(
    ['submodule', 'add', '--branch', options.branch, options.repo, relativeTarget],
    gitRoot,
    options.dryRun
  );
}

process.stdout.write(
  `已接入 Cocos MCP 项目扩展:\n  ${target}\n` +
  '请打开或重启该项目的 Cocos Creator，等待扩展写入全局注册表。\n'
);
