import { Check, FolderGit2, Loader2, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { GitBranchSwitcherButton } from "@/components/git-branch-switcher-button";
import { GitBranchSwitcherDialog } from "@/components/git-branch-switcher-dialog";
import { GitFilesHeaderActionButton } from "@/components/git-files-header-action-button";
import { GitPendingPushCommitsButton } from "@/components/git-pending-push-commits-button";
import { GitPendingPushCommitsDialog } from "@/components/git-pending-push-commits-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuGroup,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useGitStatus } from "@/hooks/use-git-status";
import { WORKING_TREE_CHANGED_EVENT } from "@/lib/git-status-context";
import { cn } from "@/lib/utils";

type FileActionKind = "stage" | "unstage" | "discard";

function notifyWorkingTreeChanged() {
	window.dispatchEvent(new CustomEvent(WORKING_TREE_CHANGED_EVENT));
}

function getFileGroup(filePath: string) {
	const parts = filePath.split("/");

	if (parts[0] === "services" && parts[1]) {
		return {
			key: `service:${parts[1]}`,
			label: parts[1],
			sortOrder: 0,
		};
	}

	return {
		key: "other",
		label: "Otros",
		sortOrder: 1,
	};
}

function truncateFromStart(value: string, maxLength: number) {
	if (value.length <= maxLength) {
		return value;
	}

	return `...${value.slice(-(maxLength - 3))}`;
}

function isFileStaged(file: GitWorkingTreeFile) {
	return file.indexStatus !== " " && file.indexStatus !== "?";
}

function isFileMixed(file: GitWorkingTreeFile) {
	return (
		isFileStaged(file) &&
		file.workingTreeStatus !== " " &&
		file.workingTreeStatus !== "?"
	);
}

function getStageActionKind(file: GitWorkingTreeFile): "stage" | "unstage" {
	return isFileStaged(file) && !isFileMixed(file) ? "unstage" : "stage";
}

function getWorkingTreeFileStatus(
	indexStatus: string,
	workingTreeStatus: string,
	previousPath: string | null,
): GitWorkingTreeFileStatus {
	if (indexStatus === "?" && workingTreeStatus === "?") {
		return "untracked";
	}

	if (indexStatus === "U" || workingTreeStatus === "U") {
		return "conflicted";
	}

	if (
		indexStatus === "R" ||
		workingTreeStatus === "R" ||
		indexStatus === "C" ||
		workingTreeStatus === "C" ||
		previousPath
	) {
		return indexStatus === "C" || workingTreeStatus === "C" ? "copied" : "renamed";
	}

	if (indexStatus === "A") {
		return "added";
	}

	if (indexStatus === "D" || workingTreeStatus === "D") {
		return "deleted";
	}

	if (indexStatus === "M" || workingTreeStatus === "M") {
		return "modified";
	}

	return "changed";
}

function getOptimisticStageStatuses(
	file: GitWorkingTreeFile,
	action: "stage" | "unstage",
) {
	if (action === "stage") {
		if (file.indexStatus === "?" && file.workingTreeStatus === "?") {
			return {
				indexStatus: "A",
				workingTreeStatus: " ",
			};
		}

		return {
			indexStatus:
				file.indexStatus !== " " && file.indexStatus !== "?"
					? file.indexStatus
					: file.workingTreeStatus,
			workingTreeStatus: " ",
		};
	}

	if (file.indexStatus === "A" && file.workingTreeStatus === " ") {
		return {
			indexStatus: "?",
			workingTreeStatus: "?",
		};
	}

	return {
		indexStatus: " ",
		workingTreeStatus: file.indexStatus,
	};
}

function applyOptimisticStageAction(
	currentSnapshot: GitWorkingTreeSnapshot | null,
	filePath: string,
	action: "stage" | "unstage",
) {
	if (!currentSnapshot) {
		return null;
	}

	return {
		...currentSnapshot,
		files: currentSnapshot.files.map((file) => {
			if (file.path !== filePath) {
				return file;
			}

			const nextStatuses = getOptimisticStageStatuses(file, action);

			return {
				...file,
				...nextStatuses,
				status: getWorkingTreeFileStatus(
					nextStatuses.indexStatus,
					nextStatuses.workingTreeStatus,
					file.previousPath,
				),
			};
		}),
	};
}

function applyPendingOptimisticStageActions(
	currentSnapshot: GitWorkingTreeSnapshot,
	pendingStageActions: Map<string, "stage" | "unstage">,
) {
	let nextSnapshot = currentSnapshot;

	for (const [filePath, action] of pendingStageActions) {
		const updatedSnapshot = applyOptimisticStageAction(nextSnapshot, filePath, action);
		if (updatedSnapshot) {
			nextSnapshot = updatedSnapshot;
		}
	}

	return nextSnapshot;
}

function getChangeBadgeConfig(status: GitWorkingTreeFileStatus) {
	switch (status) {
		case "deleted":
			return {
				label: "D",
				className:
					"bg-rose-500/15 text-rose-700 ring-1 ring-rose-500/20 dark:text-rose-300",
			};
		case "untracked":
		case "added":
		case "copied":
		case "renamed":
			return {
				label: "C",
				className:
					"bg-amber-400/20 text-amber-700 ring-1 ring-amber-400/30 dark:text-amber-300",
			};
		default:
			return {
				label: "M",
				className:
					"bg-sky-500/15 text-sky-700 ring-1 ring-sky-500/20 dark:text-sky-300",
			};
	}
}

function getDiffLineClassName(line: string) {
	if (line.startsWith("@@")) {
		return "bg-sky-500/10 text-sky-700 dark:text-sky-300";
	}

	if (line.startsWith("+")) {
		return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
	}

	if (line.startsWith("-")) {
		return "bg-rose-500/10 text-rose-700 dark:text-rose-300";
	}

	if (line.startsWith("new file mode")) {
		return "bg-muted/40 text-muted-foreground";
	}

	return "text-foreground";
}

function DiffViewer({ diff }: { diff: string }) {
	const lines =
		diff.length > 0
			? diff
					.split("\n")
					.filter(
						(line) =>
							!(
								line.startsWith("diff --git ") ||
								line.startsWith("index ") ||
								line.startsWith("--- ") ||
								line.startsWith("+++ ")
							),
					)
			: [];

	if (lines.length === 0) {
		return (
			<div className="flex min-h-0 flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
				No diff available for this file.
			</div>
		);
	}

	return (
		<ScrollArea className="min-h-0 flex-1">
			<div className="min-w-max px-4 pt-3 pb-4">
				<pre className="font-mono text-[12px] leading-5 whitespace-pre">
					{lines.map((line, index) => (
						<span
							key={`${index}:${line}`}
							className={cn(
								"block rounded-sm px-2",
								getDiffLineClassName(line),
							)}
						>
							{line || " "}
						</span>
					))}
				</pre>
			</div>
		</ScrollArea>
	);
}

function FileListItem({
	file,
	isActive,
	activeAction,
	isPendingDiscard,
	onSelect,
	onStage,
	onDiscard,
}: {
	file: GitWorkingTreeFile;
	isActive: boolean;
	activeAction: FileActionKind | null;
	isPendingDiscard: boolean;
	onSelect: (path: string) => void;
	onStage: (file: GitWorkingTreeFile) => void;
	onDiscard: (file: GitWorkingTreeFile) => void;
}) {
	const parts = file.path.split("/");
	const fileName = parts.at(-1) ?? file.path;
	const directory = parts.slice(0, -1).join("/");
	const isStaged = isFileStaged(file);
	const stageActionKind = getStageActionKind(file);
	const fileNameLabel = truncateFromStart(fileName, 34);
	const directoryLabel = truncateFromStart(directory || ".", 40);
	const changeBadge = getChangeBadgeConfig(file.status);

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<button
					type="button"
					onClick={() => onSelect(file.path)}
					onContextMenu={() => onSelect(file.path)}
					className={cn(
						"flex w-full flex-col gap-0 border-b px-4 py-2 text-left transition-colors last:border-b-0",
						isActive ? "bg-accent text-accent-foreground" : "hover:bg-muted/60",
					)}
				>
					<div className="min-w-0 flex-1">
						<div className="flex items-start justify-between gap-2">
							<span
								className="truncate text-[13px] font-medium"
								title={fileName}
							>
								{fileNameLabel}
							</span>
							<div className="flex min-w-6 shrink-0 flex-col items-end text-[11px] text-muted-foreground">
								<span className="block h-3" />
								{isStaged ? (
									<button
										type="button"
										onClick={(event) => {
											event.stopPropagation();
											onStage(file);
										}}
										className={cn(
											"relative flex size-5 items-center justify-center rounded-md font-mono text-[10px] font-semibold transition-opacity",
											"bg-green-400/20 text-green-700 ring-1 ring-green-400/30 dark:text-green-300",
											activeAction !== null && "cursor-not-allowed opacity-60",
										)}
										title="Unstage file"
										disabled={activeAction !== null}
									>
										<Check className="size-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
									</button>
								) : (
									<button
										type="button"
										onClick={(event) => {
											event.stopPropagation();
											onStage(file);
										}}
										className={cn(
											"relative flex size-5 items-center justify-center rounded-md font-mono text-[10px] font-semibold transition-opacity",
											changeBadge.className,
											activeAction !== null && "cursor-not-allowed opacity-60",
										)}
										title="Stage file"
										disabled={activeAction !== null}
									>
										{changeBadge.label}
									</button>
								)}
							</div>
						</div>
						<div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
							<span className="truncate" title={directory || "."}>
								{directoryLabel}
							</span>
						</div>
						{file.previousPath ? (
							<div className="truncate text-[11px] text-muted-foreground">
								from {file.previousPath}
							</div>
						) : null}
					</div>
				</button>
			</ContextMenuTrigger>
			<ContextMenuContent>
				<ContextMenuGroup>
					<ContextMenuItem
						disabled={activeAction !== null}
						onClick={() => onStage(file)}
					>
						{stageActionKind === "unstage" ? <X /> : <Check />}
						{activeAction === "stage"
							? "Staging…"
							: activeAction === "unstage"
								? "Unstaging…"
								: stageActionKind === "unstage"
									? "Unstage file"
									: "Stage file"}
					</ContextMenuItem>
					<ContextMenuItem
						variant="destructive"
						disabled={activeAction !== null}
						onSelect={(event) => {
							event.preventDefault();
							void onDiscard(file);
						}}
					>
						<Trash2 />
						{activeAction === "discard"
							? "Discarding…"
							: isPendingDiscard
								? "Confirm discard"
								: "Discard changes"}
					</ContextMenuItem>
				</ContextMenuGroup>
			</ContextMenuContent>
		</ContextMenu>
	);
}

