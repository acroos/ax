"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

const components: Components = {
  h1: ({ children }) => (
    <h1 className="text-text-primary text-2xl font-semibold mb-4 mt-6 first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-text-primary text-xl font-semibold mb-3 mt-6">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-text-primary text-lg font-medium mb-2 mt-4">
      {children}
    </h3>
  ),
  p: ({ children }) => (
    <p className="text-text-secondary text-[14px] leading-relaxed mb-3">
      {children}
    </p>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      className="text-accent hover:underline"
    >
      {children}
    </a>
  ),
  ul: ({ children }) => (
    <ul className="list-disc list-inside text-text-secondary text-[14px] leading-relaxed mb-3 space-y-1.5 pl-1">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal list-inside text-text-secondary text-[14px] leading-relaxed mb-3 space-y-1.5 pl-1">
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li className="text-text-secondary">{children}</li>
  ),
  code: ({ className, children }) => {
    const isBlock = className?.includes("language-");
    if (isBlock) {
      return (
        <code className={`${className} text-[13px]`}>
          {children}
        </code>
      );
    }
    return (
      <code className="bg-surface-2 text-text-primary rounded px-1.5 py-0.5 text-[13px] font-mono">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="bg-surface-2 rounded-lg p-4 mb-3 overflow-x-auto font-mono text-[13px] text-text-secondary">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-accent pl-4 my-3 text-text-tertiary italic">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="border-border-subtle my-6" />,
  table: ({ children }) => (
    <div className="overflow-x-auto mb-4">
      <table className="w-full text-[13px] border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="border-b border-border-subtle">{children}</thead>
  ),
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => (
    <tr className="border-b border-border-subtle">{children}</tr>
  ),
  th: ({ children }) => (
    <th className="text-left text-text-primary font-medium px-3 py-2 bg-surface-1">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="text-text-secondary px-3 py-2">{children}</td>
  ),
  strong: ({ children }) => (
    <strong className="text-text-primary font-semibold">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="italic">{children}</em>
  ),
};

export function Markdown({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {content}
    </ReactMarkdown>
  );
}
