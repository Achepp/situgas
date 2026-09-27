import React, { useMemo } from 'react';
import { ExternalLink } from 'lucide-react';

/**
 * Safely removes trailing punctuation attached to URLs in natural human text,
 * e.g. "Lihat https://example.com." -> URL: "https://example.com", Trailing: "."
 */
function cleanUrl(rawUrl: string): { url: string; trailing: string } {
  let url = rawUrl;
  let trailing = '';
  
  // Characters that shouldn't be at the end of a URL when typed naturally in sentences
  const trailingPunctuationRegex = /[.,;:!?)]$/;

  while (trailingPunctuationRegex.test(url)) {
    // If it's a closing parenthesis, only detach if parentheses inside the URL are unbalanced
    if (url.endsWith(')')) {
      const openCount = (url.match(/\(/g) || []).length;
      const closeCount = (url.match(/\)/g) || []).length;
      if (closeCount <= openCount) {
        // Balanced parenthesis within URL (e.g. Wikipedia URL)
        break;
      }
    }
    trailing = url.slice(-1) + trailing;
    url = url.slice(0, -1);
  }

  return { url, trailing };
}

/**
 * Strict validator to guarantee only http and https protocols are rendered as links.
 * Explicitly guards against dangerous schemes (javascript:, data:, vbscript:, etc.)
 */
function isValidHttpUrl(string: string): boolean {
  try {
    const parsed = new URL(string);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export interface TextToken {
  type: 'text' | 'url';
  value: string;
}

/**
 * Tokenizes a plain text string into an array of text chunks and validated URLs.
 */
export function tokenizeTextWithUrls(text: string): TextToken[] {
  if (!text) return [];

  // Match potential URLs starting with http:// or https://
  const urlRegex = /(https?:\/\/[^\s<>"'`]+)/g;
  const tokens: TextToken[] = [];
  
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = urlRegex.exec(text)) !== null) {
    const matchStart = match.index;
    const rawMatch = match[0];

    const pushText = (str: string) => {
      if (!str) return;
      const last = tokens[tokens.length - 1];
      if (last && last.type === 'text') {
        last.value += str;
      } else {
        tokens.push({ type: 'text', value: str });
      }
    };

    // Push preceding normal text chunk
    if (matchStart > lastIndex) {
      pushText(text.slice(lastIndex, matchStart));
    }

    // Clean trailing sentence punctuation if any
    const { url, trailing } = cleanUrl(rawMatch);

    if (isValidHttpUrl(url)) {
      tokens.push({
        type: 'url',
        value: url,
      });
      if (trailing) {
        pushText(trailing);
      }
    } else {
      // If parsing fails for any reason, treat as safe plain text
      pushText(rawMatch);
    }

    lastIndex = matchStart + rawMatch.length;
  }

  // Push any remaining text after the last URL
  if (lastIndex < text.length) {
    const last = tokens[tokens.length - 1];
    const remaining = text.slice(lastIndex);
    if (last && last.type === 'text') {
      last.value += remaining;
    } else {
      tokens.push({
        type: 'text',
        value: remaining,
      });
    }
  }

  return tokens;
}

export interface AutoLinkTextProps {
  text?: string | null;
  className?: string;
  linkClassName?: string;
  showIcon?: boolean;
}

/**
 * AutoLinkText Component
 * Renders plain text with auto-detected clickable URLs.
 * Preserves all whitespaces, newlines, blank lines, numbering, and indentation.
 * 100% safe against XSS (no dangerouslySetInnerHTML used).
 */
export const AutoLinkText: React.FC<AutoLinkTextProps> = ({
  text,
  className = '',
  linkClassName = '',
  showIcon = true,
}) => {
  const content = text || '';
  
  const tokens = useMemo(() => tokenizeTextWithUrls(content), [content]);

  if (!content) {
    return null;
  }

  return (
    <span className={className}>
      {tokens.map((token, index) => {
        if (token.type === 'url') {
          return (
            <a
              key={`link-${index}-${token.value.slice(0, 30)}`}
              href={token.value}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              title={`Buka tautan: ${token.value}`}
              className={
                linkClassName ||
                "inline-flex items-baseline gap-0.5 text-[#006a61] hover:text-[#004e47] font-semibold underline underline-offset-3 decoration-[#006a61]/40 hover:decoration-[#006a61] transition-colors duration-150 cursor-pointer break-all [overflow-wrap:anywhere]"
              }
            >
              <span>{token.value}</span>
              {showIcon && (
                <ExternalLink 
                  className="w-3.5 h-3.5 inline-block shrink-0 translate-y-0.5 ml-0.5 opacity-75 hover:opacity-100 transition-opacity" 
                  aria-hidden="true"
                />
              )}
            </a>
          );
        }

        return <React.Fragment key={`text-${index}`}>{token.value}</React.Fragment>;
      })}
    </span>
  );
};

export interface AssignmentDescriptionRendererProps {
  content?: string | null;
  fallbackText?: string;
  className?: string;
  linkClassName?: string;
  showIcon?: boolean;
}

/**
 * AssignmentDescriptionRenderer Component
 * Dedicated container component for rendering assignment descriptions and instructions.
 * - Preserves newlines (\n), blank lines, numbering (1., 2.), bullets (- , *), indentation
 * - Auto-detects URLs and converts them to safe clickable links with target="_blank"
 * - Prevents horizontal layout breakage with overflow-wrap: anywhere and word-break: break-word
 */
export const AssignmentDescriptionRenderer: React.FC<AssignmentDescriptionRendererProps> = ({
  content,
  fallbackText = 'Tidak ada deskripsi atau instruksi khusus untuk tugas ini.',
  className = '',
  linkClassName,
  showIcon = true,
}) => {
  const hasContent = Boolean(content && content.trim().length > 0);
  const displayText = hasContent ? content! : fallbackText;

  return (
    <div
      className={
        className ||
        "text-sm sm:text-[15px] text-slate-800 font-normal leading-[1.75] sm:leading-[1.8] font-sans whitespace-pre-wrap break-words [overflow-wrap:anywhere]"
      }
      style={{
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        overflowWrap: 'anywhere',
        lineHeight: 1.75,
      }}
    >
      {hasContent ? (
        <AutoLinkText
          text={displayText}
          linkClassName={linkClassName}
          showIcon={showIcon}
        />
      ) : (
        <span className="italic text-slate-400 font-normal">{displayText}</span>
      )}
    </div>
  );
};

export default AssignmentDescriptionRenderer;
