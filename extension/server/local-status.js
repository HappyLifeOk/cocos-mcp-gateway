'use strict';

var DEV_RELOAD_INFO_KEYS = [
    'projectPath',
    'projectName',
    'editorPid',
    'editorVersion',
    'previewUrl',
    'previewPort',
];

function isSameDevReloadInfo(previous, next) {
    if (!previous || !next) return false;
    return DEV_RELOAD_INFO_KEYS.every(function (key) {
        return previous[key] === next[key];
    });
}

function isProcessAlive(pid) {
    var value = Number(pid);
    if (!Number.isInteger(value) || value <= 0) return false;
    try {
        process.kill(value, 0);
        return true;
    } catch (e) {
        return !!(e && e.code === 'EPERM');
    }
}

module.exports = {
    isSameDevReloadInfo: isSameDevReloadInfo,
    isProcessAlive: isProcessAlive,
};
