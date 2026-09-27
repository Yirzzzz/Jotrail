/**
 * Rendered Markdown.
 *
 * `react-markdown` does not render raw HTML unless a plugin enables it, and no
 * such plugin is registered. Note content therefore cannot inject markup, which
 * matters because notes are the user's own text rendered back into the app's
 * own webview.
 */

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Links would navigate the whole webview away from the app.
          a: ({ children: content, href }) => (
            <a href={href} onClick={(event) => event.preventDefault()} title={href}>
              {content}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
