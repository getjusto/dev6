import { GitCommit, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

function formatCommitDate(value: string) {
	const date = new Date(value);

	if (Number.isNaN(date.getTime())) {
		return value;
	}

	return new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	}).format(date);
}

type GitPendingPushCommitsDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	commits: GitPendingPushCommit[];
	isLoading?: boolean;
};

export function GitPendingPushCommitsDialog({
	open,
	onOpenChange,
	commits,
	isLoading = false,
}: GitPendingPushCommitsDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				showCloseButton={false}
				className="max-w-4xl overflow-hidden"
			>
				<DialogHeader>
					<DialogTitle>Pending push commits</DialogTitle>
					<DialogDescription>
						Commits that are in your local branch but not yet on the upstream.
					</DialogDescription>
				</DialogHeader>
				<Separator />
				{isLoading ? (
					<div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
						<Loader2 className="mr-2 animate-spin" />
						Loading commits…
					</div>
				) : commits.length > 0 ? (
					<ScrollArea className="max-h-[55vh] w-full">
						<div className="flex flex-col">
							{commits.map((commit, index) => (
								<div key={commit.hash}>
									<div className="flex min-w-0 items-start gap-3 py-3">
										<div className="mt-0.5 rounded-md bg-muted p-2 text-muted-foreground">
											<GitCommit className="size-4" />
										</div>
										<div className="min-w-0 flex-1">
											<div className="text-sm font-medium leading-5">
												{commit.subject}
											</div>
											<div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
												<Badge variant="outline">{commit.shortHash}</Badge>
												<span>{commit.authorName}</span>
												<span>{formatCommitDate(commit.committedAt)}</span>
											</div>
										</div>
									</div>
									{index < commits.length - 1 ? <Separator /> : null}
								</div>
							))}
						</div>
					</ScrollArea>
				) : (
					<div className="py-10 text-center text-sm text-muted-foreground">
						No commits pending push.
					</div>
				)}
				<div className="mt-2 flex w-full justify-end border-t pt-3">
					<DialogClose asChild>
						<Button variant="outline">Close</Button>
					</DialogClose>
				</div>
			</DialogContent>
		</Dialog>
	);
}
