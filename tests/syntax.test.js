// أي ملف js فيه خطأ كتابة يوقّف الدمج قبل ما يوصل للموظفين
const test = require('node:test'), fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const dir = path.join(__dirname, '../js');
for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.js'))) {
  test('syntax: ' + f, () => { execFileSync(process.execPath, ['--check', path.join(dir, f)]); });
}
