export const App = jest.fn()
export const Editor = jest.fn()
export const MarkdownView = jest.fn()
export const TFile = jest.fn()
export const TFolder = jest.fn()
export const Vault = jest.fn()
export const requestUrl = jest.fn()
export const htmlToMarkdown = jest.fn((html: string) => html)
// lang/helpers.ts resolves the active UI language through moment.locale();
// suites that exercise t() need a deterministic locale.
export const moment = {
	locale: jest.fn((): string => 'en'),
}
