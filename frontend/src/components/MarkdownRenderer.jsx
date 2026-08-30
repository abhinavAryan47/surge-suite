import React from 'react';
import { marked } from 'marked';

export default function MarkdownRenderer({ text }) {
  if (!text) return null;

  // Parse markdown to HTML safely using marked
  const htmlContent = marked.parse(text, {
    gfm: true,
    breaks: true
  });

  return (
    <div className="markdown-container">
      <style>{`
        .markdown-content {
          line-height: 1.6;
          font-size: 14px;
          color: var(--text-primary);
        }
        .markdown-content p {
          margin: 0 0 12px 0;
        }
        .markdown-content p:last-child {
          margin-bottom: 0;
        }
        .markdown-content h1, 
        .markdown-content h2, 
        .markdown-content h3, 
        .markdown-content h4 {
          margin: 18px 0 8px 0;
          color: var(--text-primary);
          font-weight: 600;
        }
        .markdown-content h1 { font-size: 1.6em; border-bottom: 1px solid var(--border-light); padding-bottom: 4px; }
        .markdown-content h2 { font-size: 1.35em; }
        .markdown-content h3 { font-size: 1.15em; }
        .markdown-content ul, 
        .markdown-content ol {
          margin: 0 0 12px 0;
          padding-left: 20px;
        }
        .markdown-content li {
          margin-bottom: 4px;
        }
        .markdown-content blockquote {
          margin: 0 0 12px 0;
          padding: 8px 16px;
          border-left: 4px solid var(--border-medium);
          background-color: var(--bg-hover);
          color: var(--text-secondary);
          font-style: italic;
          border-radius: 0 4px 4px 0;
        }
        .markdown-content pre {
          margin: 0 0 12px 0;
          padding: 12px;
          background-color: var(--bg-input, #1e1e1e);
          color: var(--text-primary, #d4d4d4);
          border: 1px solid var(--border-medium);
          border-radius: 6px;
          overflow-x: auto;
          font-family: monospace;
          font-size: 13px;
        }
        .markdown-content code {
          padding: 2px 4px;
          background-color: var(--bg-hover);
          color: var(--status-error, #eab308);
          border-radius: 4px;
          font-family: monospace;
          font-size: 13px;
        }
        .markdown-content pre code {
          padding: 0;
          background-color: transparent;
          color: inherit;
          font-size: inherit;
        }
        .markdown-content table {
          width: 100%;
          border-collapse: collapse;
          margin: 0 0 16px 0;
          font-size: 13px;
        }
        .markdown-content th, 
        .markdown-content td {
          border: 1px solid var(--border-medium);
          padding: 8px 12px;
          text-align: left;
        }
        .markdown-content th {
          background-color: var(--bg-hover);
          font-weight: 600;
        }
        .markdown-content tr:nth-child(even) {
          background-color: rgba(0, 0, 0, 0.02);
        }
        .markdown-content a {
          color: var(--text-primary);
          text-decoration: underline;
        }
      `}</style>
      <div 
        className="markdown-content" 
        dangerouslySetInnerHTML={{ __html: htmlContent }} 
      />
    </div>
  );
}
