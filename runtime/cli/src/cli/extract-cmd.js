// ============================================================
// cli/extract-cmd.js — extract-prefab 子命令
//
// 用法：
//   cocos-mcp-cli extract-prefab <src-prefab> <out-prefab>
//     --node <selector> [--name <new-name>] [--dry-run]
//
// 把 src-prefab 中某个子节点连同其整棵结构子树（含拥有的组件 /
// PrefabInfo / 嵌套 PrefabInstance / propertyOverrides / TargetInfo /
// mountedComponents 等）提取出来，构造一个独立的新 prefab + .meta。
// 引用子树外节点或组件时明确失败，不把兄弟子树隐式拖入输出。
//
// 跟 batch op clone-node 的区别：
//   - clone-node 在同 prefab 内复制 + 挂到 parent
//   - extract-prefab 写出到新 .prefab 文件（含 cc.Prefab 头），脱离源文件
//
// 典型场景：把 HomeBottom 上的 btnTask 子树提取成独立的 task BottomEntry.prefab。
//
// selector 接受 batch 同款三种形式：
//   "btnTask"
//   { "id": 13 }
//   { "path": "btnTask" }
// ============================================================

'use strict';

const fs = require('fs');
const path = require('path');
const { deterministicUUID } = require('../id.js');
const { parsePrefab } = require('../parse.js');
const { resolveNode } = require('../editor/helpers.js');

function die(msg) {
  process.stderr.write('Error: ' + msg + '\n');
  process.exit(1);
}

function parseSelector(raw) {
  // 支持 --node btnTask 或 --node '{"id":13}'
  const t = raw.trim();
  if (t.startsWith('{')) {
    try { return JSON.parse(t); } catch (e) {
      die(`--node JSON 解析失败: ${t} (${e.message})`);
    }
  }
  return t;
}

