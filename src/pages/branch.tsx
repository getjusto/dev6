import { Check, FolderGit2, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuGroup,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const REFRESH_INTERVAL_MS = 5000;
type FileActionKind = "stage" | "unstage" | "discard";

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
									<span
										className={cn(
											"relative flex size-5 items-center justify-center rounded-md font-mono text-[10px] font-semibold",
											"bg-green-400/20 text-green-700 ring-1 ring-green-400/30 dark:text-green-300",
										)}
										title={file.status}
									>
										<Check className="size-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
									</span>
								) : (
									<span
										className={cn(
											"relative flex size-5 items-center justify-center rounded-md font-mono text-[10px] font-semibold",
											changeBadge.className,
										)}
										title={file.status}
									>
										{changeBadge.label}
									</span>
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
						<Check />
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
	const [snapshot, setSnapshot] = useState<GitWorkingTreeSnapshot | null>(null);
	const [selectedPath, setSelectedPath] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [activeFileAction, setActiveFileAction] = useState<{
		path: string;
		kind: FileActionKind;
	} | null>(null);
	const [isOpeningFileInEditor, setIsOpeningFileInEditor] = useState(false);
	const [pendingDiscardPath, setPendingDiscardPath] = useState<string | null>(
		null,
	);
	const [error, setError] = useState<string | null>(null);
	const isRefreshingRef = useRef(false);

	async function loadChanges(mode: "initial" | "refresh") {
		if (isRefreshingRef.current) {
			return;
		}

		isRefreshingRef.current = true;

		if (mode === "initial") {
			setIsLoading(true);
		}

		try {
			const nextSnapshot = await window.desktop.getWorkingTreeChanges();
			setSnapshot(nextSnapshot);
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
		}
	}

	async function handleStageFile(file: GitWorkingTreeFile) {
		if (activeFileAction?.path === file.path) {
			return;
		}

		const nextAction = getStageActionKind(file);

		try {
			setPendingDiscardPath(null);
			setActiveFileAction({ path: file.path, kind: nextAction });
			if (nextAction === "unstage") {
				await window.desktop.unstageWorkingTreeFile(file.path);
			} else {
				await window.desktop.stageWorkingTreeFile(file.path);
			}
			await loadChanges("refresh");
		} catch (stageError) {
			setError(
				stageError instanceof Error
					? stageError.message
					: nextAction === "unstage"
						? "Could not unstage file changes."
						: "Could not stage file changes.",
			);
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

	useEffect(() => {
		let cancelled = false;

		void loadChanges("initial");

		const intervalId = window.setInterval(() => {
			if (!cancelled) {
				void loadChanges("refresh");
			}
		}, REFRESH_INTERVAL_MS);

		return () => {
			cancelled = true;
			window.clearInterval(intervalId);
		};
	}, []);

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

	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
			<div className="flex min-h-0 flex-1 overflow-hidden bg-background">
				<div className="flex min-h-0 w-80 flex-col">
					<div className="flex items-center justify-between gap-3 px-4 py-3">
						<div className="flex min-w-0 items-center gap-2">
							<Badge variant="secondary">
								{snapshot?.files.length ?? 0} file
								{snapshot?.files.length === 1 ? "" : "s"}
							</Badge>
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
										<div className="flex items-center justify-between border-b px-4 py-2 text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
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
				</div>

				<Separator orientation="vertical" />

				<div className="flex min-h-0 min-w-0 flex-1 flex-col">
					<div className="flex items-center justify-between gap-3 px-4 py-3">
						<div className="min-w-0">
							<div className="flex items-center gap-2 min-w-0">
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
									<Check data-icon="inline-start" />
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
	);
}
