'use strict';
const { spawnSync } = require('child_process');
const projRoot = __dirname; // 本文件放在项目根，cwd 用 Node 原生 UTF-16，绕开中文路径 GBK 乱码
const r = spawnSync('node', [process.argv[2]], { cwd: projRoot, stdio: 'inherit' });
process.exit(r.status === null ? 1 : r.status);
