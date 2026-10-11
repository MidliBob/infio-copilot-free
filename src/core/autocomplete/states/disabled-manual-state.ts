import State from "./state";

class DisabledManualState extends State {
  getStatusBarText(): string {
    return "Disabled";
  }

  handleSettingChanged(): void {
    if (this.context.settings.autocompleteEnabled) {
      this.context.transitionToIdleState();
    }
  }

  handleFileChange(): void { }
}

export default DisabledManualState;
