import State from "./state";


class DisabledFileSpecificState extends State {
  getStatusBarText(): string {
    return "Disabled for this file";
  }

  handleSettingChanged() {
    if (!this.context.settings.autocompleteEnabled) {
      this.context.transitionToDisabledManualState();
    }
    if (!this.context.isCurrentFilePathIgnored() || !this.context.currentFileContainsIgnoredTag()) {
      this.context.transitionToIdleState();
    }
  }

  handleFileChange(): void {
    if (this.context.isCurrentFilePathIgnored() || this.context.currentFileContainsIgnoredTag()) {
      return;
    }

    if (this.context.settings.autocompleteEnabled) {
      this.context.transitionToIdleState();
    } else {
      this.context.transitionToDisabledManualState();
    }
  }
}

export default DisabledFileSpecificState;
