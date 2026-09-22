import { Notice } from "obsidian";

import EventListener from "../../../event-listener";
import { DocumentChanges } from "../../../render-plugin/document-changes-listener";
import Context from "../context-detection";

import State from "./state";
import { logger } from '../../../utils/logger'

class PredictingState extends State {
	private predictionPromise: Promise<void> | null = null;
	private isStillNeeded = true;
	private readonly prefix: string;
	private readonly suffix: string;

	constructor(context: EventListener, prefix: string, suffix: string) {
		super(context);
		this.prefix = prefix;
		this.suffix = suffix;
	}

	static createAndStartPredicting(
		context: EventListener,
		prefix: string,
		suffix: string
	): PredictingState {
		const predictingState = new PredictingState(context, prefix, suffix);
		predictingState.startPredicting();
		context.setContext(Context.getContext(prefix, suffix));
		return predictingState;
	}

	handleCancelKeyPressed(): boolean {
		this.cancelPrediction();
		return true;
	}

	async handleDocumentChange(
		documentChanges: DocumentChanges
	): Promise<void> {
		if (
			documentChanges.hasCursorMoved() ||
			documentChanges.hasUserTyped() ||
			documentChanges.hasUserDeleted() ||
			documentChanges.isTextAdded()
		) {
			this.cancelPrediction();
		}
	}

	private cancelPrediction(): void {
		this.isStillNeeded = false;
		this.context.transitionToIdleState();
	}

	startPredicting(): void {
		this.predictionPromise = this.predict();
	}

	private async predict(): Promise<void> {
		const result =
			await this.context.autocomplete?.fetchPredictions(
				this.prefix,
				this.suffix
			);

		if (!this.isStillNeeded) {
			return;
		}

		if (result.isErr()) {
			new Notice(
				`Copilot: Something went wrong cannot make a prediction. Full error is available in the dev console. Please check your settings. `
			);
			logger.error(result.error);
			this.context.transitionToIdleState();
		}

		const prediction = result.unwrapOr("");

		if (prediction === "") {
			this.context.transitionToIdleState();
			return;
		}
		this.context.transitionToSuggestingState(prediction, this.prefix, this.suffix);
	}


	getStatusBarText(): string {
		return `Predicting for ${this.context.context}`;
	}
}

export default PredictingState;
