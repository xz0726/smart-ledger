/**
 * 轻量测试运行器
 * 运行: node tests/run.mjs
 */
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];
let currentDescribe = '';

globalThis.__describe = function(name, fn) {
  currentDescribe = name;
  console.log(`\n📦 ${name}`);
  console.log('─'.repeat(60));
  fn();
};

globalThis.__test = function(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failedTests++;
    console.log(`  ❌ ${name}\n     ${e.message}`);
    failures.push({ describe: currentDescribe, name, error: e.message });
  }
};

globalThis.__assert = function(condition, message = 'assertion failed') {
  if (!condition) throw new Error(message);
};

globalThis.__assertEquals = function(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
};

console.log('🧪 SmartLedger 单元测试');
console.log('═'.repeat(60));

// 读取并执行测试文件
const files = readdirSync(__dirname).filter(f => f.endsWith('.test.mjs'));
for (const file of files.sort()) {
  console.log(`\n▶ 加载: ${file}`);
  const code = readFileSync(join(__dirname, file), 'utf-8');
  // 将 import 替换为全局函数引用
  const processed = code
    .replace(/import\s+\{[^}]*\}\s+from\s+['"]\.\/run\.mjs['"];?/g, '')
    .replace(/\bassert\(/g, '__assert(')
    .replace(/\bassertEquals\(/g, '__assertEquals(');

  const fn = new Function('describe', 'test', 'assert', 'assertEquals', processed);
  fn(__describe, __test, __assert, __assertEquals);
}

console.log('\n' + '═'.repeat(60));
console.log(`  📊 总计: ${totalTests}  |  ✅ 通过: ${passedTests}  |  ❌ 失败: ${failedTests}`);
console.log(`  通过率: ${totalTests > 0 ? (passedTests / totalTests * 100).toFixed(1) : '0'}%`);
console.log('═'.repeat(60));

if (failures.length > 0) {
  console.log('\n📋 失败详情:');
  failures.forEach(f => console.log(`  ❌ [${f.describe}] ${f.name}: ${f.error}`));
  process.exit(1);
} else {
  console.log('\n🎉 全部通过！');
}