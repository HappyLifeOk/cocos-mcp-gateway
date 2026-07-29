'use strict';

/**
 * tool.js
 * Tool 定义辅助函数
 *
 * 提供链式 API 让 tool 定义更简洁
 */

/**
 * 创建一个 tool 定义
 * @param {string} name
 * @param {string} description
 * @param {object} inputSchema - JSON Schema
 * @param {function} handler - async (args) => result
 * @param {object} [options] - outputSchema / annotations / _meta
 * @returns {object}
 */
function defineTool(name, description, inputSchema, handler, options) {
    if (typeof inputSchema === 'function') {
        options = handler;
        handler = inputSchema;
        inputSchema = { type: 'object', properties: {} };
    }
    // 如果传入的是裸 properties 对象（无 type 字段），自动包成合法 JSON Schema
    if (inputSchema && typeof inputSchema === 'object' && !inputSchema.type) {
        inputSchema = { type: 'object', properties: inputSchema };
    }
    const def = {
        name,
        description,
        inputSchema: inputSchema || { type: 'object', properties: {} },
        handler,
    };
    if (options && options.outputSchema) def.outputSchema = options.outputSchema;
    if (options && options.annotations) def.annotations = options.annotations;
    if (options && options._meta) def._meta = options._meta;
    return def;
}

/**
 * 创建带描述的工具（可选参数版）
 */
function tool(name, description, inputSchema, handler, options) {
    return defineTool(name, description, inputSchema, handler, options);
}

/**
 * 创建无参数的 tool（只有 description + handler）
 */
function command(name, description, handler) {
    return defineTool(name, description, { type: 'object', properties: {} }, handler);
}

/**
 * 批量创建 tools
 * @param {...object} definitions
 * @returns {Array}
 */
function tools() {
    return Array.prototype.slice.call(arguments).filter(Boolean);
}

module.exports = {
    defineTool,
    tool,
    command,
    tools,
};
