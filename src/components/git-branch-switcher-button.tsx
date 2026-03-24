import { GitBranch } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";

type GitBranchSwitcherButtonProps = {
	currentBranch: string | null;
	onClick: () => void;
	disabled?: boolean;
};

export function GitBranchSwitcherButton({
	currentBranch,
	onClick,
	disabled = false,
}: GitBranchSwitcherButtonProps) {
	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						type="button"
						size="icon-sm"
						variant="ghost"
						onClick={onClick}
						disabled={disabled}
						aria-label="Change branch"
					>
						<GitBranch />
					</Button>
				</TooltipTrigger>
				<TooltipContent sideOffset={6}>
					{currentBranch ? `Branch: ${currentBranch}` : "Change branch"}
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}
