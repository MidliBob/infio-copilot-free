import {
	PropsWithChildren,
	createContext,
	useContext,
	useEffect,
	useMemo,
} from 'react'

import { McpHub } from '../core/mcp/McpHub'

export type McpHubContextType = {
	getMcpHub: () => Promise<McpHub | null>
}

const McpHubContext = createContext<McpHubContextType | null>(null)

export function McpHubProvider({
	getMcpHub,
	children,
}: PropsWithChildren<{ getMcpHub: () => Promise<McpHub | null> }>) {
	useEffect(() => {
		// start initialization of mcpHub in the background
		void getMcpHub()
	}, [getMcpHub])

	const value = useMemo(() => {
		return { getMcpHub }
	}, [getMcpHub])

	return <McpHubContext.Provider value={value}>{children}</McpHubContext.Provider>
}

export function useMcpHub() {
	const context = useContext(McpHubContext)
	if (!context) {
		throw new Error('useMcpHub must be used within a McpHubProvider')
	}
	return context
}
