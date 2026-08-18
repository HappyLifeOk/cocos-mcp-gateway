'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'runtime', 'cli', 'bin', 'cocos-mcp-cli.js');

function node(name, parentId, childIds, componentIds, prefabInfoId) {
  return {
    __type__: 'cc.Node',
    _name: name,
    _parent: parentId === null ? null : { __id__: parentId },
    _children: childIds.map(__id__ => ({ __id__ })),
    _active: true,
    _components: componentIds.map(__id__ => ({ __id__ })),
    _prefab: { __id__: prefabInfoId },
  };
}

function component(type, nodeId, prefabInfoId, props = {}) {
  return {
    __type__: type,
    _node: { __id__: nodeId },
    _enabled: true,
    __prefab: { __id__: prefabInfoId },
    ...props,
  };
}

function prefabInfo(fileId) {
  return {
    __type__: 'cc.PrefabInfo',
    root: { __id__: 1 },
    asset: { __id__: 0 },
    fileId,
    instance: null,
    targetOverrides: null,
    nestedPrefabInstanceRoots: [],
  };
}

function compPrefabInfo(fileId) {
  return { __type__: 'cc.CompPrefabInfo', fileId };
}

function makeSourcePrefab() {
  return [
    {
      __type__: 'cc.Prefab',
      _name: '',
      _objFlags: 0,
      __editorExtras__: {},
      _native: '',
      data: { __id__: 1 },
      optimizationPolicy: 0,
      persistent: false,
    },
    node('Root', null, [2, 3], [], 10),
    node('Target', 1, [4], [5], 6),
    node('Sibling', 1, [], [7], 8),
    node('TargetChild', 2, [], [], 9),
    component('cc.Label', 2, 11, { _string: 'target', _target: { __id__: 4 } }),
    prefabInfo('target-node'),
    component('cc.Label', 3, 12, { _string: 'sibling' }),
    prefabInfo('sibling-node'),
    prefabInfo('target-child-node'),
    prefabInfo('root-node'),
    compPrefabInfo('target-label'),
    compPrefabInfo('sibling-label'),
  ];
}

function runExtract(source, extraArgs = []) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'cocos-extract-prefab-'));
  const sourcePath = path.join(temp, 'Source.prefab');
  const outputPath = path.join(temp, 'Extracted.prefab');
  fs.writeFileSync(sourcePath, JSON.stringify(source, null, 2));

  const result = spawnSync(process.execPath, [
    cli,
    'extract-prefab',
    sourcePath,
    outputPath,
    '--node',
    'Target',
    '--name',
    'Extracted',
    '--dry-run',
    ...extraArgs,
  ], { cwd: root, encoding: 'utf8' });

  fs.rmSync(temp, { recursive: true, force: true });
  return result;
}

function makeNestedSourcePrefab() {
  return [
    {
      __type__: 'cc.Prefab',
      _name: '',
      data: { __id__: 1 },
      optimizationPolicy: 0,
      persistent: false,
    },
    node('Root', null, [2], [], 9),
    node('Target', 1, [3], [], 4),
    {
      __type__: 'cc.Node',
      _parent: { __id__: 2 },
      _prefab: { __id__: 5 },
    },
    prefabInfo('target-node'),
    {
      __type__: 'cc.PrefabInfo',
      root: { __id__: 3 },
      asset: {
        __uuid__: '36cca336-1f01-4c37-8ff4-9effb9279c44',
        __expectedType__: 'cc.Prefab',
      },
      fileId: 'nested-stub',
      instance: { __id__: 6 },
      targetOverrides: null,
    },
    {
      __type__: 'cc.PrefabInstance',
      fileId: 'nested-instance',
      prefabRootNode: { __id__: 1 },
      mountedChildren: [{ __id__: 7 }],
      mountedComponents: [],
      propertyOverrides: [],
      removedComponents: [],
    },
    node('MountedChild', 3, [], [], 8),
    prefabInfo('mounted-child'),
    prefabInfo('root-node'),
  ];
}

