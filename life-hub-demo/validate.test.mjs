import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const source = path.dirname(fileURLToPath(import.meta.url));

function fixture(t) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'life-os-validation-'));
  t.after(() => fs.rmSync(temporary, {recursive: true, force: true}));
  const root = path.join(temporary, 'dist');
  fs.cpSync(source, root, {recursive: true});
  return root;
}

function editManifest(root, change) {
  const filename = path.join(root, 'modules.json');
  const manifest = JSON.parse(fs.readFileSync(filename, 'utf8'));
  change(manifest);
  fs.writeFileSync(filename, JSON.stringify(manifest, null, 2) + '\n');
}

function validate(root) {
  const result = spawnSync(process.execPath, [path.join(root, 'validate.mjs'), root], {
    cwd: root,
    encoding: 'utf8',
    timeout: 15000,
  });
  assert.equal(result.error, undefined, `校验进程应能正常运行：${result.error?.message}`);
  assert.equal(result.signal, null, `校验进程不应被信号终止：${result.signal}`);
  return result;
}

function expectRejected(root, expected) {
  const result = validate(root);
  assert.notEqual(result.status, 0, '损坏的临时副本必须被拒绝');
  assert.match(result.stderr, expected, `应报告对应错误，实际为：${result.stderr}`);
}

test('完整发布目录通过真实校验', t => {
  const root = fixture(t);
  const result = validate(root);
  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.result, 'passed');
  assert.ok(summary.modules > 0);
  assert.ok(summary.independentPages > 0);
  assert.ok(summary.checkedLocalReferences > 0);
});

test('拒绝重复模块 ID', t => {
  const root = fixture(t);
  editManifest(root, manifest => manifest.modules.push({...manifest.modules[0]}));
  expectRejected(root, /重复模块 ID/);
});

test('拒绝缺失的 JS 模板图片 travel-art.svg', t => {
  const root = fixture(t);
  fs.unlinkSync(path.join(root, 'travel-art.svg'));
  expectRejected(root, /本地资源不存在[^\n]*travel-art\.svg/);
});

for (const href of [
  '../outside/index.html',
  './pages/../index.html',
  '/pages/reading/index.html',
  'https://example.com/index.html',
]) {
  test(`拒绝非法或越界静态页地址 ${href}`, t => {
    const root = fixture(t);
    editManifest(root, manifest => {
      const page = manifest.modules.find(module => module.type === 'page');
      assert.ok(page, '测试基线应包含独立页面');
      page.href = href;
    });
    expectRejected(root, /独立页必须为 \.\/pages\//);
  });
}

test('拒绝路径格式合法但文件不存在的静态页', t => {
  const root = fixture(t);
  editManifest(root, manifest => {
    manifest.modules.find(module => module.type === 'page').href = './pages/missing-test-fixture/index.html';
  });
  expectRejected(root, /页面不存在/);
});

for (const href of ['https://demo-user@example.com/', 'https://:demo-placeholder@example.com/']) {
  test(`拒绝含演示凭据的 HTTPS 地址 ${href}`, t => {
    const root = fixture(t);
    editManifest(root, manifest => {
      manifest.modules.push({
        id: 'credential-test',
        title: '校验测试链接',
        description: '仅存在于临时测试目录中的虚构输入',
        icon: 'external',
        color: '#6c5ce7',
        type: 'link',
        href,
        order: 110,
        group: 'extension',
        enabled: true,
      });
    });
    expectRejected(root, /不带凭据的 HTTPS URL/);
  });
}
