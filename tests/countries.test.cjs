/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS harness for testing the shared TypeScript module. */
const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const filename = path.resolve(__dirname, "../src/lib/countries.ts");
const compiled = new Module(filename, module);
compiled.filename = filename;
compiled.paths = module.paths;
compiled._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText, filename);
const { countries, countryUrl, countrySettings } = compiled.exports;

test("every supplied market is selectable and produces a country route", () => {
  assert.equal(countries.length, 49);
  assert.equal(new Set(countries.map(c => c.code)).size, 49);
  for (const c of countries) {
    assert.equal(countryUrl("https://remarkable.com/", c.code), "https://remarkable.com/" + c.code.toLowerCase() + "/");
    const settings = countrySettings(c.code);
    assert.doesNotThrow(() => new Intl.DateTimeFormat(settings.locale, { timeZone: settings.timezone }));
  }
  assert.equal(countries.find(c => c.code === "IN").disableWebshop, true);
  assert.ok(countries.some(c => c.code === "IC"));
});
test("country changes replace the prefix and preserve page, query and fragment", () => {
  assert.equal(countryUrl("https://remarkable.com/ae/shop/paper?ref=test#specs", "GB"), "https://remarkable.com/gb/shop/paper?ref=test#specs");
  assert.equal(countryUrl("https://remarkable.com/de-DE/products/", "AE"), "https://remarkable.com/ae/products/");
  assert.equal(countryUrl("https://remarkable.com/products/", "gb"), "https://remarkable.com/gb/products/");
  assert.equal(countryUrl("https://remarkable.com/gb", "US"), "https://remarkable.com/us/");
  assert.equal(countryUrl("https://www.remarkable.com/gb/", "IC"), "https://www.remarkable.com/ic/");
});
test("unrelated domains remain unchanged; bad input is rejected", () => {
  for (const url of ["https://example.com/products/", "https://notremarkable.com/gb/"]) assert.equal(countryUrl(url, "AE"), url);
  for (const url of ["broken", "javascript:alert(1)", "ftp://remarkable.com"]) assert.throws(() => countryUrl(url, "GB"));
  assert.throws(() => countryUrl("https://remarkable.com", "ZZ"));
});

