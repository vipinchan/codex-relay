import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, it } from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(new URL("../apps/mobile/package.json", import.meta.url));
const packagePath = require.resolve("react-native-enriched-markdown/package.json");
const parserDirectory = join(dirname(packagePath), "cpp", "md4c");
const temporaryDirectory = mkdtempSync(join(tmpdir(), "codex-relay-markdown-"));
const executable = join(temporaryDirectory, "markdown-parser");

before(() => {
  const build = spawnSync(
    process.env.CC || "cc",
    [
      "-std=c99",
      "-O2",
      "-I",
      parserDirectory,
      fileURLToPath(new URL("fixtures/markdown-parser.c", import.meta.url)),
      join(parserDirectory, "md4c.c"),
      "-o",
      executable,
    ],
    { encoding: "utf8" },
  );
  assert.equal(build.status, 0, build.error?.message || build.stderr);
});

after(() => rmSync(temporaryDirectory, { recursive: true, force: true }));

const cases = [
  ["**主线：**9月30日", "<strong>主线：</strong>9月30日"],
  ["**资金：**9月30日", "<strong>资金：</strong>9月30日"],
  ["**情绪：**脚本输出", "<strong>情绪：</strong>脚本输出"],
  ["**核心风险：**长假消息", "<strong>核心风险：</strong>长假消息"],
  ["**成交与宽度（9月30日）：**沪深成交", "<strong>成交与宽度（9月30日）：</strong>沪深成交"],
  ["这是**（重点）**内容", "这是<strong>（重点）</strong>内容"],
  ["**正常加粗**内容", "<strong>正常加粗</strong>内容"],
  ["**主线：** 9月30日", "<strong>主线：</strong> 9月30日"],
  ["**主线**：9月30日", "<strong>主线</strong>：9月30日"],
  ["**bold**text", "<strong>bold</strong>text"],
  ["**foo:**bar", "**foo:**bar"],
  ["a**“b”**c", "a**“b”**c"],
  ["`**主线：**9月`", "<code>**主线：**9月</code>"],
  ["\\*\\*主线：\\*\\*9月", "**主线：**9月"],
  ["**主线：", "**主线："],
  ["**主线：*", "*主线："],
  ["**主线： **9月", "**主线： **9月"],
  ["** 主线：**9月", "** 主线：**9月"],
  ["```md\n**主线：**9月\n```", "**主线：**9月\n"],
  ["[链接](https://example.com/**主线：**9月)", "链接"],
];

for (const [source, expected] of cases) {
  it(`parses ${JSON.stringify(source)}`, () => {
    const result = spawnSync(executable, [], { input: source, encoding: "utf8" });
    assert.equal(result.status, 0, result.error?.message || result.stderr);
    assert.equal(result.stdout, expected);
  });
}
