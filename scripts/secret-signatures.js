// Signature scan only; never print matching values. This exact, intentionally
// non-deployable example is the sole exception, including in Git history.
const examplePrefix = ["mongodb", "://APP_USER:URL_ENCODED_PASSWORD@"].join("");
const signatures = [
  ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["jwt", /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\b/],
  ["provider-key", /\b(?:sk-[A-Za-z0-9_-]{24,}|ghp_[A-Za-z0-9]{30,}|AKIA[A-Z0-9]{16})\b/],
  ["database-credentials", /mongodb(?:\+srv)?:\/\/[^\s/:]+:[^\s/@]+@/],
];
export function secretKinds(text) {
  const candidate = text.replaceAll(examplePrefix, "mongodb://EXAMPLE_WITHOUT_CREDENTIALS@");
  return signatures.filter(([, pattern]) => pattern.test(candidate)).map(([kind]) => kind);
}
