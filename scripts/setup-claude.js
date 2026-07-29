#!/usr/bin/env node
'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const dryRun = process.argv.includes('--dry-run');
const root = path.resolve(__dirname, '..');
const router = path.join(root, 'runtime', 'router', 'bin.js');
const claude = process.platform === 'win32' ? 'claude.cmd' : 'claude';

const removeArgs = ['mcp', 'remove', 'cocos', '--scope', 'user'];
const addArgs = ['mcp', 'add', '--scope', 'user', 'cocos', '--', 'node', router];

function print(args) {
  process.stdout.write(
    [claude, ...args].map(value => /\s/.test(value) ? JSON.stringify(value) : value).join(' ') + '\n'
  );
}

if (dryRun) {
  print(removeArgs);
  print(addArgs);
  process.exit(0);
}

spawnSync(claude, removeArgs, { stdio: 'ignore' });
const result = spawnSync(claude, addArgs, { stdio: 'inherit' });
if (result.error) {
  process.stderr.write(`Error: ${result.error.message}\n`);
  process.exit(1);
}
process.exit(result.status || 0);
