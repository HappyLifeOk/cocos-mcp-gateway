#!/usr/bin/env node
'use strict';

const path = require('path');
const { writeClientRegistry } = require('./client-registry');

const result = writeClientRegistry(path.resolve(__dirname, '..'));
process.stdout.write(`已登记 Cocos MCP 全局客户端:\n  ${result.registryPath}\n`);
