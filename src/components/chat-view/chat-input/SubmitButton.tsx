import { ArrowUpIcon } from 'lucide-react'

// import { t } from '../../../lang/helpers'

export function SubmitButton({ onClick }: { onClick: () => void }) {
	return (
		<>
			<button className="icf-chat-user-input-submit1-button" onClick={onClick}>
				{/* {t('chat.input.submit')} */}
				<div className="icf-chat-user-input-submit1-button-icons">
					<ArrowUpIcon size={14} />
				</div>
			</button>
			<style>
				{`
				.icf-chat-user-input-controls .icf-chat-user-input-submit1-button {
					display: flex;
					align-items: center;
					justify-content: center;
					gap: var(--size-4-1);
					font-size: var(--font-smallest);
					color: var(--text-on-accent);
					background-color: var(--interactive-accent);
					border: none;
					box-shadow: none;
					padding: 0;
					border-radius: 50%;
					width: var(--size-4-5);
					height: var(--size-4-5);
					cursor: pointer;
					transition: all 0.15s ease-in-out;

					&:hover {
						background-color: var(--interactive-accent-hover);
						transform: scale(1.05);
					}

					&:active {
						transform: scale(0.95);
					}

					.icf-chat-user-input-submit-button-icons {
						display: flex;
						align-items: center;
						justify-content: center;
					}
				}
				`}
			</style>
		</>

	)
}
