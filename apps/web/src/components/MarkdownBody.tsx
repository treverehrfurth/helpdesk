import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownBodyProps {
  source: string;
  className?: string;
}

export function MarkdownBody({ source, className }: MarkdownBodyProps) {
  const classes = className ? `markdown-body ${className}` : "markdown-body";
  return (
    <div className={classes}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          )
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