function parseDryRunPrefab(stdout) {
  const prefix = '=== PREFAB ===\n';
  const suffix = '\n\n=== META ===\n';
  const start = stdout.indexOf(prefix);
  const end = stdout.indexOf(suffix);
  assert.notEqual(start, -1, stdout);
  assert.notEqual(end, -1, stdout);
  return JSON.parse(stdout.slice(start + prefix.length, end));
}

function assertValidIdReferences(value, elementCount, location = '$') {
  if (value === null || typeof value !== 'object') return;
  if (Object.prototype.hasOwnProperty.call(value, '__id__')) {
    assert.equal(Number.isInteger(value.__id__), true, `${location}.__id__ 必须是整数`);
    assert.equal(value.__id__ >= 0 && value.__id__ < elementCount, true,
      `${location}.__id__=${value.__id__} 超出输出范围`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertValidIdReferences(item, elementCount, `${location}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    assertValidIdReferences(child, elementCount, `${location}.${key}`);
  }
}

test('extract-prefab 只提取目标结构子树并重写所有本地 PrefabInfo', () => {
  const result = runExtract(makeSourcePrefab());
  assert.equal(result.status, 0, result.stderr);

  const output = parseDryRunPrefab(result.stdout);
  assertValidIdReferences(output, output.length);
  const names = output
    .filter(element => element && element.__type__ === 'cc.Node')
    .map(element => element._name);

  assert.deepEqual(names, ['Extracted', 'TargetChild']);
  assert.equal(output.length, 7);

  const localPrefabInfos = output.filter(
    element => element && element.__type__ === 'cc.PrefabInfo'
  );
  assert.equal(localPrefabInfos.length, 2);
  for (const info of localPrefabInfos) {
    assert.deepEqual(info.root, { __id__: 1 });
    assert.deepEqual(info.asset, { __id__: 0 });
  }

  const label = output.find(element => element && element.__type__ === 'cc.Label');
  const targetChildId = output.findIndex(
    element => element && element.__type__ === 'cc.Node' && element._name === 'TargetChild'
  );
  assert.deepEqual(label._target, { __id__: targetChildId });
});

test('extract-prefab 拒绝组件引用目标结构子树外的节点', () => {
  const source = makeSourcePrefab();
  source[5]._target = { __id__: 3 };

  const result = runExtract(source);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /对象 \[5\] 引用了目标子树外节点 \[3\]/);
});

test('extract-prefab 保留嵌套 Prefab 与 mounted child 的归属关系', () => {
  const result = runExtract(makeNestedSourcePrefab());
  assert.equal(result.status, 0, result.stderr);

  const output = parseDryRunPrefab(result.stdout);
  assertValidIdReferences(output, output.length);
  const nestedInfo = output.find(
    element => element && element.__type__ === 'cc.PrefabInfo' && element.fileId === 'nested-stub'
  );
  const rootInfo = output.find(
    element => element && element.__type__ === 'cc.PrefabInfo' && element.fileId === 'target-node'
  );
  const nestedInstance = output.find(
    element => element && element.__type__ === 'cc.PrefabInstance'
  );
  const nestedRootId = output.findIndex(
    element => element && element.__type__ === 'cc.Node' && element._prefab &&
      output[element._prefab.__id__] === nestedInfo
  );
  const mountedChildId = output.findIndex(
    element => element && element.__type__ === 'cc.Node' && element._name === 'MountedChild'
  );

  assert.deepEqual(nestedInfo.root, { __id__: nestedRootId });
  assert.equal(nestedInfo.asset.__uuid__, '36cca336-1f01-4c37-8ff4-9effb9279c44');
  assert.deepEqual(nestedInstance.prefabRootNode, { __id__: 1 });
  assert.deepEqual(nestedInstance.mountedChildren, [{ __id__: mountedChildId }]);
  assert.deepEqual(rootInfo.nestedPrefabInstanceRoots, [{ __id__: nestedRootId }]);
});

test('runtime 与扩展快照中的 extract-prefab 实现保持一致', () => {
  const runtime = fs.readFileSync(path.join(root, 'runtime', 'cli', 'src', 'cli', 'extract-cmd.js'));
  const snapshot = fs.readFileSync(path.join(root, 'extension', 'cli', 'src', 'cli', 'extract-cmd.js'));
  assert.deepEqual(snapshot, runtime);
});
