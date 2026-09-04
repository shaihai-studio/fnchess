const { execSync } = require('child_process');

const platform = process.platform;
// macOS 上打包三平台，其他系统打包 win + linux
const targets = platform === 'darwin' ? '-mwl' : '-wl';
const platformNames = platform === 'darwin'
  ? 'macOS, Windows, Linux'
  : 'Windows, Linux';

console.log(`\n🔨 构建目标平台: ${platformNames}\n`);

try {
  execSync(`electron-builder ${targets}`, { stdio: 'inherit', cwd: process.cwd() });
} catch (e) {
  process.exit(1);
}
