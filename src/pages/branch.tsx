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
	isSelected,
	isFocused,
	activeAction,
	isPendingDiscard,
	onSelect,
	onStage,
	onDiscard,
}: {
	file: GitWorkingTreeFile;
	isSelected: boolean;
	isFocused: boolean;
	activeAction: FileActionKind | null;
	isPendingDiscard: boolean;
	onSelect: (path: string, event: React.MouseEvent) => void;
	onStage: (file: GitWorkingTreeFile) => void;
	onDiscard: (file: GitWorkingTreeFile) => void;
}) {
	const parts = file.path.split("/");
	const fileName = parts.at(-1) ?? file.path;
	const directory = parts.slice(0, -1).join("/");
	const isStaged = isFileStaged(file);
	const stageActionKind = getStageActionKind(file);
	const directoryLabel = truncateFromStart(directory || ".", 40);
	const changeBadge = getChangeBadgeConfig(file.status);

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<button
					type="button"
					onClick={(event) => onSelect(file.path, event)}
					onContextMenu={(event) => {
						if (!isSelected) {
							onSelect(file.path, event);
						}
					}}
					className={cn(
						"group flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left",
						isFocused
							? "bg-accent text-accent-foreground"
							: isSelected
								? "bg-muted/80"
								: "hover:bg-muted/60",
					)}
				>
					<button
						type="button"
						onClick={(event) => {
							event.stopPropagation();
							onStage(file);
						}}
						className={cn(
							"flex size-5 shrink-0 items-center justify-center rounded font-mono text-[10px] font-semibold",
							isStaged
								? "bg-emerald-500/15 text-emerald-600 ring-1 ring-emerald-500/25 dark:text-emerald-400"
								: changeBadge.className,
							activeAction !== null && "cursor-not-allowed opacity-60",
						)}
						title={isStaged ? "Unstage file" : "Stage file"}
						disabled={activeAction !== null}
					>
						{isStaged ? (
							<Check className="size-3 shrink-0" />
						) : (
							changeBadge.label
						)}
					</button>
					<div className="min-w-0 flex-1">
						<div className="flex items-baseline gap-2">
							<span
								className="truncate text-[12.5px] font-medium leading-5"
								title={fileName}
							>
								{fileName}
							</span>
							{(file.additions > 0 || file.deletions > 0) ? (
								<span className="shrink-0 font-mono text-[10px] leading-5 text-muted-foreground tabular-nums">
									{file.additions > 0 ? (
										<span className="text-emerald-600 dark:text-emerald-400">
											+{file.additions}
										</span>
									) : null}
									{file.additions > 0 && file.deletions > 0 ? " " : null}
									{file.deletions > 0 ? (
										<span className="text-rose-600 dark:text-rose-400">
											-{file.deletions}
										</span>
									) : null}
								</span>
							) : null}
						</div>
						<div className="truncate text-[11px] leading-4 text-muted-foreground" title={directory || "."}>
							{directoryLabel}
						</div>
						{file.previousPath ? (
							<div className="truncate text-[10px] leading-4 text-muted-foreground/70">
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
	const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
	const [focusedPath, setFocusedPath] = useState<string | null>(null);
	const lastClickedIndexRef = useRef<number | null>(null);
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
		if (!focusedFile || isOpeningFileInEditor) {
			return;
		}

		try {
			setIsOpeningFileInEditor(true);
			await window.desktop.openServicesFileInEditor(focusedFile.path);
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
			setSelectedPaths(new Set());
			setFocusedPath(null);
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
			setSelectedPaths(new Set());
			setFocusedPath(null);
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
	}, [focusedPath]);

	useEffect(() => {
		if (!snapshot) {
			return;
		}

		if (snapshot.files.length === 0) {
			if (focusedPath !== null) {
				setFocusedPath(null);
				setSelectedPaths(new Set());
			}
			return;
		}

		const validPaths = new Set(snapshot.files.map((file) => file.path));
		const nextSelected = new Set(
			[...selectedPaths].filter((path) => validPaths.has(path)),
		);

		const hasFocused = focusedPath ? validPaths.has(focusedPath) : false;

		if (!hasFocused) {
			const fallback = snapshot.files[0].path;
			setFocusedPath(fallback);
			if (nextSelected.size === 0) {
				nextSelected.add(fallback);
			}
		}

		if (nextSelected.size !== selectedPaths.size) {
			setSelectedPaths(nextSelected);
		}
	}, [focusedPath, selectedPaths, snapshot]);

	const focusedFile = snapshot
		? focusedPath
			? (snapshot.files.find((file) => file.path === focusedPath) ?? null)
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
	const flatFileList = fileGroups.flatMap((group) => group.files);
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
	const selectedFiles = flatFileList.filter((file) =>
		selectedPaths.has(file.path),
	);

	function handleFileSelect(path: string, event: React.MouseEvent) {
		const index = flatFileList.findIndex((file) => file.path === path);

		if (event.metaKey) {
			// Cmd+click: toggle individual file
			setSelectedPaths((prev) => {
				const next = new Set(prev);
				if (next.has(path)) {
					next.delete(path);
					// If we deselected the focused file, move focus to another selected file
					if (focusedPath === path) {
						const remaining = [...next];
						setFocusedPath(remaining.length > 0 ? remaining[remaining.length - 1] : null);
					}
				} else {
					next.add(path);
					setFocusedPath(path);
				}
				return next;
			});
			lastClickedIndexRef.current = index;
		} else if (event.shiftKey && lastClickedIndexRef.current !== null) {
			// Shift+click: range select
			const anchor = lastClickedIndexRef.current;
			const start = Math.min(anchor, index);
			const end = Math.max(anchor, index);
			const rangePaths = flatFileList
				.slice(start, end + 1)
				.map((file) => file.path);
			setSelectedPaths((prev) => {
				const next = new Set(prev);
				for (const rangePath of rangePaths) {
					next.add(rangePath);
				}
				return next;
			});
			setFocusedPath(path);
		} else {
			// Plain click: single select
			setSelectedPaths(new Set([path]));
			setFocusedPath(path);
			lastClickedIndexRef.current = index;
		}
		setPendingDiscardPath(null);
	}

	async function handleBulkStage() {
		if (activeFileAction !== null || selectedFiles.length === 0) {
			return;
		}

		for (const file of selectedFiles) {
			await handleStageFile(file);
		}
	}

	async function handleBulkDiscard() {
		if (activeFileAction !== null || selectedFiles.length === 0) {
			return;
		}

		for (const file of selectedFiles) {
			await handleDiscardFile(file);
		}
	}

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
								<div className="flex flex-col gap-1 p-2">
									{fileGroups.map((group) => (
										<div key={group.key}>
											<div className="flex items-center justify-between px-2.5 pt-2 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground">
												<span className="truncate">{group.label}</span>
												<span className="shrink-0 tabular-nums">
													{group.files.length}
												</span>
											</div>
											{group.files.map((file) => (
												<FileListItem
													key={file.path}
													file={file}
													isSelected={selectedPaths.has(file.path)}
													isFocused={focusedFile?.path === file.path}
													activeAction={
														activeFileAction?.path === file.path
															? activeFileAction.kind
															: null
													}
													isPendingDiscard={pendingDiscardPath === file.path}
													onSelect={handleFileSelect}
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
										disabled={!focusedFile || isOpeningFileInEditor}
										onClick={() => void handleOpenSelectedFile()}
										title={focusedFile?.path ?? "Diff"}
									>
										{focusedFile?.path ?? "Diff"}
									</button>
									{selectedPaths.size > 1 ? (
										<span className="shrink-0 text-xs text-muted-foreground tabular-nums">
											+{selectedPaths.size - 1}
										</span>
									) : null}
								</div>
								{focusedFile?.previousPath ? (
									<div className="truncate text-xs text-muted-foreground">
										renamed from {focusedFile.previousPath}
									</div>
								) : null}
							</div>
							{selectedFiles.length > 0 ? (
								<div className="flex items-center gap-2">
									<Button
										type="button"
										size="sm"
										variant="destructive"
										disabled={activeFileAction !== null}
										onClick={() =>
											void (selectedFiles.length > 1
												? handleBulkDiscard()
												: focusedFile && handleDiscardFile(focusedFile))
										}
									>
										<Trash2 data-icon="inline-start" />
										{activeFileAction?.kind === "discard"
											? "Discarding…"
											: pendingDiscardPath !== null
												? "Confirm discard"
												: selectedFiles.length > 1
													? `Discard (${selectedFiles.length})`
													: "Discard"}
									</Button>
									<Button
										type="button"
										size="sm"
										variant="outline"
										disabled={activeFileAction !== null}
										onClick={() =>
											void (selectedFiles.length > 1
												? handleBulkStage()
												: focusedFile && handleStageFile(focusedFile))
										}
									>
										<Check data-icon="inline-start" />
										{activeFileAction?.kind === "stage" ||
										activeFileAction?.kind === "unstage"
											? "Staging…"
											: selectedFiles.length > 1
												? `Stage (${selectedFiles.length})`
												: focusedFile &&
													  getStageActionKind(focusedFile) === "unstage"
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
						) : focusedFile ? (
							<DiffViewer diff={focusedFile.diff} />
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
