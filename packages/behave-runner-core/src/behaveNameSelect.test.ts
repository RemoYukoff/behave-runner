import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { escapeBehaveNameSelect } from "./behaveNameSelect";

function matchesBehaveNameSelect(pattern: string, scenarioName: string): boolean {
  return new RegExp(pattern).test(scenarioName);
}

describe("escapeBehaveNameSelect", () => {
  it("escapes plus signs in scenario titles", () => {
    assert.equal(
      escapeBehaveNameSelect("Run A+ tier checkout"),
      "Run A\\+ tier checkout"
    );
  });

  it("escaped pattern matches titles containing a literal plus (regression)", () => {
    const title = "Run A+ tier checkout";
    assert.equal(matchesBehaveNameSelect(escapeBehaveNameSelect(title), title), true);
    assert.equal(matchesBehaveNameSelect(title, title), false);
  });

  it("escapes parentheses and dots in scenario titles", () => {
    const title = "Price check (100% off)";
    assert.equal(matchesBehaveNameSelect(escapeBehaveNameSelect(title), title), true);

    const dotted = "File config.json v2.0";
    assert.equal(matchesBehaveNameSelect(escapeBehaveNameSelect(dotted), dotted), true);
  });

  it("leaves plain scenario titles unchanged", () => {
    const title = "User can sign in";
    assert.equal(escapeBehaveNameSelect(title), title);
    assert.equal(matchesBehaveNameSelect(escapeBehaveNameSelect(title), title), true);
  });
});
