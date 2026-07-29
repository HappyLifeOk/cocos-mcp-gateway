'use strict';

/**
 * transport/stdio.js
 * 标准输入/输出 传输层
 *
 * 用于 Claude Code / Cursor / 任何通过 stdin/stdout 通信的 MCP 客户端
 * 协议：每行一个 JSON-RPC 消息（换行符分隔）
 */

const EventEmitter = require('events');

function createStdioTransport(dispatcher) {
    const emitter = new EventEmitter();

    let initialized = false;
    let buffer = '';

    function start() {
        // 设置 stdin 为 utf-8
        process.stdin.setEncoding('utf-8');

        process.stdin.on('data', (chunk) => {
            buffer += chunk;

            // 按换行分割，JSON-RPC 消息以换行分隔
            const lines = buffer.split('\n');
            buffer = lines.pop(); // 未完整的一条留作 buffer

            for (const raw of lines) {
                const line = raw.trim();
                if (!line) continue;

                try {
                    const req = JSON.parse(line);
                    // notification（无 id）不等待响应
                    if (req.id === undefined) {
                        dispatcher.dispatchAsync(req).catch(err => {
                            // notification 错误不返回（无 id）
                            process.stderr.write(JSON.stringify({
                                jsonrpc: '2.0',
                                error: { code: -32603, message: `Internal error: ${err.message}` },
                            }) + '\n');
                        });
                        continue;
                    }

                    dispatcher.dispatchAsync(req).then((res) => {
                        if (res) {
                            process.stdout.write(JSON.stringify(res) + '\n');
                        }
                    }).catch((err) => {
                        process.stdout.write(JSON.stringify({
                            jsonrpc: '2.0',
                            id: req.id || null,
                            error: { code: -32603, message: `Internal error: ${err.message}` },
                        }) + '\n');
                    });

                } catch (e) {
                    // JSON 解析失败，发送错误响应
                    process.stdout.write(JSON.stringify({
                        jsonrpc: '2.0',
                        error: { code: -32700, message: 'Parse error' },
                        id: null,
                    }) + '\n');
                }
            }
        });

        process.stdin.on('end', () => {
            emitter.emit('end');
        });

        // 确保 unhandled rejection 不会静默吞掉
        process.on('uncaughtException', (err) => {
            process.stderr.write(`[stdio-transport] Uncaught exception: ${err.message}\n`);
            process.exit(1);
        });

        process.on('unhandledRejection', (reason) => {
            process.stderr.write(`[stdio-transport] Unhandled rejection: ${reason}\n`);
        });
    }

    return { start, emitter };
}

module.exports = { createStdioTransport };