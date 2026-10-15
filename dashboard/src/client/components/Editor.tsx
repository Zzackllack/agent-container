import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { json } from "@codemirror/lang-json";
import { unifiedMergeView } from "@codemirror/merge";
import { EditorView } from "@codemirror/view";
import { useMemo } from "react";
import type { Format } from "../../shared/types";

const theme = EditorView.theme({
  "&": { fontSize: "13px", backgroundColor: "#fff", height: "100%" },
  ".cm-scroller": {
    fontFamily: '"IBM Plex Mono", monospace',
    lineHeight: "1.8",
  },
  ".cm-content": { padding: "20px 0" },
  ".cm-line": { paddingLeft: "20px", paddingRight: "20px" },
  ".cm-gutters": {
    backgroundColor: "#f8fafc",
    color: "#8b98ad",
    border: "none",
  },
  ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "#f1f5fc" },
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
