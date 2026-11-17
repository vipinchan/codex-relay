import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const mobileRoot = join(import.meta.dirname, "../..");
const colorLiteral = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/giu;
const fixedPaletteReference = /\bColors\.(?:light|dark)\b/u;
const themeFiles = new Set([
  "src/constants/theme.ts",
  "src/constants/appearance.ts",
  "src/global.css",
]);
const ignoredSuffixes = [".test.ts", ".test.tsx", "-html.ts", "uniwind-types.d.ts"];

describe("appearance coverage", () => {
  it("keeps UI color literals in the centralized theme", () => {
    const offenders = sourceFiles(mobileRoot)
      .filter((file) => !themeFiles.has(file))
      .flatMap((file) => {
        const path = join(mobileRoot, file);
        return readFileSync(path, "utf8")
          .split("\n")
          .flatMap((line, index) =>
            line.match(colorLiteral) || line.match(fixedPaletteReference)
              ? [`${file}:${index + 1}: ${line.trim()}`]
              : [],
          );
      });

    expect(offenders).toEqual([]);
  });

  it("does not capture the active theme at module load", () => {
    const offenders = sourceFiles(mobileRoot)
      .filter((file) => !file.endsWith(".test.ts") && !file.endsWith(".test.tsx"))
      .flatMap((file) => {
        if (!/\.[jt]sx?$/u.test(file)) return [];
        const path = join(mobileRoot, file);
        const text = readFileSync(path, "utf8");
        if (!text.includes("currentTheme(")) return [];
        const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
        const declarations = source.statements
          .filter(ts.isVariableStatement)
          .flatMap((statement) =>
            statement.declarationList.declarations.flatMap((declaration) =>
              declaration.initializer ? activeThemeReads(declaration.initializer) : [],
            ),
          );
        return declarations.map(
          (read) => `${file}:${source.getLineAndCharacterOfPosition(read.getStart()).line + 1}`,
        );
      });

    expect(offenders).toEqual([]);
  });
});

function activeThemeReads(node: ts.Node): ts.CallExpression[] {
  if (ts.isFunctionLike(node)) return [];
  const reads =
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "currentTheme"
      ? [node]
      : [];
  return [...reads, ...node.getChildren().flatMap(activeThemeReads)];
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (!/\.(?:css|ts|tsx)$/u.test(entry.name)) return [];
    const file = relative(mobileRoot, path).replaceAll("\\", "/");
    return ignoredSuffixes.some((suffix) => file.endsWith(suffix)) ? [] : [file];
  });
}
