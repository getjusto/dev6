import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { StableServiceStatus } from "@/lib/services";

type ServiceStatusProps = {
	status: StableServiceStatus;
	isPending?: boolean;
};

export function ServiceStatus({ status, isPending = false }: ServiceStatusProps) {
	if (isPending) {
		return (
			<Loader2
				aria-hidden="true"
				className="size-3 animate-spin text-amber-500"
			/>
		);
	}
	return (
		<span
			aria-hidden="true"
			className={cn(
				"size-2 rounded-full",
				status === "on" && "bg-emerald-500",
				status === "off" && "bg-muted-foreground/45",
				status === "error" && "bg-red-500",
			)}
		/>
	);
}
