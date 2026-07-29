'use strict';

/**
 * protocol/dispatcher.js
 * JSON-RPC 2.0 核心分发器 — 与传输层无关
 */

const { textContent, errorContent } = require('./content');

const DEFAULT_PROTOCOL_VERSION = '2025-03-26';

/**
 * 创建 MCP 分发器
 * @param {object} options
 * @param {string} options.name - 服务器名称
 * @param {string} options.version - 服务器版本
 * @param {Array}  options.tools - tool 定义列表
 * @param {Array}  options.resources - resource 定义列表
 * @param {object} [options.customHandlers] - 自定义方法处理器
 */
function createDispatcher(options) {
    const name = options.name || 'unknown';
    const version = options.version || '1.0.0';
    const protocolVersion = options.protocolVersion || DEFAULT_PROTOCOL_VERSION;
    const tools = options.tools || [];
    const resources = options.resources || [];
    const customHandlers = options.customHandlers || {};

    function toToolSchema(tool) {
        const schema = {
            name: tool.name,
            description: tool.description || '',
            inputSchema: tool.inputSchema || { type: 'object', properties: {} },
        };
        if (tool.outputSchema) schema.outputSchema = tool.outputSchema;
        if (tool.annotations) schema.annotations = tool.annotations;
        if (tool._meta) schema._meta = tool._meta;
        return schema;
    }

    function toResourceSchema(res) {
        return {
            uri: res.uri,
            name: res.name || res.uri,
            description: res.description || '',
            mimeType: res.mimeType || 'text/plain',
        };
    }

    function wrapContent(result) {
        if (result === undefined || result === null) return [textContent('(ok)')];
        if (typeof result === 'string') return [textContent(result)];
        if (Array.isArray(result) && result[0] && result[0].type) return result;
        if (result && result.type && result.text !== undefined) return [result];
        return [textContent(JSON.stringify(result, null, 2))];
    }

    function normalizeToolResult(result) {
        if (result && typeof result === 'object' && !Array.isArray(result)) {
            const out = {};
            if (result.content !== undefined) out.content = result.content;
            if (result.structuredContent !== undefined) out.structuredContent = result.structuredContent;
            if (result._meta !== undefined) out._meta = result._meta;
            if (result.isError !== undefined) out.isError = result.isError;
            if (Object.keys(out).length > 0) {
                if (!out.content) out.content = wrapContent(out.structuredContent || '(ok)');
                return out;
            }
        }
        return { content: wrapContent(result) };
    }

    function makeErrorResponse(id, message, code = -32603) {
        return { jsonrpc: '2.0', id: id || null, error: { code, message } };
    }

    function makeSuccessResponse(id, result) {
        if (id === undefined) return null; // notification
        return { jsonrpc: '2.0', id, result };
    }

    // ── 同步分发（用于不需要 await 的方法）────────────────────────
    function dispatch(req) {
        if (req.jsonrpc !== '2.0') {
            return makeErrorResponse(req.id, 'Invalid Request', -32600);
        }
        if (typeof req.method !== 'string') {
            return makeErrorResponse(req.id, 'Invalid Request', -32600);
        }

        const { method, params, id } = req;

        switch (method) {
            case 'initialize':
                return makeSuccessResponse(id, {
                    protocolVersion,
                    capabilities: {
                        tools: tools.length > 0 ? {} : undefined,
                        resources: resources.length > 0 ? {} : undefined,
                    },
                    serverInfo: { name, version },
                });

            case 'initialized':
            case 'notifications/initialized':
                return null; // notification

            case 'ping':
                return makeSuccessResponse(id, {});

            case 'tools/list':
                return makeSuccessResponse(id, {
                    tools: tools.map(t => toToolSchema(t)),
                });

            case 'resources/list':
                return makeSuccessResponse(id, {
                    resources: resources.map(r => toResourceSchema(r)),
                });

            default: {
                if (customHandlers[method]) {
                    try {
                        const result = customHandlers[method](params, { tools, resources, name, version });
                        return makeSuccessResponse(id, result);
                    } catch (e) {
                        return makeErrorResponse(id, e.message);
                    }
                }
                return makeErrorResponse(id, `Method not found: ${method}`, -32601);
            }
        }
    }

    // ── 异步分发（用于 tools/call 和 resources/read，需要 await handler）───
    async function dispatchAsync(req) {
        if (req.jsonrpc !== '2.0') {
            return makeErrorResponse(req.id, 'Invalid Request', -32600);
        }
        if (typeof req.method !== 'string') {
            return makeErrorResponse(req.id, 'Invalid Request', -32600);
        }

        const { method, params, id } = req;

        switch (method) {
            case 'tools/call': {
                if (!params || !params.name) {
                    return makeSuccessResponse(id, { content: [errorContent('Missing tool name')] });
                }
                const tool = tools.find(t => t.name === params.name);
                if (!tool) {
                    return makeSuccessResponse(id, { content: [errorContent(`Tool not found: ${params.name}`)] });
                }
                try {
                    const result = await tool.handler(params.arguments || {});
                    return makeSuccessResponse(id, normalizeToolResult(result));
                } catch (e) {
                    return makeSuccessResponse(id, {
                        content: [errorContent(`[${params.name}] Error: ${e.message}`)],
                        isError: true,
                    });
                }
            }

            case 'resources/read': {
                if (!params || !params.uri) {
                    return makeSuccessResponse(id, { contents: [errorContent('Missing resource uri')] });
                }
                const res = resources.find(r => r.uri === params.uri);
                if (!res) {
                    return makeSuccessResponse(id, { contents: [errorContent(`Resource not found: ${params.uri}`)] });
                }
                try {
                    const data = await res.read();
                    const mimeType = res.mimeType || 'text/plain';
                    const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
                    return makeSuccessResponse(id, { contents: [{ type: 'text', text, mimeType }] });
                } catch (e) {
                    return makeSuccessResponse(id, { contents: [errorContent(`[${params.uri}] Error: ${e.message}`)] });
                }
            }

            case 'initialized':
            case 'notifications/initialized':
                return null; // notification

            default:
                return dispatch(req);
        }
    }

    return { dispatch, dispatchAsync };
}

module.exports = { createDispatcher };
