import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function Preview({ content }: { content: string }) {
  return (
    <article className="markdown">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Instruction previews must not fetch arbitrary remote images.
          img: ({ alt }) => (
            <span className="image-placeholder">
              [Image: {alt || "no description"}]
            </span>
          ),
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {content || "*This instruction file is empty.*"}
      </Markdown>
    </article>
  );
}
