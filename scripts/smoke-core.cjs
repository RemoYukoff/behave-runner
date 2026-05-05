"use strict";

const { parseFeatureFile } = require("../packages/behave-runner-core/out/index.js");

const parsed = parseFeatureFile(
  "/tmp/example.feature",
  "Feature: Smoke\n  Scenario: One\n    Given a step\n    When another\n    Then last\n"
);
if (!parsed.name.includes("Smoke")) {
  throw new Error("expected feature name");
}
if (parsed.scenarios.length !== 1) {
  throw new Error("expected one scenario");
}
if (parsed.scenarios[0].steps.length !== 3) {
  throw new Error("expected three steps");
}
console.log("smoke-core: ok");
