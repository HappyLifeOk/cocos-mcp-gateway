'use strict';

/**
 * protocol/content.js
 * MCP content block 封装工具
 *
 * MCP 规范定义了 4 种 content type：
 *   text      — 文本内容
 *   image     — 图片（base64 + mimeType）
 *   audio     — 音频（base64 + mimeType）
 *   resource  — 资源引用
 */

const MimeType = {
    JSON: 'application/json',
    TEXT: 'text/plain',
    HTML: 'text/html',
    PNG: 'image/png',
    JPG: 'image/jpeg',
    GIF: 'image/gif',
    WEBP: 'image/webp',
    MP3: 'audio/mpeg',
    WAV: 'audio/wav',
};

/**
 * 创建 text content block
 * @param {string} text
 * @param {string} [mimeType]
 * @returns {{ type: 'text', text: string, mimeType?: string }}
 */
function textContent(text, mimeType) {
    const block = { type: 'text', text: String(text) };
    if (mimeType) block.mimeType = mimeType;
    return block;
}

/**
 * 创建 error content block
 * @param {string} message
 * @returns {{ type: 'text', text: string }}
 */
function errorContent(message) {
    return textContent(`[Error] ${message}`);
}

/**
 * 创建 image content block
 * @param {string} data - base64 编码的图片数据（不含 data URI 前缀）
 * @param {string} [mimeType]
 * @param {number} [width]
 * @param {number} [height]
 * @returns {{ type: 'image', data: string, mimeType?: string, width?: number, height?: number }}
 */
function imageContent(data, mimeType = 'image/png', width, height) {
    const block = { type: 'image', data };
    if (mimeType) block.mimeType = mimeType;
    if (width) block.width = width;
    if (height) block.height = height;
    return block;
}

/**
 * 创建 audio content block
 * @param {string} data - base64 编码的音频数据
 * @param {string} [mimeType]
 * @returns {{ type: 'audio', data: string, mimeType?: string }}
 */
function audioContent(data, mimeType = 'audio/mpeg') {
    const block = { type: 'audio', data };
    if (mimeType) block.mimeType = mimeType;
    return block;
}

/**
 * 从本地文件路径创建 image content block
 * @param {string} filePath - 绝对路径
 * @param {string} [mimeType] - 自动推断如果未提供
 * @returns {Promise<{ type: 'image', data: string, mimeType: string }>}
 */
async function imageContentFromFile(filePath, mimeType) {
    const fs = require('fs');
    const path = require('path');

    const buffer = fs.readFileSync(filePath);
    const base64 = buffer.toString('base64');

    if (!mimeType) {
        const ext = path.extname(filePath).toLowerCase();
        const map = {
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.bmp': 'image/bmp',
        };
        mimeType = map[ext] || 'image/png';
    }

    return imageContent(base64, mimeType);
}

/**
 * 批量创建 text content blocks
 * @param {string[]} lines
 * @returns {Array}
 */
function textLinesContent(lines) {
    return lines.map(line => textContent(line));
}

module.exports = {
    MimeType,
    textContent,
    errorContent,
    imageContent,
    audioContent,
    imageContentFromFile,
    textLinesContent,
};