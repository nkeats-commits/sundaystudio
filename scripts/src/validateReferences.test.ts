import test from "node:test";
import assert from "node:assert/strict";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { validateReferenceCorpus } from "./validateReferences.js";

const DATA_ROOT = resolve(
  import.meta.dirname,
  "..",
  "..",
  "artifacts",
  "api-server",
  "data",
  "references",
);

function withFixture(mutator: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), "reference-validation-"));
  cpSync(DATA_ROOT, root, { recursive: true });
  try {
    mutator(root);
    validateReferenceCorpus(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function readRows(root: string, sourceId: string, file: string): unknown[] {
  return JSON.parse(readFileSync(join(root, sourceId, file), "utf8")) as unknown[];
}

function writeRows(root: string, sourceId: string, file: string, rows: unknown[]): void {
  writeFileSync(join(root, sourceId, file), `${JSON.stringify(rows)}\n`);
}

test("reference validation accepts the trusted generated corpora", () => {
  validateReferenceCorpus(DATA_ROOT);
});

test("reference validation rejects unexpected row counts", () => {
  assert.throws(
    () => withFixture((root) => {
      const rows = readRows(root, "kjv-1769", "passages.json");
      rows.pop();
      writeRows(root, "kjv-1769", "passages.json", rows);
    }),
    /expected 31102 rows, found 31101/,
  );
});

test("reference validation rejects duplicate keys", () => {
  assert.throws(
    () => withFixture((root) => {
      const rows = readRows(root, "kjv-1769", "passages.json");
      rows.push(rows[0]);
      writeRows(root, "kjv-1769", "passages.json", rows);
    }),
    /duplicate key genesis\|1\|1/,
  );
});

test("reference validation rejects malformed rows", () => {
  assert.throws(
    () => withFixture((root) => {
      const rows = readRows(root, "asv-1901", "passages.json") as Array<Record<string, unknown>>;
      rows[0].text = "";
      writeRows(root, "asv-1901", "passages.json", rows);
    }),
    /malformed translation row/,
  );
});

test("reference validation rejects duplicate lexical occurrence references", () => {
  assert.throws(
    () => withFixture((root) => {
      const rows = readRows(root, "strongs-1890", "entries.json") as Array<Record<string, unknown>>;
      const references = rows[0].references as string[];
      rows[0].references = [...references, references[0]];
      writeRows(root, "strongs-1890", "entries.json", rows);
    }),
    /references must be unique/,
  );
});

test("reference validation rejects changed gap allowlists", () => {
  assert.throws(
    () => withFixture((root) => {
      const path = join(root, "asv-1901", "MANIFEST.json");
      const manifest = JSON.parse(readFileSync(path, "utf8")) as {
        gapAllowlist: { count: number };
      };
      manifest.gapAllowlist.count -= 1;
      writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
    }),
    /gapAllowlist does not match the indexed corpus coverage/,
  );
});

test("reference validation rejects a changed generated checksum", () => {
  assert.throws(
    () => withFixture((root) => {
      const path = join(root, "eastons-1897", "entries.json");
      writeFileSync(path, `${readFileSync(path, "utf8")}\n`);
    }),
    /content checksum does not match the generated data/,
  );
});

assert.ok(existsSync(DATA_ROOT));