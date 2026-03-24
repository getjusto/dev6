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

	type GitWorkingTreeFileStatus =
		| "added"
		| "changed"
		| "conflicted"
		| "copied"
		| "deleted"
		| "modified"
		| "renamed"
		| "untracked";

	interface GitWorkingTreeFile {
		path: string;
		previousPath: string | null;
		indexStatus: string;
		workingTreeStatus: string;
		status: GitWorkingTreeFileStatus;
		additions: number;
		deletions: number;
		diff: string;
	}

	interface GitWorkingTreeSnapshot {
		branch: string | null;
		repositoryPath: string;
		additions: number;
		deletions: number;
		files: GitWorkingTreeFile[];
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
		getWorkingTreeChanges: () => Promise<GitWorkingTreeSnapshot>;
		stageWorkingTreeFile: (filePath: string) => Promise<{ ok: boolean }>;
		unstageWorkingTreeFile: (filePath: string) => Promise<{ ok: boolean }>;
		discardWorkingTreeFile: (filePath: string) => Promise<{ ok: boolean }>;
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
		openServicesInEditor: (
			editor?: "zed" | "vscode" | "cursor",
		) => Promise<{ ok: boolean }>;
		openServicesFileInEditor: (
			filePath: string,
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
