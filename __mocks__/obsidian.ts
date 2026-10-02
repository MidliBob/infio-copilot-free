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
// SettingPage: abstract base of the declarative-settings sub-pages
// (obsidian 1.13+). Suites construct SectionPage subclasses and may call
// display()/hide(), so containerEl carries the Obsidian DOM extension
// empty() as an inert stub.
export class SettingPage {
	rootEl: HTMLElement = {} as HTMLElement
	titlebarEl: HTMLElement = {} as HTMLElement
	containerEl: HTMLElement = { empty: jest.fn() } as unknown as HTMLElement
	title = ''
	display(): void {}
	hide(): void {}
}
