export const CODE_LANGS = [
  "bash",
  "css",
  "diff",
  "graphql",
  "hcl",
  "html",
  "javascript",
  "json",
  "jsonc",
  "jsx",
  "markdown",
  "python",
  "sql",
  "toml",
  "tsx",
  "typescript",
  "yaml",
];

const ALIASES = {
  ts: "typescript",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  console: "bash",
  py: "python",
  yml: "yaml",
  md: "markdown",
  htm: "html",
  tf: "hcl",
  terraform: "hcl",
};

export function normalizeCodeLang(raw) {
  if (!raw) return null;
  const l = String(raw).toLowerCase().trim();
  const norm = ALIASES[l] || l;
  return CODE_LANGS.includes(norm) ? norm : null;
}
