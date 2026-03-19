import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import {
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuItem,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

function getServiceState(service: Dev5ServiceStatus): "on" | "off" | "error" {
	if (service.status !== "on") {
		return "off";
	}

	if (service.http_error || !service.port_open) {
		return "error";
	}

	if (service.http_status_code != null && service.http_status_code >= 400) {
		return "error";
	}

	return "on";
}

function isServiceTransitioning(service: Dev5ServiceStatus) {
	return service.status === "loadingOn" || service.status === "loadingOff";
}

function ServiceRow({
	service,
	isPending,
	isActive,
	onToggle,
	onSelect,
}: {
	service: Dev5ServiceStatus;
	isPending: boolean;
	isActive: boolean;
	onToggle: (service: Dev5ServiceStatus) => void;
	onSelect: (service: Dev5ServiceStatus) => void;
}) {
	const serviceState = getServiceState(service);
	const isTransitioning = isServiceTransitioning(service) || isPending;
	const isOnline = service.status === "on";

	return (
		<SidebarMenuItem>
			<div
				className={cn(
					"flex h-7.5 cursor-pointer items-center gap-2 rounded-md px-2 text-xs hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
					isActive && "bg-sidebar-accent text-sidebar-accent-foreground",
				)}
				onClick={() => onSelect(service)}
			>
				<button
					type="button"
					aria-label={
						isOnline
							? `Stop ${service.service_name}`
							: `Start ${service.service_name}`
					}
					disabled={isPending}
					onClick={(event) => {
						event.stopPropagation();
						void onToggle(service);
					}}
					className={cn(
						"inline-flex size-5 shrink-0 appearance-none items-center justify-center rounded-full border border-sidebar-border bg-background shadow-none transition-[transform,background-color,border-color] hover:bg-background active:scale-95 disabled:cursor-not-allowed disabled:opacity-50",
					)}
				>
					{isTransitioning ? (
						<Loader2 aria-hidden="true" className="size-3 animate-spin text-amber-500" />
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
				</button>
				<span className="min-w-0 flex-1 truncate text-[13px]">
					{service.service_name}
				</span>
				<span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground">
					{service.port == null ? "—" : service.port}
				</span>
			</div>
		</SidebarMenuItem>
	);
}

export function SidebarServices() {
	const navigate = useNavigate();
	const location = useLocation();
	const [services, setServices] = useState<Dev5ServiceStatus[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [pendingServices, setPendingServices] = useState<string[]>([]);
	const isRefreshingRef = useRef(false);

	async function refreshServices(showLoading: boolean) {
		if (isRefreshingRef.current) {
			return;
		}

		isRefreshingRef.current = true;

		try {
			if (showLoading) {
				setIsLoading(true);
			}

			const nextServices = await window.desktop.getServicesStatus();
			nextServices.sort((left, right) =>
				left.service_name.localeCompare(right.service_name),
			);
			setError(null);
			setServices(nextServices);
		} catch (loadError) {
			setError(
				loadError instanceof Error
					? loadError.message
					: "Could not load services.",
			);
		} finally {
			isRefreshingRef.current = false;
			setIsLoading(false);
		}
	}

	useEffect(() => {
		let cancelled = false;

		void refreshServices(true);
		const intervalId = window.setInterval(() => {
			if (!cancelled) {
				void refreshServices(false);
			}
		}, 5000);

		return () => {
			cancelled = true;
			window.clearInterval(intervalId);
		};
	}, []);

	async function handleToggle(service: Dev5ServiceStatus) {
		try {
			setPendingServices((current) => [...current, service.service_name]);

			if (service.status === "on") {
				await window.desktop.stopService(service.service_name);
			} else {
				await window.desktop.startService(service.service_name);
			}

			await refreshServices(false);
		} catch (toggleError) {
			setError(
				toggleError instanceof Error
					? toggleError.message
					: "Could not change service state.",
			);
		} finally {
			setPendingServices((current) =>
				current.filter((name) => name !== service.service_name),
			);
		}
	}

	function handleSelect(service: Dev5ServiceStatus) {
		navigate(`/services/${service.service_name}`);
	}

	const onlineCount = services.filter(
		(service) => service.status === "on",
	).length;

	return (
		<SidebarGroup className="px-2">
			<SidebarGroupLabel>
				Available Services
				{!isLoading && !error ? (
					<span className="ml-auto text-[10px] text-muted-foreground">
						{onlineCount}/{services.length} on
					</span>
				) : null}
			</SidebarGroupLabel>
			<SidebarGroupContent>
				{isLoading ? (
					<div className="px-2 py-1 text-xs text-muted-foreground">
						Loading services…
					</div>
				) : error ? (
					<div className="px-2 py-1 text-xs text-destructive">{error}</div>
				) : (
					<SidebarMenu className="pb-2">
						{services.map((service) => (
							<ServiceRow
								key={`${service.dir_name}:${service.service_name}`}
								service={service}
								isPending={pendingServices.includes(service.service_name)}
								isActive={
									location.pathname === `/services/${service.service_name}`
								}
								onToggle={handleToggle}
								onSelect={handleSelect}
							/>
						))}
					</SidebarMenu>
				)}
			</SidebarGroupContent>
		</SidebarGroup>
	);
}
