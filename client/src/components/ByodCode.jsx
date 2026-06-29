import { CodeHighlighted, ShikiProvider } from "@cloudflare/kumo/code";

export default function ByodCode({ code }) {
  return (
    <ShikiProvider engine="javascript" languages={["javascript"]}>
      <CodeHighlighted code={code} lang="javascript" showLineNumbers showCopyButton className="em-byod-shiki" />
    </ShikiProvider>
  );
}
