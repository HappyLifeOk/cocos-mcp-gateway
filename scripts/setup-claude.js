#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const dryRun = process.argv.includes('--dry-run');
const root = path.resolve(__dirname, '..');
const router = path.join(root, 'runtime', 'router', 'bin.js');
const claude = process.platform === 'win32' ? 'claude.cmd' : 'claude';
const claudeConfigRoot = process.env.CLAUDE_CONFIG_DIR
  ? path.resolve(process.env.CLAUDE_CONFIG_DIR)
  : path.join(os.homedir(), '.claude');
const skillName = 'cocos-mcp-control';
const skillSource = path.join(root, 'skills', skillName);
const skillRoot = path.join(claudeConfigRoot, 'skills');
const skillTarget = path.join(skillRoot, skillName);
const managedMarker = '.cocos-mcp-gateway-managed';

const removeArgs = ['mcp', 'remove', 'cocos', '--scope', 'user'];
const addArgs = ['mcp', 'add', '--scope', 'user', 'cocos', '--', 'node', router];

function print(args) {
  process.stdout.write(
    [claude, ...args].map(value => /\s/.test(value) ? JSON.stringify(value) : value).join(' ') + '\n'
  );
}

function printSkillPlan() {
  process.stdout.write(`[skill] ${skillSource} -> ${skillTarget}\n`);
}

function entryExists(target) {
  try {
    fs.lstatSync(target);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

function isManagedSkillTarget() {
  if (!entryExists(skillTarget)) return false;
  if (fs.existsSync(path.join(skillTarget, managedMarker))) return true;
  const stat = fs.lstatSync(skillTarget);
  if (!stat.isSymbolicLink()) return false;

  const link = fs.readlinkSync(skillTarget);
  const resolved = path.resolve(path.dirname(skillTarget), link);
  const legacySuffix = path.join('cocos-mcp', 'skills', skillName);
  const currentSuffix = path.join('cocos-mcp-gateway', 'skills', skillName);
  return resolved.endsWith(legacySuffix) || resolved.endsWith(currentSuffix);
}

function installSkill() {
  if (!fs.existsSync(path.join(skillSource, 'SKILL.md'))) {
    process.stderr.write(`Warning: 缺少 Claude Skill 源文件，已跳过: ${skillSource}\n`);
    return false;
  }

  if (entryExists(skillTarget) && !isManagedSkillTarget()) {
    process.stderr.write(
      `Warning: 检测到非 cocos-mcp-gateway 管理的同名 Claude Skill，未覆盖: ${skillTarget}\n`
    );
    return false;
  }

  fs.mkdirSync(skillRoot, { recursive: true });
  const nonce = `${process.pid}-${Date.now()}`;
  const staging = path.join(skillRoot, `.${skillName}.staging-${nonce}`);
  const backup = path.join(skillRoot, `.${skillName}.backup-${nonce}`);

  try {
    fs.cpSync(skillSource, staging, { recursive: true });
    fs.writeFileSync(
      path.join(staging, managedMarker),
      `source=${root}\ninstalledAt=${new Date().toISOString()}\n`,
      { mode: 0o600 }
    );

    if (entryExists(skillTarget)) fs.renameSync(skillTarget, backup);
    try {
      fs.renameSync(staging, skillTarget);
    } catch (error) {
      if (entryExists(backup) && !entryExists(skillTarget)) fs.renameSync(backup, skillTarget);
      throw error;
    }
    if (entryExists(backup)) fs.rmSync(backup, { recursive: true, force: true });
  } finally {
    if (entryExists(staging)) fs.rmSync(staging, { recursive: true, force: true });
  }

  process.stdout.write(`已安装 Claude Skill: ${skillTarget}\n`);
  return true;
}

if (dryRun) {
  printSkillPlan();
  print(removeArgs);
  print(addArgs);
  process.exit(0);
}

installSkill();
spawnSync(claude, removeArgs, { stdio: 'ignore' });
const result = spawnSync(claude, addArgs, { stdio: 'inherit' });
if (result.error) {
  process.stderr.write(`Error: ${result.error.message}\n`);
  process.exit(1);
}
process.exit(result.status || 0);
