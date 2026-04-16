import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

const components: Components = {
  h1: ({ children }) => (
    <h1 className="font-serif text-2xl font-semibold text-foreground mb-4 mt-6 first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="font-serif text-xl font-semibold text-foreground mb-3 mt-6">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-lg font-medium text-foreground mb-2 mt-4">
      {children}
    </h3>
  ),
  p: ({ children }) => (
    <p className="text-[14px] text-muted-foreground leading-relaxed mb-3">
      {children}
    </p>
  ),
  a: ({ href, children }) => (
    <a href={href} className="text-primary hover:underline">
      {children}
    </a>
  ),
  ul: ({ children }) => (
    <ul className="list-disc list-inside text-[14px] text-muted-foreground leading-relaxed mb-3 space-y-1.5 pl-1">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal list-inside text-[14px] text-muted-foreground leading-relaxed mb-3 space-y-1.5 pl-1">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="text-muted-foreground">{children}</li>,
  code: ({ className, children }) => {
    const isBlock = className?.includes("language-");
    if (isBlock) {
      return <code className={`${className} text-[13px]`}>{children}</code>;
    }
    return (
      <code className="bg-muted text-foreground rounded px-1.5 py-0.5 text-[13px] font-mono">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="bg-muted text-muted-foreground rounded-lg p-4 mb-3 overflow-x-auto font-mono text-[13px]">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-primary pl-4 my-3 italic text-muted-foreground">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="border-border my-6" />,
  table: ({ children }) => (
    <div className="overflow-x-auto mb-4">
      <table className="w-full text-[13px] border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="border-b border-border">{children}</thead>
  ),
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => (
    <tr className="border-b border-border">{children}</tr>
  ),
  th: ({ children }) => (
    <th className="text-left font-medium text-foreground px-3 py-2 bg-muted">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="text-muted-foreground px-3 py-2">{children}</td>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
};

export function Markdown({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {content}
    </ReactMarkdown>
  );
}
