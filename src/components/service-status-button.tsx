import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ServiceStatusButtonProps = {
	serviceName: string;
	isOnline: boolean;
	isPending: boolean;
	serviceState: "on" | "off" | "error" | "loadingOn" | "loadingOff";
	onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
};

export function ServiceStatusButton({
	serviceName,
	isOnline,
	isPending,
	serviceState,
	onClick,
}: ServiceStatusButtonProps) {
	const isTransitioning =
		serviceState === "loadingOn" || serviceState === "loadingOff";
	return (
		<Button
			type="button"
			aria-label={isOnline ? `Stop ${serviceName}` : `Start ${serviceName}`}
			variant="outline"
			size="icon-xs"
			disabled={isPending}
			onClick={onClick}
			className="rounded-full"
		>
			{isTransitioning ? (
				<Loader2
					aria-hidden="true"
					className="size-3 animate-spin text-amber-500"
				/>
			) : (
				<span
					aria-hidden="true"
					className={cn(
						"size-2 rounded-full",
						serviceState === "on" && "bg-emerald-500",
						serviceState === "off" && "bg-muted-foreground/45",
						serviceState === "error" && "bg-red-500",
					)}
				/>
			)}
		</Button>
	);
}
