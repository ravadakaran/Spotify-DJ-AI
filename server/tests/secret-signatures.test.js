import { secretKinds } from "../../scripts/secret-signatures.js";
const uri = (scheme, user, password) => `${scheme}://${user}:${password}@example.invalid/demo`;
test("only the exact documented placeholder is excluded in current files and history", () => {
  const example = uri("mongodb", "APP_USER", "URL_ENCODED_PASSWORD");
  expect(secretKinds(`+MONGODB_URI=${example}`)).toEqual([]);
  expect(secretKinds(uri("mongodb", "APP_USER", "different-password"))).toContain("database-credentials");
  expect(secretKinds(uri("mongodb", "different-user", "URL_ENCODED_PASSWORD"))).toContain("database-credentials");
});
test("ordinary and SRV credential URIs remain detected beside placeholders", () => {
  const example = uri("mongodb", "APP_USER", "URL_ENCODED_PASSWORD");
  for (const scheme of ["mongodb", "mongodb+srv"])
    expect(secretKinds(example + "\n" + uri(scheme, "synthetic-user", "synthetic-password"))).toContain("database-credentials");
});
test("provider and private-key signatures are unaffected", () => {
  expect(secretKinds("ghp_" + "x".repeat(40))).toContain("provider-key");
  expect(secretKinds(["-----BEGIN ", "PRIVATE KEY-----"].join(""))).toContain("private-key");
});
