#!/usr/bin/env node
'use strict';

const path = require('path');
const { spawnSync } = require('child_process');
const { writeClientRegistry } = require('./client-registry');

const dryRun = process.argv.includes('--dry-run');
const root = path.resolve(__dirname, '..');
writeClientRegistry(root);
const router = path.join(root, 'router', 'bin.js');
const claude = process.platform === 'win32' ? 'claude.cmd' : 'claude';

function print(commandArgs) {
  process.stdout.write(
    [claude, ...commandArgs].map(value =>
      /\s/.test(value) ? JSON.stringify(value) : value
    ).join(' ') + '\n'
  );
}

const removeArgs = ['mcp', 'remove', 'cocos', '--scope', 'user'];
const addArgs = ['mcp', 'add', '--scope', 'user', 'cocos', '--', 'node', router];

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
