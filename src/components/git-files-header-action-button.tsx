import {
	ArrowDownToLine,
	ArrowUpToLine,
	Check,
	Loader2,
} from "lucide-react";

import { Button } from "@/components/ui/button";

type GitFilesHeaderActionButtonProps = {
	action: GitBranchSyncAction;
	hasUpstream: boolean;
	ahead: number;
	behind: number;
	isPending?: boolean;
	onClick?: () => void;
	disabled?: boolean;
};

export function GitFilesHeaderActionButton({
	action,
	hasUpstream,
	ahead,
	behind,
	isPending = false,
	onClick,
	disabled = false,
}: GitFilesHeaderActionButtonProps) {
	const isInteractive = action !== "none" && !disabled;
	const label =
		action === "pull"
			? "Pull"
			: action === "push"
				? "Push"
				: hasUpstream
					? "Up to date"
					: "No upstream";
	const title =
		action === "pull"
			? `Pull ${behind} incoming commit${behind === 1 ? "" : "s"}`
			: action === "push"
				? `Push ${ahead} pending commit${ahead === 1 ? "" : "s"}`
				: label;
	const pendingLabel =
		action === "pull" ? "Pulling…" : action === "push" ? "Pushing…" : label;

	return (
		<Button
			type="button"
			size="sm"
			variant="ghost"
			disabled={!isInteractive}
			onClick={onClick}
			aria-label={label}
			title={title}
		>
			{isPending ? (
				<Loader2 data-icon="inline-start" className="animate-spin" />
			) : action === "pull" ? (
				<ArrowDownToLine data-icon="inline-start" />
			) : action === "push" ? (
				<ArrowUpToLine data-icon="inline-start" />
			) : (
				<Check data-icon="inline-start" />
			)}
			{isPending ? pendingLabel : label}
		</Button>
	);
}
