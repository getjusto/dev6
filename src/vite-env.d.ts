/// <reference types="vite/client" />

declare global {
	interface AppInfo {
		appName: string;
		version: string;
		platform: string;
		arch: string;
		isPackaged: boolean;
	}

	interface UpdateStatus {
		status: string;
		detail?: string;
	}

	interface AppSettings {
		servicesPath?: string;
		preferredEditor?: "zed" | "vscode" | "cursor";
		[key: string]: unknown;
	}

	interface FolderValidation {
		valid: boolean;
		error?: string;
	}

	interface TerminalSessionSummary {
		id: string;
		title: string;
		terminalTitle: string | null;
		appKind: "terminal" | "codex" | "claude";
		appIconDataUrl: string | null;
		cwd: string;
		shell: string;
		createdAt: number;
		status: "running" | "exited";
		pid: number | null;
		exitCode: number | null;
		signal: number | null;
	}

	interface TerminalSessionSnapshot {
		sequence: number;
		buffer: string;
		session: TerminalSessionSummary;
	}

	interface TerminalSessionDataEvent {
		sessionId: string;
		sequence: number;
		data: string;
	}

	interface AgentThreadMessageItem {
		id: string;
		type: "message";
		role: "user" | "assistant" | "thought";
		text: string;
		attachments: AgentThreadImageAttachment[];
		createdAt: number;
	}

	interface AgentThreadImageAttachment {
		id: string;
		mimeType: string;
		dataUrl: string;
	}

	interface AgentPromptImageInput {
		mimeType: string;
		dataUrl: string;
	}

	interface AgentPromptInput {
		text: string;
		images: AgentPromptImageInput[];
	}

	interface AgentThreadToolCallItem {
		id: string;
		type: "tool_call";
		toolCallId: string;
		title: string;
		status: "pending" | "in_progress" | "completed" | "failed" | "unknown";
		kind: string | null;
		locations: string[];
		rawInput: string | null;
		rawOutput: string | null;
		contentSummary: string | null;
		updatedAt: number;
	}

	interface AgentThreadPlanItem {
		id: string;
		type: "plan";
		entries: Array<{
			content: string;
			priority: "high" | "medium" | "low";
			status: "pending" | "in_progress" | "completed";
		}>;
		updatedAt: number;
	}

	interface AgentThreadNoticeItem {
		id: string;
		type: "notice";
		level: "info" | "error";
		text: string;
		createdAt: number;
	}

	type AgentThreadItem =
		| AgentThreadMessageItem
		| AgentThreadToolCallItem
		| AgentThreadPlanItem
		| AgentThreadNoticeItem;

	interface AgentThreadPermissionRequest {
		toolCallId: string;
		title: string;
		kind: string | null;
		status: string | null;
		locations: string[];
		rawInput: string | null;
		options: Array<{
			optionId: string;
			name: string;
			kind: "allow_once" | "allow_always" | "reject_once" | "reject_always";
		}>;
	}

	interface AgentThreadAvailableCommand {
		name: string;
		description: string | null;
		inputHint: string | null;
	}

	interface AgentThread {
		id: string;
		title: string;
		sessionTitle: string | null;
		agentKind: "codex" | "claude";
		launchCommand: string;
		cwd: string;
		settings: {
			model: string | null;
			reasoningEffort: string | null;
			mode: string | null;
		};
		sessionId: string | null;
		createdAt: number;
		updatedAt: number;
		status:
			| "draft"
			| "connecting"
			| "ready"
			| "running"
			| "error"
			| "disconnected";
		errorMessage: string | null;
		agentName: string | null;
		agentVersion: string | null;
		availableCommands: AgentThreadAvailableCommand[];
		pendingPermission: AgentThreadPermissionRequest | null;
		items: AgentThreadItem[];
	}

	interface AgentThreadConfigOption {
		id: string;
		name: string;
		description: string | null;
		category: string | null;
		type: "select" | "boolean";
		currentValue: string | boolean;
		options: Array<{
			value: string;
			name: string;
			description: string | null;
			group: string | null;
			groupName: string | null;
		}>;
	}

	interface Dev5ServiceStatus {
		dir_name: string;
		service_name: string;
		port: number | null;
		status: "on" | "off" | "error" | "loadingOn" | "loadingOff";
		managed: boolean;
		pid: number | null;
		port_open: boolean;
		http_status_code: number | null;
		http_error: string | null;
	}

	interface DesktopApi {
		getAppInfo: () => Promise<AppInfo>;
		getUpdateStatus: () => Promise<UpdateStatus>;
		checkForUpdates: () => Promise<{ ok: boolean; skipped?: boolean }>;
		downloadUpdate: () => Promise<{ ok: boolean; skipped?: boolean }>;
		installUpdate: () => Promise<void>;
		onUpdateStatus: (callback: (payload: UpdateStatus) => void) => () => void;
		getSettings: () => Promise<AppSettings>;
		setSettings: (patch: Partial<AppSettings>) => Promise<void>;
		getServicesStatus: () => Promise<Dev5ServiceStatus[]>;
		startService: (serviceName: string) => Promise<unknown>;
		stopService: (serviceName: string) => Promise<unknown>;
		stopAllServices: () => Promise<unknown>;
		getServiceLogs: (
			serviceName: string,
			lineCount?: number,
		) => Promise<string>;
		getCurrentBranch: () => Promise<string | null>;
		listTerminalSessions: () => Promise<TerminalSessionSummary[]>;
		createTerminalSession: (options?: {
			cwd?: string;
		}) => Promise<TerminalSessionSummary>;
		closeTerminalSession: (sessionId: string) => Promise<{ ok: boolean }>;
		getTerminalSessionSnapshot: (
			sessionId: string,
		) => Promise<TerminalSessionSnapshot>;
		writeTerminalSession: (sessionId: string, data: string) => void;
		resizeTerminalSession: (
			sessionId: string,
			cols: number,
			rows: number,
		) => void;
		onTerminalSessionData: (
			callback: (payload: TerminalSessionDataEvent) => void,
		) => () => void;
		onTerminalSessionsChanged: (
			callback: (sessions: TerminalSessionSummary[]) => void,
		) => () => void;
		listAgentThreads: () => Promise<AgentThread[]>;
		listAgentOptions: (
			agentKind: "codex" | "claude",
		) => Promise<AgentThreadConfigOption[]>;
		createAgentThread: (
			agentKind: "codex" | "claude",
		) => Promise<AgentThread>;
		updateAgentThread: (
			threadId: string,
			patch: Partial<{
				title: string;
				settings: Partial<{
					model: string | null;
					reasoningEffort: string | null;
					mode: string | null;
				}>;
			}>,
		) => Promise<AgentThread>;
		deleteAgentThread: (threadId: string) => Promise<{ ok: boolean }>;
		connectAgentThread: (threadId: string) => Promise<AgentThread>;
		disconnectAgentThread: (threadId: string) => Promise<{ ok: boolean }>;
		sendAgentPrompt: (
			threadId: string,
			prompt: AgentPromptInput,
		) => Promise<AgentThread>;
		cancelAgentPrompt: (threadId: string) => Promise<{ ok: boolean }>;
		resolveAgentPermission: (
			threadId: string,
			optionId: string | null,
		) => Promise<{ ok: boolean }>;
		onAgentThreadsChanged: (
			callback: (threads: AgentThread[]) => void,
		) => () => void;
		openServicesInEditor: (
			editor?: "zed" | "vscode" | "cursor",
		) => Promise<{ ok: boolean }>;
		getEditorInfo: (
			editor?: "zed" | "vscode" | "cursor",
		) => Promise<{ label: string; iconDataUrl: string | null }>;
		getAvailableEditors: () => Promise<Array<"zed" | "vscode" | "cursor">>;
		selectFolder: () => Promise<string | null>;
		validateServicesFolder: (path: string) => Promise<FolderValidation>;
	}

	interface Window {
		desktop: DesktopApi;
	}
}

export {};
