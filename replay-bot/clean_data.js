#!/usr/bin/env node

/**
 * 数据清空工具 - 一键重置 Replay Bot 数据状态
 * 清理范围：data/, data_mixed/, signals/, mock_data/, logs/
 */

const fs = require('fs');
const path = require('path');

const CLEAN_PATHS = [
    { dir: 'data', label: 'data' },
    { dir: 'data_mixed', label: 'data_mixed' },
    { dir: 'signals', label: 'signals' }, // Will kill both signals, history, AND checkpoints
    { dir: 'mock_data', label: 'mock_data' },
    { dir: 'logs', label: 'logs' }
];

function cleanDirectory(dirName) {
    const dirPath = path.join(__dirname, dirName);

    if (!fs.existsSync(dirPath)) {
        console.log(`[Skip] 目录不存在: ${dirName}`);
        return;
    }

    console.log(`🧹 正在清理: ${dirName}/...`);

    const files = fs.readdirSync(dirPath);
    let count = 0;

    for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            // 递归删除子目录内容并删除子目录本身
            fs.rmSync(filePath, { recursive: true, force: true });
            count++;
        } else if (file !== '.gitignore' && file !== 'README.md') {
            // 删除文件，保留 .gitignore 和 README.md 以维持目录结构
            fs.unlinkSync(filePath);
            count++;
        }
    }

    console.log(`✅ 清理完成: ${dirName} (删除了 ${count} 个项目)`);
}

async function main() {
    console.log('🚀 开始一键清理所有生成数据...');
    console.log('-----------------------------------');

    CLEAN_PATHS.forEach(p => cleanDirectory(p.dir));

    console.log('-----------------------------------');
    console.log('✨ 所有动态生成的数据已清空，系统已重置为洁净状态。');
}

main().catch(err => {
    console.error('❌ 清理失败:', err.message);
    process.exit(1);
});
