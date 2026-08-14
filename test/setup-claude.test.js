'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('Claude dry-run 同时声明个人 Skill 与用户级 MCP', () => {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'setup-claude.js'), '--dry-run'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_CONFIG_DIR: path.join(root, '.tmp-claude-test') },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\[skill\].*cocos-mcp-control/);
  assert.match(result.stdout, /claude mcp remove cocos --scope user/);
  assert.match(result.stdout, /claude mcp add --scope user cocos -- node/);
  assert.match(result.stdout, /runtime\/router\/bin\.js/);
});

test('Claude 安装器可以迁移旧版失效 Skill 符号链接', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'cocos-mcp-claude-setup-'));
  const configRoot = path.join(temp, '.claude');
  const skillsRoot = path.join(configRoot, 'skills');
  const target = path.join(skillsRoot, 'cocos-mcp-control');
  const fakeBin = path.join(temp, 'bin');
  fs.mkdirSync(skillsRoot, { recursive: true });
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.symlinkSync(
    path.join(temp, 'missing', 'cocos-mcp', 'skills', 'cocos-mcp-control'),
    target
  );

  const fakeClaude = path.join(fakeBin, process.platform === 'win32' ? 'claude.cmd' : 'claude');
  fs.writeFileSync(
    fakeClaude,
    process.platform === 'win32' ? '@exit /b 0\r\n' : '#!/bin/sh\nexit 0\n',
    { mode: 0o755 }
  );

  try {
    const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'setup-claude.js')], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        CLAUDE_CONFIG_DIR: configRoot,
        PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ''}`,
      },
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.lstatSync(target).isDirectory(), true);
    assert.equal(fs.existsSync(path.join(target, 'SKILL.md')), true);
    assert.equal(fs.existsSync(path.join(target, '.cocos-mcp-gateway-managed')), true);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('Claude 安装器不覆盖用户自建的同名 Skill', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'cocos-mcp-claude-custom-skill-'));
  const configRoot = path.join(temp, '.claude');
  const target = path.join(configRoot, 'skills', 'cocos-mcp-control');
  const fakeBin = path.join(temp, 'bin');
  fs.mkdirSync(target, { recursive: true });
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.writeFileSync(path.join(target, 'SKILL.md'), 'user-owned\n');

  const fakeClaude = path.join(fakeBin, process.platform === 'win32' ? 'claude.cmd' : 'claude');
  fs.writeFileSync(
    fakeClaude,
    process.platform === 'win32' ? '@exit /b 0\r\n' : '#!/bin/sh\nexit 0\n',
    { mode: 0o755 }
  );

  try {
    const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'setup-claude.js')], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        CLAUDE_CONFIG_DIR: configRoot,
        PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ''}`,
      },
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /未覆盖/);
    assert.equal(fs.readFileSync(path.join(target, 'SKILL.md'), 'utf8'), 'user-owned\n');
    assert.equal(fs.existsSync(path.join(target, '.cocos-mcp-gateway-managed')), false);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
