import { MarkdownPostProcessorContext, Plugin } from "obsidian";
import React from "react";
import { createRoot } from "react-dom/client";

import { InlineEdit as InlineEditComponent } from "../../components/inline-edit/InlineEdit";
import { InfioSettings } from "../../types/settings";

export class InlineEdit {
  plugin: Plugin;
  settings: InfioSettings;

  constructor(plugin: Plugin, settings: InfioSettings) {
    this.plugin = plugin;
    this.settings = settings;
  }

  /**
   * Markdown 处理器入口函数
   */
  Processor(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
    const sec = ctx.getSectionInfo(el);
    if (!sec) return;

    const container = createDiv();
    const root = createRoot(container);

    root.render(
      React.createElement(InlineEditComponent, {
        source: source,
        secStartLine: sec.lineStart,
        secEndLine: sec.lineEnd,
        plugin: this.plugin,
        settings: this.settings
      })
    );

    // 移除父元素的代码块样式
    const parent = el.parentElement;
    if (parent) {
			parent.addClass("icf-ai-block");
    }
    el.replaceWith(container);
  }
}
