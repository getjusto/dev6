import { Loader2, Power, PowerOff, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuAction,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";
import { SERVICE_TOGGLE_LOADING_MS } from "@/lib/service-toggle";
import { getStableServiceStatus } from "@/lib/services";
import { ServiceStatus } from "./service-status";

function ServiceRow({
	service,
	isPending,
	isBusy,
	onToggle,
	onSelect,
}: {
	service: Dev5ServiceStatus;
	isPending: boolean;
	isBusy: boolean;
	onToggle: (service: Dev5ServiceStatus) => void;
	onSelect: (service: Dev5ServiceStatus) => void;
}) {
	const stableStatus = getStableServiceStatus(service);

	return (
		<SidebarMenuItem>
			<SidebarMenuButton onClick={() => onSelect(service)}>
				<ServiceStatus status={stableStatus} isPending={isPending} />
				<span className="min-w-0 flex-1 truncate font-medium">
					{service.dir_name}
				</span>
				<span className="ml-auto shrink-0 font-mono text-muted-foreground text-xs">
					{service.port == null ? "—" : service.port}
				</span>
			</SidebarMenuButton>
			<SidebarMenuAction
				disabled={isBusy}
				onClick={() => {
					onToggle(service);
				}}
			>
				{isPending ? (
					<Loader2 className="animate-spin" />
				) : stableStatus === "off" ? (
					<Power />
				) : stableStatus === "on" ? (
					<PowerOff />
				) : (
					<RotateCcw />
				)}
			</SidebarMenuAction>
		</SidebarMenuItem>
	);
}

export function SidebarServices() {
	const navigate = useNavigate();
	const [services, setServices] = useState<Dev5ServiceStatus[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [pendingUntilByService, setPendingUntilByService] = useState<
		Record<string, number>
	>({});
	const [busyServices, setBusyServices] = useState<Record<string, boolean>>({});
	const [now, setNow] = useState(() => Date.now());
	const isRefreshingRef = useRef(false);
	const isMountedRef = useRef(true);

	useEffect(() => {
		return () => {
			isMountedRef.current = false;
		};
	}, []);

	useEffect(() => {
		const intervalId = window.setInterval(() => {
			setNow(Date.now());
		}, 250);

		return () => {
			window.clearInterval(intervalId);
		};
	}, []);

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
			nextServices.sort((left, right) => left.dir_name.localeCompare(right.dir_name));
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
		const serviceName = service.service_name;
		const isPending = (pendingUntilByService[serviceName] ?? 0) > now;

		if (busyServices[serviceName] || isPending) {
			return;
		}

		setError(null);
		const stableStatus = getStableServiceStatus(service);

		setBusyServices((current) => ({
			...current,
			[serviceName]: true,
		}));
		setPendingUntilByService((current) => ({
			...current,
			[serviceName]: Date.now() + SERVICE_TOGGLE_LOADING_MS,
		}));

		let toggleError: unknown = null;

		try {
			if (service.status === "error") {
				await window.desktop.stopService(serviceName);
				await new Promise((resolve) => setTimeout(resolve, 1000));
				await window.desktop.startService(serviceName);
			} else if (stableStatus === "on") {
				await window.desktop.stopService(serviceName);
			} else {
				await window.desktop.startService(serviceName);
			}
		} catch (error) {
			toggleError = error;
		} finally {
			if (isMountedRef.current) {
				setBusyServices((current) => {
					const next = { ...current };
					delete next[serviceName];
					return next;
				});

				void refreshServices(false);

				if (toggleError) {
					setError(
						toggleError instanceof Error
							? toggleError.message
							: "Could not change service state.",
					);
				}
			}
		}
	}

	function handleSelect(service: Dev5ServiceStatus) {
		navigate(`/services/${encodeURIComponent(service.service_name)}`);
	}

	return (
		<SidebarGroup className="px-2">
			<SidebarGroupLabel>Services</SidebarGroupLabel>
			<SidebarGroupContent>
				{isLoading ? (
					<div className="px-2 py-1 text-xs text-muted-foreground">
						Loading services…
					</div>
				) : error ? (
					<div className="px-2 py-1 text-xs text-destructive">{error}</div>
				) : (
					<SidebarMenu className="pb-2">
						{services.map((service) => {
							const isPending =
								(pendingUntilByService[service.service_name] ?? 0) > now;

							return (
								<ServiceRow
									key={`${service.dir_name}:${service.service_name}`}
									service={service}
									isPending={isPending}
									isBusy={Boolean(busyServices[service.service_name]) || isPending}
									onToggle={handleToggle}
									onSelect={handleSelect}
								/>
							);
						})}
					</SidebarMenu>
				)}
			</SidebarGroupContent>
		</SidebarGroup>
	);
}
