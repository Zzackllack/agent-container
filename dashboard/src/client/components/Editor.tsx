import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { json } from "@codemirror/lang-json";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { unifiedMergeView } from "@codemirror/merge";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { useMemo } from "react";
import type { Format } from "../../shared/types";

/**
 * Colours come from tokens.css through `var()`, so the editor follows the
 * light/dark switch without rebuilding the extension on every theme change.
 */
const highlight = syntaxHighlighting(
  HighlightStyle.define([
    {
      tag: [tags.keyword, tags.modifier, tags.operatorKeyword],
      color: "var(--code-keyword)",
    },
    {
      tag: [tags.string, tags.special(tags.string)],
      color: "var(--code-string)",
    },
    {
      tag: [tags.number, tags.bool, tags.null, tags.atom],
      color: "var(--code-number)",
    },
    {
      tag: [tags.propertyName, tags.attributeName, tags.labelName],
      color: "var(--code-property)",
    },
    {
      tag: [tags.function(tags.variableName), tags.typeName, tags.className],
      color: "var(--code-function)",
    },
    {
      tag: [tags.comment, tags.lineComment, tags.blockComment],
      color: "var(--code-comment)",
      fontStyle: "italic",
    },
    {
      tag: [tags.punctuation, tags.bracket, tags.separator],
      color: "var(--code-punctuation)",
    },
    {
      tag: [tags.heading, tags.heading1, tags.heading2, tags.heading3],
      color: "var(--code-heading)",
      fontWeight: "600",
    },
    {
      tag: [tags.link, tags.url],
      color: "var(--code-link)",
      textDecoration: "underline",
    },
    { tag: tags.strong, fontWeight: "600" },
    { tag: tags.emphasis, fontStyle: "italic" },
    { tag: tags.invalid, color: "var(--code-invalid)" },
  ]),
);

const theme = EditorView.theme({
  "&": {
    fontSize: "13px",
    backgroundColor: "var(--surface)",
    color: "var(--editor-ink)",
    height: "100%",
  },
  ".cm-scroller": {
    fontFamily: '"IBM Plex Mono", monospace',
    lineHeight: "1.8",
  },
  ".cm-content": { padding: "20px 0", caretColor: "var(--accent)" },
  ".cm-line": { paddingLeft: "20px", paddingRight: "20px" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--accent)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
    {
      backgroundColor: "var(--editor-selection)",
    },
  ".cm-gutters": {
    backgroundColor: "var(--editor-gutter)",
    color: "var(--text-faint)",
    border: "none",
  },
  ".cm-activeLine, .cm-activeLineGutter": {
    backgroundColor: "var(--editor-active)",
  },
  ".cm-placeholder": { color: "var(--text-faint)" },
  "&.cm-focused": { outline: "none" },
});
export default function Editor({
  content,
  original,
  format,
  readOnly,
  onChange,
}: {
  content: string;
  original?: string;
  format: Format;
  readOnly: boolean;
  onChange?: (value: string) => void;
}) {
  const extensions = useMemo(
    () => [
      theme,
      highlight,
      EditorView.lineWrapping,
      ...(format === "markdown"
        ? [markdown()]
        : format === "jsonc"
          ? [json()]
          : []),
      ...(original === undefined
        ? []
        : [unifiedMergeView({ original, mergeControls: false, gutter: true })]),
    ],
    [format, original],
  );
  return (
    <CodeMirror
      value={content}
      height="100%"
      extensions={extensions}
      // Without this the wrapper injects its own light theme after ours and the
      // editor stays white in dark mode.
      theme="none"
      editable={!readOnly}
      readOnly={readOnly}
      onChange={onChange}
      aria-label="Document editor"
      basicSetup={{
        foldGutter: false,
        highlightActiveLine: !readOnly,
        highlightActiveLineGutter: !readOnly,
      }}
    />
  );
}
