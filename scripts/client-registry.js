'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function getRegistryPath() {
  return path.join(os.homedir(), '.cocos-mcp', 'client.json');
}

function writeClientRegistry(rootPath) {
  const root = fs.realpathSync(path.resolve(rootPath));
  const registryPath = getRegistryPath();
  const data = {
    root,
    cliEntry: path.join(root, 'cli', 'src', 'index.js'),
    cliBin: path.join(root, 'cli', 'bin', 'cocos-mcp-cli.js'),
    router: path.join(root, 'router', 'bin.js'),
    updatedAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  const tempPath = `${registryPath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, registryPath);
  return { registryPath, data };
}

module.exports = { getRegistryPath, writeClientRegistry };