function cmdExtractPrefab(argv) {
  let srcPath = null;
  let outPath = null;
  let nodeSelector = null;
  let newName = null;
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--node') {
      nodeSelector = parseSelector(argv[++i] ?? '');
      if (!nodeSelector) die('--node 需要一个值');
    } else if (arg === '--name') {
      newName = argv[++i];
      if (!newName) die('--name 需要一个值');
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (!arg.startsWith('--')) {
      if (srcPath === null) srcPath = arg;
      else if (outPath === null) outPath = arg;
      else die('多余的位置参数: ' + arg);
    } else {
      die(`未知参数 "${arg}"`);
    }
  }

  if (!srcPath || !outPath) {
    die('用法: extract-prefab <src-prefab> <out-prefab> --node <selector> [--name <new-name>] [--dry-run]');
  }
  if (nodeSelector === null) die('--node 是必需参数');

  const srcAbs = path.resolve(process.cwd(), srcPath);
  if (!fs.existsSync(srcAbs)) die(`源 prefab 不存在: ${srcPath}`);

  // 确保 .prefab 后缀
  if (!outPath.endsWith('.prefab')) outPath += '.prefab';
  if (!newName) newName = path.basename(outPath, '.prefab');

  // 1) 解析源 prefab
  const prefabData = parsePrefab(srcAbs);
  const { elements } = prefabData;
  const { nodeId: srcNodeId } = resolveNode(prefabData, nodeSelector, 'extract-prefab');

  // 2) 先确定结构子树，再补齐子树拥有的序列化依赖。
  // PrefabInfo.root/asset 是资源归属反向引用，不能用于定义提取边界。
  const structuralNodeIds = _collectStructuralNodeIds(elements, srcNodeId);
  const prefabInfoOwners = _collectPrefabInfoOwners(elements, structuralNodeIds);
  const rootPrefabInfo = elements[elements[srcNodeId]._prefab && elements[srcNodeId]._prefab.__id__];
  if (rootPrefabInfo && rootPrefabInfo.instance && typeof rootPrefabInfo.instance.__id__ === 'number') {
    throw new Error('extract-prefab: 目标根节点是嵌套 Prefab stub，当前不支持直接提取');
  }
  const collected = _collectOwnedClosure(elements, structuralNodeIds);

  // 3) 重新编号：new[0] = 新 cc.Prefab 头部，new[1] = srcNode（root），其余按原 idx 升序
  const oldToNew = new Map();
  const sortedOld = [srcNodeId, ...[...collected].filter((i) => i !== srcNodeId).sort((a, b) => a - b)];
  const newData = [];

  // new[0]: 复制源 prefab 头部模板（只用 __type__ / data / optimizationPolicy / persistent 等基础字段）
  const srcHead = elements[0] && elements[0].__type__ === 'cc.Prefab' ? elements[0] : null;
  const newHead = {
    __type__: 'cc.Prefab',
    _name: '',
    _objFlags: 0,
    __editorExtras__: {},
    _native: '',
    data: { __id__: 1 },
    optimizationPolicy: srcHead && srcHead.optimizationPolicy !== undefined ? srcHead.optimizationPolicy : 0,
    persistent: srcHead && srcHead.persistent !== undefined ? srcHead.persistent : false,
  };
  newData.push(newHead);

  for (let i = 0; i < sortedOld.length; i++) {
    oldToNew.set(sortedOld[i], i + 1);
    newData.push(_deepClone(elements[sortedOld[i]]));
  }

  // 4) Remap __id__ 引用
  for (let i = 1; i < newData.length; i++) {
    _remapIds(newData[i], oldToNew);
  }

  // 5) 修正根节点：_parent=null, _name=newName
  const newRoot = newData[1];
  newRoot._parent = null;
  newRoot._name = newName;

  // 6) PrefabInfo.root/asset 没有参与闭包收集，需要按新资源所有权统一重写。
  for (const [prefabInfoId, owner] of prefabInfoOwners) {
    const newPrefabInfoId = oldToNew.get(prefabInfoId);
    const newPrefabInfo = newData[newPrefabInfoId];
    if (!newPrefabInfo || newPrefabInfo.__type__ !== 'cc.PrefabInfo') continue;

    if (owner.localAsset) {
      newPrefabInfo.root = { __id__: 1 };
      newPrefabInfo.asset = { __id__: 0 };
    } else {
      const newNestedRootId = oldToNew.get(owner.sourceRootId);
      if (newNestedRootId === undefined) {
        throw new Error(
          `extract-prefab: 嵌套 PrefabInfo [${prefabInfoId}] 的 root [${owner.sourceRootId}] 不在目标子树内`
        );
      }
      newPrefabInfo.root = { __id__: newNestedRootId };
    }
  }

  const newRootPrefabInfo = newData[newRoot._prefab && newRoot._prefab.__id__];
  if (newRootPrefabInfo && newRootPrefabInfo.__type__ === 'cc.PrefabInfo') {
    newRootPrefabInfo.instance = null;
    newRootPrefabInfo.targetOverrides = null;
    newRootPrefabInfo.nestedPrefabInstanceRoots = [...structuralNodeIds]
      .filter(nodeId => _isNestedPrefabStub(elements, nodeId))
      .map(nodeId => ({ __id__: oldToNew.get(nodeId) }));
  }

  for (let i = 1; i < newData.length; i++) {
    if (newData[i] && newData[i].__type__ === 'cc.PrefabInstance') {
      newData[i].prefabRootNode = { __id__: 1 };
    }
  }

  // 7) 生成 meta
  const seed = `extract-prefab:${outPath}:${newName}`;
  const newUuid = deterministicUUID(`${seed}:uuid`);
  const meta = {
    ver: '1.1.50',
    importer: 'prefab',
    imported: true,
    uuid: newUuid,
    files: ['.json'],
    subMetas: {},
    userData: { syncNodeName: newName },
  };

  if (dryRun) {
    process.stdout.write('=== PREFAB ===\n');
    process.stdout.write(JSON.stringify(newData, null, 2) + '\n');
    process.stdout.write('\n=== META ===\n');
    process.stdout.write(JSON.stringify(meta, null, 2) + '\n');
    process.stdout.write(`\n=== STATS ===\ncollected ${collected.size} objects from source idx ${srcNodeId}\n`);
    return;
  }

  const outAbs = path.resolve(process.cwd(), outPath);
  const dir = path.dirname(outAbs);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(outAbs, JSON.stringify(newData, null, 2) + '\n', 'utf8');
  fs.writeFileSync(outAbs + '.meta', JSON.stringify(meta, null, 2) + '\n', 'utf8');

  process.stdout.write(`created: ${outPath} (${collected.size} objects)\n`);
  process.stdout.write(`created: ${outPath}.meta\n`);
}

// ── internals ────────────────────────────────────────────

// 这些字段表达父级或资源归属，不是当前对象拥有的依赖。
const SKIP_KEYS = new Set(['_parent']);
const PREFAB_INFO_SKIP_KEYS = new Set(['root', 'asset']);
const PREFAB_INSTANCE_SKIP_KEYS = new Set(['prefabRootNode']);

function _collectStructuralNodeIds(elements, rootNodeId) {
  const nodeIds = new Set();
  const queue = [rootNodeId];

  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (nodeIds.has(nodeId)) continue;
    const node = elements[nodeId];
    if (!node || node.__type__ !== 'cc.Node') {
      throw new Error(`extract-prefab: 结构子树引用 [${nodeId}] 不是有效 cc.Node`);
    }
    nodeIds.add(nodeId);

    for (const childRef of node._children || []) {
      if (childRef && typeof childRef.__id__ === 'number') queue.push(childRef.__id__);
    }

    const prefabInfo = elements[node._prefab && node._prefab.__id__];
    const instance = elements[prefabInfo && prefabInfo.instance && prefabInfo.instance.__id__];
    for (const mountedRef of instance && instance.mountedChildren || []) {
      if (mountedRef && typeof mountedRef.__id__ === 'number') queue.push(mountedRef.__id__);
    }
  }

  return nodeIds;
}

