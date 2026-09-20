import { Server } from 'lucide-react'
import React from 'react'

import { t } from '../../../lang/helpers'
import { ApplyStatus, UseMcpToolArgs } from "../../../types/apply"

export default function UseMcpToolBlock({
	applyStatus,
	onApply,
	serverName,
	toolName,
	parameters,
	finish
}: {
	applyStatus: ApplyStatus
	onApply: (args: UseMcpToolArgs) => void
	serverName: string,
	toolName: string,
	parameters: Record<string, unknown>,
	finish: boolean
}) {

	React.useEffect(() => {
		if (finish && applyStatus === ApplyStatus.Idle) {
			onApply({
				type: 'use_mcp_tool',
				server_name: serverName,
				tool_name: toolName,
				parameters: parameters,
			})
		}
	}, [finish])

	return (
		<div
			className={`icf-chat-code-block has-filename`
			}
		>
			<div className={'icf-chat-code-block-header'}>
				<div className={'icf-chat-code-block-header-filename'}>
					<Server size={14} className="icf-chat-code-block-header-icon" />
					{t('mcpHub.useMcpToolFrom')}
					<span className="icf-mcp-tool-server-name">{serverName}</span>
				</div>
			</div>
			<div
				className="icf-reasoning-content-wrapper"
			>
				<div className="icf-mcp-tool-row">
					<div className="icf-mcp-tool-row-header">
						<div className="icf-mcp-tool-name-section">
							<span className="icf-mcp-tool-name">{toolName}</span>
						</div>
					</div>
					{t('mcpHub.parameters')}: <div className="icf-mcp-tool-parameters">
						<pre className="icf-json-pre"><code>{JSON.stringify(parameters, null, 2)}</code></pre>
					</div>
				</div>
			</div>
			<style>{`
				.icf-mcp-tool-row {
					padding: 12px;
					border-bottom: 1px solid var(--background-modifier-border);
					background-color: var(--background-primary);
					border-radius: var(--radius-s);
				}
				.icf-mcp-tool-row-header {
					display: flex;
					align-items: center;
					gap: 8px;
					margin-bottom: 8px;
				}
				.icf-mcp-tool-name {
					font-weight: 600;
					color: var(--text-normal);
					font-size: 14px;
				}
				.icf-mcp-tool-server-name {
					color: var(--text-accent);
					border-radius: 4px;
					margin-left: 4px;
					margin-right: 4px;
					font-weight: bold;
					font-size: 13px;
					display: inline-block;
				}
				.icf-mcp-tool-parameters {
					font-size: 14px;
					color: var(--text-muted);
					line-height: 1.4;
					margin: 8px 0 0 0;
				}
				.icf-json-pre {
					background: #282c34;
					color: #d4d4d4;
					border-radius: 4px;
					padding: 8px;
					font-size: 13px;
					overflow-x: auto;
					margin: 0;
				}
			`}</style>
		</div>
	)
} 
