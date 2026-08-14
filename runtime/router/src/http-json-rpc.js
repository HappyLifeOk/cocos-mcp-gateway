'use strict';

const http = require('http');

const DEFAULT_PROBE_TIMEOUT_MS = 8000;
const DEFAULT_TOOL_TIMEOUT_MS = 60000;
const DEFAULT_LONG_TOOL_TIMEOUT_MS = 180000;

function positiveEnvInt(name, fallback) {
    const raw = process.env[name];
    if (!raw) return fallback;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

const PROBE_TIMEOUT_MS = positiveEnvInt('COCOS_MCP_PROBE_TIMEOUT_MS', DEFAULT_PROBE_TIMEOUT_MS);
const TOOL_TIMEOUT_MS = positiveEnvInt('COCOS_MCP_TOOL_TIMEOUT_MS', DEFAULT_TOOL_TIMEOUT_MS);
const LONG_TOOL_TIMEOUT_MS = positiveEnvInt('COCOS_MCP_LONG_TOOL_TIMEOUT_MS', DEFAULT_LONG_TOOL_TIMEOUT_MS);

function isLoopbackUrl(rawUrl, expectedPath) {
    try {
        const parsed = new URL(rawUrl);
        const host = parsed.hostname.toLowerCase();
        const isLoopback = host === '127.0.0.1' || host === 'localhost' || host === '[::1]' || host === '::1';
        const port = Number(parsed.port);
        return parsed.protocol === 'http:'
            && isLoopback
            && Number.isInteger(port) && port > 0 && port <= 65535
            && parsed.pathname === expectedPath
            && !parsed.username && !parsed.password
            && !parsed.search && !parsed.hash;
    } catch (e) {
        return false;
    }
}

function isLoopbackBridgeUrl(rawUrl) {
    return isLoopbackUrl(rawUrl, '/bridge');
}

function isPidAlive(pid) {
    if (!Number.isInteger(Number(pid)) || Number(pid) <= 0) return false;
    try {
        process.kill(Number(pid), 0);
        return true;
    } catch (e) {
        return e && e.code === 'EPERM';
    }
}

function validateRegistryEntry(info) {
    if (!info || typeof info !== 'object') return 'registry entry must be an object';
    if (!isPidAlive(info.pid)) return 'editor pid is not alive';
    if (typeof info.projectPath !== 'string' || !info.projectPath) return 'projectPath is required';
    if (typeof info.projectShortName !== 'string' || !info.projectShortName) return 'projectShortName is required';
    if (info.transport !== 'editor-bridge') return 'transport must be editor-bridge';
    if (!isLoopbackBridgeUrl(info.url)) return 'editor-bridge endpoint must be http://loopback:<port>/bridge';
    if (Number(info.gatewayApiVersion || 0) < 2) return 'editor-bridge requires gatewayApiVersion >= 2';
    if (Number(info.bridgeApiVersion || 0) !== 1) return 'unsupported bridgeApiVersion';
    if (!/^[0-9a-f]{64}$/i.test(info.authToken || '')) return 'editor-bridge authToken must be a 32-byte hex token';
    return null;
}

function bridgeJsonRpc(targetUrl, body, options) {
    options = options || {};
    const timeoutMs = options.timeoutMs || PROBE_TIMEOUT_MS;

    return new Promise(function (resolve, reject) {
        try {
            if (!isLoopbackBridgeUrl(targetUrl)) {
                reject(new Error('refusing invalid loopback Editor Bridge endpoint'));
                return;
            }
            const u = new URL(targetUrl);
            const data = JSON.stringify(body);
            const headers = {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Content-Length': Buffer.byteLength(data),
                'X-Cocos-Bridge-Version': '1',
            };
            if (options.authToken) headers.Authorization = 'Bearer ' + options.authToken;

            const req = http.request({
                hostname: u.hostname,
                port: u.port,
                path: u.pathname,
                method: 'POST',
                headers,
                timeout: timeoutMs,
            }, function (res) {
                const chunks = [];
                res.on('data', function (c) { chunks.push(c); });
                res.on('end', function () {
                    const raw = Buffer.concat(chunks).toString('utf-8');
                    if (res.statusCode < 200 || res.statusCode >= 300) {
                        reject(new Error('HTTP ' + res.statusCode + ' from Editor Bridge endpoint: ' + raw.slice(0, 160)));
                        return;
                    }
                    try { resolve(JSON.parse(raw)); }
                    catch (e) { reject(new Error('invalid json from ' + targetUrl + ': ' + raw.slice(0, 120))); }
                });
            });
            req.on('error', reject);
            req.on('timeout', function () { req.destroy(new Error('timeout after ' + timeoutMs + 'ms')); });
            req.write(data);
            req.end();
        } catch (e) { reject(e); }
    });
}

function toolTimeoutMs(name) {
    return /(?:asset_refresh|asset_reimport|preview_refresh_and_reload|scene_open_scene|scene_save_scene)$/.test(name || '')
        ? LONG_TOOL_TIMEOUT_MS
        : TOOL_TIMEOUT_MS;
}

module.exports = {
    PROBE_TIMEOUT_MS,
    TOOL_TIMEOUT_MS,
    LONG_TOOL_TIMEOUT_MS,
    isLoopbackUrl,
    isLoopbackBridgeUrl,
    isPidAlive,
    validateRegistryEntry,
    bridgeJsonRpc,
    toolTimeoutMs,
};
