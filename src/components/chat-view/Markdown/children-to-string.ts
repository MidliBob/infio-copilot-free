import type { ReactNode } from 'react';

/**
 * Text-oriented stringification of React children (markdown/code blocks).
 *
 * `String(children)` on the ReactNode union trips no-base-to-string: the
 * element/object members would render '[object Object]'. In practice these
 * children are the text pieces ReactMarkdown feeds to `code` renderers - a
 * string or an array of strings. Strings and numbers pass through as
 * String() did; arrays concatenate WITHOUT separators (React renders text
 * arrays that way - the old String() joined the parts with ',', corrupting
 * multi-part code text); booleans/null/undefined and element-like values
 * degrade to '' (React renders them as nothing; the old String() gave
 * 'true'/'null'/'undefined'/'[object Object]').
 */
export function childrenToString(children: ReactNode): string {
	if (typeof children === 'string') {
		return children;
	}
	if (typeof children === 'number' || typeof children === 'bigint') {
		return String(children);
	}
	if (Array.isArray(children)) {
		return children.map(childrenToString).join('');
	}
	return '';
}
