'use strict';

/**
 * resource.js
 * Resource 定义辅助函数
 */

/**
 * 创建一个 resource 定义
 * @param {string} uri - 唯一标识符，如 "file://config" 或 "project://info"
 * @param {string} name - 显示名称
 * @param {string} description - 描述
 * @param {function} read - async () => string | object
 * @param {string} [mimeType] - MIME 类型，默认 text/plain
 * @returns {object}
 */
function defineResource(uri, name, description, read, mimeType) {
    return {
        uri,
        name,
        description: description || '',
        mimeType: mimeType || 'text/plain',
        read,
    };
}

/**
 * 创建一个只读的静态文本 resource
 * @param {string} uri
 * @param {string} name
 * @param {string} text
 * @param {string} [mimeType]
 */
function staticResource(uri, name, text, mimeType) {
    return defineResource(uri, name, '', async () => text, mimeType);
}

/**
 * 创建一个动态 resource（每次 read 调用传入的函数）
 * @param {string} uri
 * @param {string} name
 * @param {string} description
 * @param {function} readFn - async () => string | object
 * @param {string} [mimeType]
 */
function dynamicResource(uri, name, description, readFn, mimeType) {
    return defineResource(uri, name, description, readFn, mimeType);
}

/**
 * 批量创建 resources
 * @param {...object} definitions
 * @returns {Array}
 */
function resources() {
    return Array.prototype.slice.call(arguments).filter(Boolean);
}

module.exports = {
    defineResource,
    staticResource,
    dynamicResource,
    resources,
};