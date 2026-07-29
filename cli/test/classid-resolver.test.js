'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { compressUuid } = require('../src/id.js');
const { clearCache, resolveClassIdByName } = require('../src/classid-resolver.js');

const tmpRoots = [];

after(() => {
  clearCache();
  for (const root of tmpRoots) {
    try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {}
  }
});

test('ClassIdResolver: 扫描 extensions 下的 ccclass 脚本', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'classid-ext-project-'));
  tmpRoots.push(project);

  fs.writeFileSync(path.join(project, 'package.json'), '{}');
  fs.mkdirSync(path.join(project, 'assets', 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(project, 'extensions', 'cc-state-controller', 'lib'), { recursive: true });

  const uuid = 'fca1c7d0-b8e9-4a6f-9c3d-2e5f18a04b7c';
  const tsPath = path.join(project, 'extensions', 'cc-state-controller', 'lib', 'StateController.ts');
  fs.writeFileSync(tsPath, "import { _decorator } from 'cc';\nconst { ccclass } = _decorator;\n@ccclass('StateController')\nexport class StateController {}\n");
  fs.writeFileSync(tsPath + '.meta', JSON.stringify({ uuid }));

  assert.equal(resolveClassIdByName('StateController', project), compressUuid(uuid));
});
