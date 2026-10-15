import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { json } from "@codemirror/lang-json";
import { unifiedMergeView } from "@codemirror/merge";
import { EditorView } from "@codemirror/view";
import { useMemo } from "react";
import type { Format } from "../../shared/types";

/**
 * Colours come from tokens.css through `var()`, so the editor follows the
 * light/dark switch without rebuilding the extension on every theme change.
 */
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
