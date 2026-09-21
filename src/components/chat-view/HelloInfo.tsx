import { History, Lightbulb, Search } from 'lucide-react';
import React from 'react';

import { t } from '../../lang/helpers';

interface HelloInfoProps {
	onNavigate: (tab: 'commands' | 'custom-mode' | 'mcp' | 'search' | 'history' | 'insights') => void;
}

const HelloInfo: React.FC<HelloInfoProps> = ({ onNavigate }) => {
	const navigationItems = [
		{
			label: t('chat.navigation.history'),
			description: t('chat.navigation.historyDesc'),
			icon: <History size={20} />,
			action: () => onNavigate('history'),
		},
		{
			label: t('chat.navigation.search'),
			description: t('chat.navigation.searchDesc'),
			icon: <Search size={20} />,
			action: () => onNavigate('search'),
		},
		{
			label: t('chat.navigation.insights'),
			description: t('chat.navigation.insightsDesc'),
			icon: <Lightbulb size={20} />,
			action: () => onNavigate('insights'),
		},
		// {
		// 	label: t('chat.navigation.commands'),
		// 	description: t('chat.navigation.commandsDesc'),
		// 	icon: <SquareSlash size={20} />,
		// 	action: () => onNavigate('commands'),
		// },
		// {
		// 	label: t('chat.navigation.customMode'),
		// 	description: t('chat.navigation.customModeDesc'),
		// 	icon: <NotebookPen size={20} />,
		// 	action: () => onNavigate('custom-mode'),
		// },
		// {
		// 	label: t('chat.navigation.mcp'),
		// 	description: t('chat.navigation.mcpDesc'),
		// 	icon: <Server size={20} />,
		// 	action: () => onNavigate('mcp'),
		// }
	];

	return (
		<div className="icf-hello-info">
			{/* <div className="icf-hello-title">
				<h3>{t('chat.welcome.title')}</h3>
				<p>{t('chat.welcome.subtitle')}</p>
			</div> */}
			<div className="icf-navigation-cards">
				{navigationItems.map((item, index) => (
					<a
						key={index}
						className="icf-navigation-card"
						onClick={item.action}
					>
						<div className="icf-navigation-icon">
							{item.icon}
						</div>
						<div className="icf-navigation-content">
							<div className="icf-navigation-label">{item.label}</div>
							<div className="icf-navigation-description">{item.description}</div>
						</div>
					</a>
				))}
			</div>
			<style>
				{`
				/*
					* Hello Info and Navigation
					*/
					.icf-hello-info {
						display: flex;
						flex-direction: column;
						align-items: center;
						padding: var(--size-4-8) var(--size-4-4);
						gap: var(--size-4-6);
						text-align: center;
						margin: var(--size-4-4);
					}

					.icf-hello-title h3 {
						font-size: 2rem;
						font-weight: 600;
						color: var(--text-normal);
						margin: 0 0 var(--size-4-3) 0;
						text-align: center;
					}

					.icf-hello-title p {
						font-size: var(--font-ui-medium);
						color: var(--text-muted);
						margin: 0;
						line-height: var(--line-height-normal);
					}

					.icf-navigation-cards {
						display: flex;
						flex-direction: column;
						width: 100%;
						max-width: 480px;
					}

					.icf-navigation-card {
						display: flex;
						align-items: center;
						gap: var(--size-4-4);
						padding: var(--size-4-5) var(--size-4-6);
						cursor: pointer;
						text-align: left;
						width: 100%;
						box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
					}

					.icf-navigation-card:hover {
						background: var(--background-modifier-hover);
						border-color: var(--text-accent);
					}

					.icf-navigation-icon {
						display: flex;
						align-items: center;
						justify-content: center;
						border-radius: var(--radius-m);
						color: var(--text-accent);
						flex-shrink: 0;
					}

					.icf-navigation-content {
						display: flex;
						flex-direction: column;
						gap: var(--size-2-2);
						flex-grow: 1;
					}

					.icf-navigation-label {
						font-size: var(--font-ui-large);
						font-weight: 600;
						color: var(--text-normal);
						margin: 0;
					}

					.icf-navigation-description {
						font-size: var(--font-ui-small);
						color: var(--text-muted);
						margin: 0;
						line-height: 1.5;
					}

				`}
			</style>
		</div>
	);
};

export default HelloInfo;
