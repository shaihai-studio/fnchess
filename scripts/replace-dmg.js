const { execSync } = require('child_process');
module.exports = async function() {
  if (process.platform !== 'darwin') {
    console.log('⏭  跳过 Mac DMG 生成 (非 macOS 环境)');
    return;
  }
  console.log('🚀 正在生成 Mac DMG...');
  execSync('bash scripts/build-dmg.sh', { stdio: 'inherit' });
};