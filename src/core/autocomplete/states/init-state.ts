import { EventHandler } from "./types";

class InitState implements EventHandler {
  async handleDocumentChange(): Promise<void> { }

  handleSettingChanged(): void { }

  handleAcceptKeyPressed(): boolean {
    return false;
  }

  handlePartialAcceptKeyPressed(): boolean {
    return false;
  }

  handleCancelKeyPressed(): boolean {
    return false;
  }

  handlePredictCommand(): void { }

  handleAcceptCommand(): void { }

  getStatusBarText(): string {
    return "Initializing...";
  }

  handleFileChange(): void {

  }
}

export default InitState;
