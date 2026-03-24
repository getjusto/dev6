import { GitBranch, GitBranchPlus, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import {
	Command,
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from "@/components/ui/command";

function normalizeBranchName(value: string) {
	return value.trim();
}

type GitBranchSwitcherDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	currentBranch: string | null;
	branches: GitBranchRecord[];
	isPending?: boolean;
	onSwitchBranch: (branchName: string) => void;
	onCreateBranch: (branchName: string) => void;
};

export function GitBranchSwitcherDialog({
	open,
	onOpenChange,
	currentBranch,
	branches,
	isPending = false,
	onSwitchBranch,
	onCreateBranch,
}: GitBranchSwitcherDialogProps) {
	const [search, setSearch] = useState("");
	const normalizedSearch = normalizeBranchName(search);
	const matchingBranch = useMemo(
		() =>
			branches.find(
				(branch) =>
					branch.name.toLocaleLowerCase() === normalizedSearch.toLocaleLowerCase(),
			) ?? null,
		[branches, normalizedSearch],
	);
	const canCreateBranch =
		normalizedSearch.length > 0 &&
		matchingBranch === null &&
		!normalizedSearch.includes(" ");

	return (
		<CommandDialog
			open={open}
			onOpenChange={(nextOpen) => {
				onOpenChange(nextOpen);
				if (!nextOpen) {
					setSearch("");
				}
			}}
			title="Switch branch"
			description="Switch branches or create a new one."
			className="max-w-md"
			showCloseButton={false}
		>
			<Command shouldFilter>
				<div className="flex items-center justify-between border-b px-3 py-2">
					<div className="flex min-w-0 items-center gap-2">
						<GitBranch className="size-4 text-muted-foreground" />
						<div className="min-w-0">
							<div className="text-sm font-medium">Branches</div>
							<div className="truncate text-xs text-muted-foreground">
								{currentBranch ? `Current: ${currentBranch}` : "No branch selected"}
							</div>
						</div>
					</div>
					<Badge variant="secondary">{branches.length}</Badge>
				</div>
				<CommandInput
					placeholder="Search or type a branch name"
					value={search}
					onValueChange={setSearch}
				/>
				<CommandList>
					<CommandEmpty>
						{canCreateBranch
							? "Create this branch from the current HEAD."
							: "No matching branches."}
					</CommandEmpty>
					{canCreateBranch ? (
						<>
							<CommandGroup heading="Create">
								<CommandItem
									value={`create-${normalizedSearch}`}
									disabled={isPending}
									onSelect={() => onCreateBranch(normalizedSearch)}
								>
									{isPending ? (
										<Loader2 className="animate-spin" />
									) : (
										<GitBranchPlus />
									)}
									Create branch `{normalizedSearch}`
								</CommandItem>
							</CommandGroup>
							<CommandSeparator />
						</>
					) : null}
					<CommandGroup heading="Local branches">
						{branches.map((branch) => (
							<CommandItem
								key={branch.name}
								value={branch.name}
								data-checked={branch.current}
								disabled={isPending || branch.current}
								onSelect={() => onSwitchBranch(branch.name)}
							>
								<GitBranch />
								<span className="truncate">{branch.name}</span>
								{branch.current ? (
									<Badge variant="outline" className="ml-auto">
										Current
									</Badge>
								) : null}
							</CommandItem>
						))}
					</CommandGroup>
				</CommandList>
			</Command>
		</CommandDialog>
	);
}