export default function BranchPage() {
	const {
		snapshot: cachedSnapshot,
		isLoading: isGitStatusLoading,
		refreshSnapshot,
	} = useGitStatus();
	const [snapshot, setSnapshot] = useState<GitWorkingTreeSnapshot | null>(
		cachedSnapshot,
	);
	const [branches, setBranches] = useState<GitBranchRecord[]>([]);
	const [pendingPushCommits, setPendingPushCommits] = useState<
		GitPendingPushCommit[]
	>([]);
	const [selectedPath, setSelectedPath] = useState<string | null>(null);
	const [commitMessage, setCommitMessage] = useState("");
	const [gitOperationError, setGitOperationError] = useState<{
		title: string;
		description: string;
	} | null>(null);
	const [commitError, setCommitError] = useState<{
		title: string;
		description: string;
	} | null>(null);
	const [isBranchSwitcherOpen, setIsBranchSwitcherOpen] = useState(false);
	const [isPendingPushCommitsOpen, setIsPendingPushCommitsOpen] = useState(false);
	const [isLoading, setIsLoading] = useState(
		cachedSnapshot === null && isGitStatusLoading,
	);
	const [isLoadingBranches, setIsLoadingBranches] = useState(false);
	const [isLoadingPendingPushCommits, setIsLoadingPendingPushCommits] =
		useState(false);
	const [activeFileAction, setActiveFileAction] = useState<{
		path: string;
		kind: FileActionKind;
	} | null>(null);
	const [isCommitting, setIsCommitting] = useState(false);
	const [isRunningBranchAction, setIsRunningBranchAction] = useState(false);
	const [isSwitchingBranch, setIsSwitchingBranch] = useState(false);
	const [isGeneratingCommitMessage, setIsGeneratingCommitMessage] = useState(false);
	const [isOpeningFileInEditor, setIsOpeningFileInEditor] = useState(false);
	const [pendingDiscardPath, setPendingDiscardPath] = useState<string | null>(
		null,
	);
	const [error, setError] = useState<string | null>(null);
	const isRefreshingRef = useRef(false);
	const hasPendingRefreshRef = useRef(false);
	const pendingOptimisticStageActionsRef = useRef(
		new Map<string, "stage" | "unstage">(),
	);

	async function loadChanges(mode: "initial" | "refresh") {
		if (isRefreshingRef.current) {
			hasPendingRefreshRef.current = true;
			return;
		}

		isRefreshingRef.current = true;

		if (mode === "initial") {
			setIsLoading(true);
		}

	try {
			const nextSnapshot = await refreshSnapshot();
			const nextPendingOptimisticStageActions = new Map(
				pendingOptimisticStageActionsRef.current,
			);

			for (const [filePath, action] of pendingOptimisticStageActionsRef.current) {
				const nextFile = nextSnapshot.files.find((file) => file.path === filePath);

				if (!nextFile) {
					continue;
				}

				const expectedNextAction = action === "stage" ? "unstage" : "stage";
				if (getStageActionKind(nextFile) === expectedNextAction) {
					nextPendingOptimisticStageActions.delete(filePath);
				}
			}

			pendingOptimisticStageActionsRef.current = nextPendingOptimisticStageActions;
			setSnapshot(
				applyPendingOptimisticStageActions(
					nextSnapshot,
					nextPendingOptimisticStageActions,
				),
			);
			setError(null);
		} catch (loadError) {
			setError(
				loadError instanceof Error
					? loadError.message
					: "Could not load git changes.",
			);
		} finally {
			isRefreshingRef.current = false;
			setIsLoading(false);

			if (hasPendingRefreshRef.current) {
				hasPendingRefreshRef.current = false;
				void loadChanges("refresh");
			}
		}
	}

	async function loadBranches() {
		try {
			setIsLoadingBranches(true);
			const nextBranches = await window.desktop.listLocalBranches();
			setBranches(nextBranches);
		} catch (branchLoadError) {
			setGitOperationError({
				title: "Could not load branches",
				description:
					branchLoadError instanceof Error
						? branchLoadError.message
						: "Could not load git branches.",
			});
		} finally {
			setIsLoadingBranches(false);
		}
	}

	async function handleStageFile(file: GitWorkingTreeFile) {
		if (activeFileAction?.path === file.path) {
			return;
		}

		const nextAction = getStageActionKind(file);
		const optimisticSnapshot = applyOptimisticStageAction(
			snapshot,
			file.path,
			nextAction,
		);

		try {
			setPendingDiscardPath(null);
			setActiveFileAction({ path: file.path, kind: nextAction });
			pendingOptimisticStageActionsRef.current.set(file.path, nextAction);
			if (optimisticSnapshot) {
				setSnapshot(optimisticSnapshot);
			}
			if (nextAction === "unstage") {
				await window.desktop.unstageWorkingTreeFile(file.path);
			} else {
				await window.desktop.stageWorkingTreeFile(file.path);
			}
			await loadChanges("refresh");
			notifyWorkingTreeChanged();
		} catch (stageError) {
			pendingOptimisticStageActionsRef.current.delete(file.path);
			setError(
				stageError instanceof Error
					? stageError.message
					: nextAction === "unstage"
						? "Could not unstage file changes."
						: "Could not stage file changes.",
			);
			void loadChanges("refresh");
		} finally {
			setActiveFileAction(null);
		}
	}

	async function handleDiscardFile(file: GitWorkingTreeFile) {
		if (activeFileAction?.path === file.path) {
			return;
		}

		if (pendingDiscardPath !== file.path) {
			setPendingDiscardPath(file.path);
			return;
		}

		try {
			setActiveFileAction({ path: file.path, kind: "discard" });
			await window.desktop.discardWorkingTreeFile(file.path);
			setPendingDiscardPath(null);
			await loadChanges("refresh");
			notifyWorkingTreeChanged();
		} catch (discardError) {
			setError(
				discardError instanceof Error
					? discardError.message
					: "Could not discard file changes.",
			);
		} finally {
			setActiveFileAction(null);
		}
	}

	async function handleOpenSelectedFile() {
		if (!selectedFile || isOpeningFileInEditor) {
			return;
		}

		try {
			setIsOpeningFileInEditor(true);
			await window.desktop.openServicesFileInEditor(selectedFile.path);
		} catch (openError) {
			setError(
				openError instanceof Error
					? openError.message
					: "Could not open file in editor.",
			);
		} finally {
			setIsOpeningFileInEditor(false);
		}
	}

	async function handleCommit() {
		const nextCommitMessage = commitMessage.trim();

		if (!nextCommitMessage || isCommitting) {
			return;
		}

		try {
			setIsCommitting(true);
			setError(null);
			setCommitError(null);
			await window.desktop.commitWorkingTree(nextCommitMessage);
			setCommitMessage("");
			setPendingDiscardPath(null);
			await loadChanges("refresh");
			notifyWorkingTreeChanged();
		} catch (commitError) {
			setCommitError({
				title: "Commit failed",
				description:
					commitError instanceof Error
						? commitError.message
						: "Could not create commit.",
			});
		} finally {
			setIsCommitting(false);
		}
	}

	async function handlePrimaryBranchAction() {
		const currentAction = snapshot?.sync.action ?? "none";

		if (currentAction === "none" || isRunningBranchAction) {
			return;
		}

		try {
			setIsRunningBranchAction(true);
			setGitOperationError(null);
			await window.desktop.runPrimaryBranchAction();
			await loadChanges("refresh");
		} catch (branchActionError) {
			setGitOperationError({
				title:
					currentAction === "pull"
						? "Pull failed"
						: "Push failed",
				description:
					branchActionError instanceof Error
						? branchActionError.message
						: currentAction === "pull"
							? "Could not pull branch changes."
							: "Could not push branch changes.",
			});
		} finally {
			setIsRunningBranchAction(false);
		}
	}

	async function handleOpenBranchSwitcher() {
		setIsBranchSwitcherOpen(true);
		await loadBranches();
	}

	async function handleOpenPendingPushCommits() {
		if (isLoadingPendingPushCommits) {
			return;
		}

		try {
			setIsPendingPushCommitsOpen(true);
			setIsLoadingPendingPushCommits(true);
			setGitOperationError(null);
			const commits = await window.desktop.listPendingPushCommits();
			setPendingPushCommits(commits);
		} catch (commitsError) {
			setIsPendingPushCommitsOpen(false);
			setGitOperationError({
				title: "Could not load pending push commits",
				description:
					commitsError instanceof Error
						? commitsError.message
						: "Could not load pending push commits.",
			});
		} finally {
			setIsLoadingPendingPushCommits(false);
		}
	}

	async function handleSwitchBranch(branchName: string) {
		if (isSwitchingBranch) {
			return;
		}

		try {
			setIsSwitchingBranch(true);
			setGitOperationError(null);
			await window.desktop.switchBranch(branchName);
			setPendingDiscardPath(null);
			setSelectedPath(null);
			await Promise.all([loadChanges("refresh"), loadBranches()]);
			setIsBranchSwitcherOpen(false);
		} catch (switchError) {
			setGitOperationError({
				title: "Switch branch failed",
				description:
					switchError instanceof Error
						? switchError.message
						: "Could not switch branch.",
			});
		} finally {
			setIsSwitchingBranch(false);
		}
	}

	async function handleCreateBranch(branchName: string) {
		if (isSwitchingBranch) {
			return;
		}

		try {
			setIsSwitchingBranch(true);
			setGitOperationError(null);
			await window.desktop.createAndSwitchBranch(branchName);
			setPendingDiscardPath(null);
			setSelectedPath(null);
			await Promise.all([loadChanges("refresh"), loadBranches()]);
			setIsBranchSwitcherOpen(false);
		} catch (createError) {
			setGitOperationError({
				title: "Create branch failed",
				description:
					createError instanceof Error
						? createError.message
						: "Could not create and switch branch.",
			});
		} finally {
			setIsSwitchingBranch(false);
		}
	}

	async function handleGenerateCommitMessage() {
		if (isGeneratingCommitMessage || isCommitting) {
			return;
		}

		try {
			setIsGeneratingCommitMessage(true);
			setError(null);
			const result = await window.desktop.generateCommitMessage();
			setCommitMessage(result.message);
		} catch (generationError) {
			setError(
				generationError instanceof Error
					? generationError.message
					: "Could not generate commit message.",
			);
		} finally {
			setIsGeneratingCommitMessage(false);
		}
	}

	useEffect(() => {
		if (cachedSnapshot) {
			setSnapshot(
				applyPendingOptimisticStageActions(
					cachedSnapshot,
					pendingOptimisticStageActionsRef.current,
				),
			);
			setIsLoading(false);
			return;
		}

		if (!isGitStatusLoading) {
			void loadChanges("initial");
		}
	}, [cachedSnapshot, isGitStatusLoading]);

	useEffect(() => {
		setPendingDiscardPath(null);
	}, [selectedPath]);

	useEffect(() => {
		if (!snapshot) {
			return;
		}

		if (snapshot.files.length === 0) {
			if (selectedPath !== null) {
				setSelectedPath(null);
			}
			return;
		}

		const hasSelectedFile = selectedPath
			? snapshot.files.some((file) => file.path === selectedPath)
			: false;

		if (!hasSelectedFile) {
			setSelectedPath(snapshot.files[0].path);
		}
	}, [selectedPath, snapshot]);

	const selectedFile = snapshot
		? selectedPath
			? (snapshot.files.find((file) => file.path === selectedPath) ?? null)
			: (snapshot.files[0] ?? null)
		: null;
	const fileGroups = snapshot
		? Array.from(
				snapshot.files
					.reduce(
						(map, file) => {
							const group = getFileGroup(file.path);
							const existingGroup = map.get(group.key);

							if (existingGroup) {
								existingGroup.files.push(file);
								return map;
							}

							map.set(group.key, {
								key: group.key,
								label: group.label,
								sortOrder: group.sortOrder,
								files: [file],
							});

							return map;
						},
						new Map<
							string,
							{
								key: string;
								label: string;
								sortOrder: number;
								files: GitWorkingTreeFile[];
							}
						>(),
					)
					.values(),
			).sort((left, right) => {
				if (left.sortOrder !== right.sortOrder) {
					return left.sortOrder - right.sortOrder;
				}

				return left.label.localeCompare(right.label);
			})
		: [];
	const stagedFilesCount =
		snapshot?.files.filter((file) => isFileStaged(file)).length ?? 0;
	const branchSync = snapshot?.sync ?? {
		action: "none" as GitBranchSyncAction,
		ahead: 0,
		behind: 0,
		hasUpstream: false,
		upstream: null,
	};
	const hasCommitMessage = commitMessage.trim().length > 0;
	const isCommitComposerBusy = isCommitting || isGeneratingCommitMessage;
	const canSubmitCommitComposer =
		stagedFilesCount > 0 && !isCommitComposerBusy;

	return (
		<>
			<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
				<div className="flex min-h-0 flex-1 overflow-hidden bg-background">
					<div className="flex min-h-0 w-80 flex-col">
						<div className="flex items-center justify-between gap-3 px-4 py-3">
							<div className="flex min-w-0 items-center gap-2">
								<GitBranchSwitcherButton
									currentBranch={snapshot?.branch ?? null}
									onClick={() => void handleOpenBranchSwitcher()}
									disabled={
										isLoading ||
										isLoadingBranches ||
										isSwitchingBranch ||
										isRunningBranchAction
									}
								/>
								<Badge variant="secondary">
									{snapshot?.files.length ?? 0} file
									{snapshot?.files.length === 1 ? "" : "s"}
								</Badge>
							</div>
							<div className="flex items-center gap-1">
								{branchSync.hasUpstream && branchSync.ahead > 0 ? (
									<GitPendingPushCommitsButton
										count={branchSync.ahead}
										onClick={() => void handleOpenPendingPushCommits()}
										disabled={
											isLoading ||
											isLoadingPendingPushCommits ||
											isRunningBranchAction
										}
									/>
								) : null}
								<GitFilesHeaderActionButton
									action={branchSync.action}
									hasUpstream={branchSync.hasUpstream}
									ahead={branchSync.ahead}
									behind={branchSync.behind}
									isPending={isRunningBranchAction}
									disabled={isLoading || isRunningBranchAction}
									onClick={() => void handlePrimaryBranchAction()}
								/>
							</div>
						</div>
						<Separator />
						{isLoading ? (
							<div className="flex min-h-0 flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
								Loading git diff…
							</div>
						) : error ? (
							<div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center text-sm text-destructive">
								{error}
							</div>
						) : snapshot && snapshot.files.length > 0 ? (
							<ScrollArea className="min-h-0 flex-1">
								<div>
									{fileGroups.map((group) => (
										<div key={group.key}>
											<div className="flex items-center justify-between border-t border-b px-4 py-2 text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
												<span className="truncate">{group.label}</span>
												<span className="shrink-0 text-[10px]">
													{group.files.length}
												</span>
											</div>
											{group.files.map((file) => (
												<FileListItem
													key={file.path}
													file={file}
													isActive={selectedFile?.path === file.path}
													activeAction={
														activeFileAction?.path === file.path
															? activeFileAction.kind
															: null
													}
													isPendingDiscard={pendingDiscardPath === file.path}
													onSelect={setSelectedPath}
													onStage={handleStageFile}
													onDiscard={handleDiscardFile}
												/>
											))}
										</div>
									))}
								</div>
							</ScrollArea>
						) : (
							<div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
								Working tree is clean.
							</div>
						)}
						<Separator />
						<div className="shrink-0 p-3">
							<div className="flex flex-col gap-2">
								<Textarea
									value={commitMessage}
									onChange={(event) => setCommitMessage(event.target.value)}
									placeholder={
										isGeneratingCommitMessage
											? "Generating commit message…"
											: "Commit message"
									}
									className="min-h-16 resize-none"
									disabled={isCommitComposerBusy}
								/>
								<div className="flex items-center justify-between gap-2">
									<span className="text-xs text-muted-foreground">
										{stagedFilesCount} staged file
										{stagedFilesCount === 1 ? "" : "s"}
									</span>
									<Button
										type="button"
										size="sm"
										disabled={!canSubmitCommitComposer}
										onClick={() =>
											void (hasCommitMessage
												? handleCommit()
												: handleGenerateCommitMessage())
										}
									>
										{isGeneratingCommitMessage ? (
											<>
												<Loader2 data-icon="inline-start" className="animate-spin" />
												Generating…
											</>
										) : isCommitting ? (
											"Committing…"
										) : hasCommitMessage ? (
											"Commit"
										) : (
											"Generar"
										)}
									</Button>
								</div>
							</div>
						</div>
					</div>

					<Separator orientation="vertical" />

					<div className="flex min-h-0 min-w-0 flex-1 flex-col">
						<div className="flex items-center justify-between gap-3 px-4 py-3">
							<div className="min-w-0">
								<div className="flex min-w-0 items-center gap-2">
									<FolderGit2 className="size-4 shrink-0 text-muted-foreground" />
									<button
										type="button"
										className="truncate text-left text-sm font-medium hover:underline disabled:no-underline"
										disabled={!selectedFile || isOpeningFileInEditor}
										onClick={() => void handleOpenSelectedFile()}
										title={selectedFile?.path ?? "Diff"}
									>
										{selectedFile?.path ?? "Diff"}
									</button>
								</div>
								{selectedFile?.previousPath ? (
									<div className="truncate text-xs text-muted-foreground">
										renamed from {selectedFile.previousPath}
									</div>
								) : null}
							</div>
							{selectedFile ? (
								<div className="flex items-center gap-2">
									<Button
										type="button"
										size="sm"
										variant="destructive"
										disabled={activeFileAction !== null}
										onClick={() => void handleDiscardFile(selectedFile)}
									>
										<Trash2 data-icon="inline-start" />
										{activeFileAction?.path === selectedFile.path &&
										activeFileAction.kind === "discard"
											? "Discarding…"
											: pendingDiscardPath === selectedFile.path
												? "Confirm discard"
												: "Discard"}
									</Button>
									<Button
										type="button"
										size="sm"
										variant="outline"
										disabled={activeFileAction !== null}
										onClick={() => void handleStageFile(selectedFile)}
									>
										{getStageActionKind(selectedFile) === "unstage" ? (
											<X data-icon="inline-start" />
										) : (
											<Check data-icon="inline-start" />
										)}
										{activeFileAction?.path === selectedFile.path &&
										activeFileAction.kind === "stage"
											? "Staging…"
											: activeFileAction?.path === selectedFile.path &&
													activeFileAction.kind === "unstage"
												? "Unstaging…"
												: getStageActionKind(selectedFile) === "unstage"
													? "Unstage"
													: "Stage"}
									</Button>
								</div>
							) : null}
						</div>
						<Separator />
						{isLoading ? (
							<div className="flex min-h-0 flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
								Loading diff…
							</div>
						) : error ? (
							<div className="flex min-h-0 flex-1 items-center justify-center p-8 text-center text-sm text-destructive">
								{error}
							</div>
						) : selectedFile ? (
							<DiffViewer diff={selectedFile.diff} />
						) : (
							<div className="flex min-h-0 flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
								No uncommitted files.
							</div>
						)}
					</div>
				</div>
			</div>
			<Dialog
				open={commitError !== null}
				onOpenChange={(open) => {
					if (!open) {
						setCommitError(null);
					}
				}}
			>
				<DialogContent className="sm:max-w-4xl lg:max-w-5xl">
					<DialogHeader>
						<DialogTitle>{commitError?.title ?? "Commit failed"}</DialogTitle>
						<DialogDescription asChild>
							<div className="max-h-[70vh] overflow-y-auto whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
								{commitError?.description ?? "Unexpected commit error."}
							</div>
						</DialogDescription>
					</DialogHeader>
					<DialogFooter showCloseButton />
				</DialogContent>
			</Dialog>
			<Dialog
				open={gitOperationError !== null}
				onOpenChange={(open) => {
					if (!open) {
						setGitOperationError(null);
					}
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{gitOperationError?.title ?? "Git operation failed"}</DialogTitle>
						<DialogDescription asChild>
							<div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap break-words text-sm text-muted-foreground">
								{gitOperationError?.description ?? "Unexpected git error."}
							</div>
						</DialogDescription>
					</DialogHeader>
					<DialogFooter showCloseButton />
				</DialogContent>
			</Dialog>
			<GitBranchSwitcherDialog
				open={isBranchSwitcherOpen}
				onOpenChange={setIsBranchSwitcherOpen}
				currentBranch={snapshot?.branch ?? null}
				branches={branches}
				isPending={isLoadingBranches || isSwitchingBranch}
				onSwitchBranch={(branchName) => void handleSwitchBranch(branchName)}
				onCreateBranch={(branchName) => void handleCreateBranch(branchName)}
			/>
			<GitPendingPushCommitsDialog
				open={isPendingPushCommitsOpen}
				onOpenChange={setIsPendingPushCommitsOpen}
				commits={pendingPushCommits}
				isLoading={isLoadingPendingPushCommits}
			/>
		</>
	);
}
