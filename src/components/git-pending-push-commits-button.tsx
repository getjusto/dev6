import { Button } from "@/components/ui/button";

type GitPendingPushCommitsButtonProps = {
	count: number;
	onClick: () => void;
	disabled?: boolean;
};

export function GitPendingPushCommitsButton({
	count,
	onClick,
	disabled = false,
}: GitPendingPushCommitsButtonProps) {
	return (
		<Button
			type="button"
			size="sm"
			variant="ghost"
			onClick={onClick}
			disabled={disabled}
			aria-label="View pending push commits"
			title={`View ${count} pending push commit${count === 1 ? "" : "s"}`}
			className="min-w-8 px-2 tabular-nums"
		>
			{count}
		</Button>
	);
}
