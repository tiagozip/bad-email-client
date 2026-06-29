import { ShikiProvider, useShikiHighlighter } from "@cloudflare/kumo/code";
import { useEffect } from "react";
import { CODE_LANGS, normalizeCodeLang } from "./codeLangs.js";

function detectLang(pre, code) {
  const haystack = `${code?.className || ""} ${pre?.className || ""} ${pre?.parentElement?.className || ""}`;
  const m = haystack.match(/(?:language|lang|highlight-source)-([\w+#.]+)/i);
  return normalizeCodeLang(m?.[1]);
}

function Enhancer({ rootRef, signal }) {
  const { highlight, isReady } = useShikiHighlighter();
  useEffect(() => {
    if (!isReady) return;
    const root = rootRef.current;
    if (!root) return;
    for (const pre of root.querySelectorAll("pre:not([data-hl])")) {
      pre.setAttribute("data-hl", "1");
      if (pre.classList.contains("shiki")) continue;
      const code = pre.querySelector("code") || pre;
      const lang = detectLang(pre, code);
      if (!lang) continue;
      let out;
      try {
        out = highlight(code.textContent || "", lang);
      } catch {
        out = null;
      }
      if (!out) continue;
      const tmp = document.createElement("div");
      tmp.innerHTML = out;
      const shiki = tmp.firstElementChild;
      if (shiki) {
        shiki.classList.add("em-shiki");
        pre.replaceWith(shiki);
      }
    }
  }, [isReady, signal, rootRef]);
  return null;
}

export default function CodeHighlight({ rootRef, signal }) {
  return (
    <ShikiProvider engine="javascript" languages={CODE_LANGS}>
      <Enhancer rootRef={rootRef} signal={signal} />
    </ShikiProvider>
  );
}
