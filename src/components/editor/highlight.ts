import { HighlightStyle } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

/**
 * Syntax colours for the text pane, as CSS variables so one style serves
 * both themes (values in styles/tokens.css). CodeMirror's built-in default
 * style hard-codes light-theme colours, which made keywords and code-fence
 * info strings near-invisible in dark mode.
 */
export const highlightStyle = HighlightStyle.define([
  // Markdown structure
  { tag: t.heading, color: 'var(--text)', fontWeight: '700' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.link, color: 'var(--syn-link)' },
  { tag: t.url, color: 'var(--syn-url)' },
  { tag: t.monospace, color: 'var(--syn-code)' },
  { tag: t.quote, color: 'var(--text-muted)' },
  // `#`, `**`, `>`, list bullets, fences: present but quiet.
  { tag: [t.processingInstruction, t.contentSeparator, t.list], color: 'var(--text-muted)' },
  { tag: t.meta, color: 'var(--text-muted)' },
  // Fenced code
  { tag: [t.keyword, t.operatorKeyword, t.modifier], color: 'var(--syn-keyword)' },
  { tag: [t.string, t.special(t.string), t.regexp], color: 'var(--syn-string)' },
  { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--syn-number)' },
  {
    tag: [t.comment, t.lineComment, t.blockComment],
    color: 'var(--syn-comment)',
    fontStyle: 'italic',
  },
  { tag: [t.typeName, t.className, t.namespace], color: 'var(--syn-type)' },
  { tag: [t.propertyName, t.attributeName], color: 'var(--syn-property)' },
  { tag: [t.function(t.variableName), t.definition(t.variableName)], color: 'var(--syn-function)' },
  { tag: [t.tagName, t.angleBracket], color: 'var(--syn-keyword)' },
  { tag: t.invalid, color: 'var(--danger)' },
]);
