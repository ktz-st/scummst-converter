import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {message, translations, translateRuntime} from "../web/i18n.js";

test("every translated HTML marker exists in both languages", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const keys = [...html.matchAll(/data-i18n(?:-html|-aria-label)?="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(keys.length > 30);
  for (const key of keys) {
    assert.ok(translations.pl[key], `missing Polish ${key}`);
    assert.ok(translations.en[key], `missing English ${key}`);
  }
  assert.deepEqual(Object.keys(translations.en).sort(), Object.keys(translations.pl).sort());
});

test("form selectors exist and release modules share the cache version", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
  const worker = readFileSync(new URL("../web/worker.js", import.meta.url), "utf8");
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
  for (const match of app.matchAll(/(?:\$|files|file)\("([^"]+)"\)/g))
    assert.ok(ids.has(match[1]), `missing form element ${match[1]}`);
  const version = html.match(/app\.js\?v=([^" ]+)/)?.[1];
  assert.ok(version, "unversioned app.js could remain stale after a deploy");
  assert.ok(app.includes(`disc.js?v=${version}`));
  assert.ok(app.includes(`i18n.js?v=${version}`));
  assert.ok(app.includes(`worker.js?v=${version}`));
  assert.ok(worker.includes(`disc.js?v=${version}`));
});

test("English UI and conversion diagnostics include filenames", () => {
  assert.equal(message("en", "readyCount", {count: 7, size: "12 MB"}), "7 files in READY/ · 12 MB");
  assert.equal(translateRuntime("en", "CUE wskazuje plik disc.bin, a wybrano other.bin."),
    "CUE references disc.bin, but you selected other.bin.");
  assert.equal(translateRuntime("en", "Brak 00.LFL w katalogu ZAKENG."),
    "00.LFL is missing from ZAKENG.");
  assert.equal(translateRuntime("en", "Wczytano 14 plików źródłowych. Ładuję konwerter WebAssembly…"),
    "Loaded 14 source files. Loading WebAssembly converter…");
  assert.equal(translateRuntime("pl", "Niepoprawny czas w CUE."), "Niepoprawny czas w CUE.");
});
