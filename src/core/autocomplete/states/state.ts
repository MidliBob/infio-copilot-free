import { Notice, TFile } from "obsidian";

import EventListener from "../../../event-listener";
import { DocumentChanges } from "../../../render-plugin/document-changes-listener";
// import { Settings } from "../settings/versions";
import { InfioSettings } from "../../../types/settings";
import { checkForErrors } from "../../../utils/auto-complete";

import { EventHandler } from "./types";

abstract class State implements EventHandler {
  protected readonly context: EventListener;

  constructor(context: EventListener) {
    this.context = context;
  }

  handleSettingChanged(settings: InfioSettings): void {
		const settingErrors = checkForErrors(settings);
    if (!settings.autocompleteEnabled) {
      new Notice("Copilot is now disabled.");
      this.context.transitionToDisabledManualState()
    } else if (settingErrors.size > 0) {
      new Notice(
        `Copilot: There are ${String(settingErrors.size)} errors in your settings. The plugin will be disabled until they are fixed.`
      );
      this.context.transitionToDisabledInvalidSettingsState();
    } else if (this.context.isCurrentFilePathIgnored() || this.context.currentFileContainsIgnoredTag()) {
      this.context.transitionToDisabledFileSpecificState();
    }
  }

  async handleDocumentChange(
    documentChanges: DocumentChanges
  ): Promise<void> {
  }

  handleAcceptKeyPressed(): boolean {
    return false;
  }

  handlePartialAcceptKeyPressed(): boolean {
    return false;
  }

  handleCancelKeyPressed(): boolean {
    return false;
  }

  handlePredictCommand(prefix: string, suffix: string): void {
  }

  handleAcceptCommand(): void {
  }

  abstract getStatusBarText(): string;

  handleFileChange(file: TFile): void {
    if (this.context.isCurrentFilePathIgnored() || this.context.currentFileContainsIgnoredTag()) {
      this.context.transitionToDisabledFileSpecificState();
    } else if (this.context.isDisabled()) {
      this.context.transitionToIdleState();
    }
  }
}

export default State;