function _collectPrefabInfoOwners(elements, structuralNodeIds) {
  const owners = new Map();
  for (const nodeId of structuralNodeIds) {
    const node = elements[nodeId];
    const prefabInfoId = node._prefab && node._prefab.__id__;
    const prefabInfo = elements[prefabInfoId];
    if (typeof prefabInfoId !== 'number' || !prefabInfo || prefabInfo.__type__ !== 'cc.PrefabInfo') {
      throw new Error(`extract-prefab: 节点 [${nodeId}] 缺少有效 cc.PrefabInfo`);
    }
    owners.set(prefabInfoId, {
      localAsset: !!(prefabInfo.asset && prefabInfo.asset.__id__ === 0),
      sourceRootId: prefabInfo.root && prefabInfo.root.__id__,
    });
  }
  return owners;
}

function _collectOwnedClosure(elements, structuralNodeIds) {
  const collected = new Set(structuralNodeIds);
  const queue = [...structuralNodeIds];

  while (queue.length > 0) {
    const idx = queue.shift();
    const element = elements[idx];
    if (!element || typeof element !== 'object') {
      throw new Error(`extract-prefab: __id__ [${idx}] 指向无效对象`);
    }

    const refs = [];
    _walkElementRefs(element, refs);
    for (const refId of refs) {
      const referenced = elements[refId];
      if (!referenced || typeof referenced !== 'object') {
        throw new Error(`extract-prefab: 对象 [${idx}] 引用了无效 __id__ [${refId}]`);
      }
      if (referenced.__type__ === 'cc.Node' && !structuralNodeIds.has(refId)) {
        throw new Error(`extract-prefab: 对象 [${idx}] 引用了目标子树外节点 [${refId}]`);
      }
      const ownerNodeId = _getComponentOwnerNodeId(referenced);
      if (ownerNodeId !== null && !structuralNodeIds.has(ownerNodeId)) {
        throw new Error(
          `extract-prefab: 对象 [${idx}] 引用了目标子树外组件 [${refId}]，其节点为 [${ownerNodeId}]`
        );
      }
      if (!collected.has(refId)) {
        collected.add(refId);
        queue.push(refId);
      }
    }
  }

  return collected;
}

function _walkElementRefs(element, out) {
  let extraSkipKeys = null;
  if (element.__type__ === 'cc.PrefabInfo') extraSkipKeys = PREFAB_INFO_SKIP_KEYS;
  if (element.__type__ === 'cc.PrefabInstance') extraSkipKeys = PREFAB_INSTANCE_SKIP_KEYS;

  for (const key of Object.keys(element)) {
    if (SKIP_KEYS.has(key) || extraSkipKeys && extraSkipKeys.has(key)) continue;
    _walkCollect(element[key], out);
  }
}

function _getComponentOwnerNodeId(element) {
  if (!element || element.__type__ === 'cc.Node') return null;
  const nodeRef = element.node || element._node;
  return nodeRef && typeof nodeRef.__id__ === 'number' ? nodeRef.__id__ : null;
}

function _isNestedPrefabStub(elements, nodeId) {
  const node = elements[nodeId];
  const prefabInfo = elements[node && node._prefab && node._prefab.__id__];
  const instanceId = prefabInfo && prefabInfo.instance && prefabInfo.instance.__id__;
  return typeof instanceId === 'number' && !!elements[instanceId];
}

function _walkCollect(obj, out) {
  if (obj === null || obj === undefined) return;
  if (Array.isArray(obj)) {
    for (const v of obj) _walkCollect(v, out);
    return;
  }
  if (typeof obj === 'object') {
    if (typeof obj.__id__ === 'number') {
      out.push(obj.__id__);
      return;
    }
    for (const k of Object.keys(obj)) {
      if (SKIP_KEYS.has(k)) continue;
      _walkCollect(obj[k], out);
    }
  }
}

function _deepClone(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(_deepClone);
  const out = {};
  for (const k of Object.keys(obj)) out[k] = _deepClone(obj[k]);
  return out;
}

function _remapIds(obj, map) {
  if (obj === null || obj === undefined) return;
  if (Array.isArray(obj)) {
    for (const v of obj) _remapIds(v, map);
    return;
  }
  if (typeof obj === 'object') {
    if (typeof obj.__id__ === 'number') {
      const newId = map.get(obj.__id__);
      if (newId !== undefined) {
        obj.__id__ = newId;
      } else {
        // 引用集合外的 idx —— 闭包应该完整，理论不会发生
        obj.__id__ = null;
      }
      return;
    }
    for (const k of Object.keys(obj)) _remapIds(obj[k], map);
  }
}

module.exports = { cmdExtractPrefab };
