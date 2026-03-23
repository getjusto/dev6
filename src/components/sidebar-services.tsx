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
import {
	getPendingServiceStatus,
	SERVICE_TOGGLE_LOADING_MS,
	waitForDuration,
} from "@/lib/service-toggle";
import { ServiceStatus } from "./service-status";

function ServiceRow({
	service,
	onToggle,
	onSelect,
}: {
	service: Dev5ServiceStatus;
	onToggle: (service: Dev5ServiceStatus) => void;
	onSelect: (service: Dev5ServiceStatus) => void;
}) {
	const isPending =
		service.status === "loadingOn" || service.status === "loadingOff";

	return (
		<SidebarMenuItem>
			<SidebarMenuButton onClick={() => onSelect(service)}>
				<ServiceStatus status={service.status} />
				<span className="min-w-0 flex-1 truncate font-medium">
					{service.service_name}
				</span>
				<span className="ml-auto shrink-0 font-mono text-muted-foreground text-xs">
					{service.port == null ? "—" : service.port}
				</span>
			</SidebarMenuButton>
			<SidebarMenuAction
				disabled={isPending}
				onClick={() => {
					onToggle(service);
				}}
			>
				{isPending ? (
					<Loader2 className="animate-spin" />
				) : service.status === "off" ? (
					<Power />
				) : service.status === "on" ? (
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
	const [pendingStatuses, setPendingStatuses] = useState<
		Record<string, ReturnType<typeof getPendingServiceStatus>>
	>({});
	const isRefreshingRef = useRef(false);
	const isMountedRef = useRef(true);

	useEffect(() => {
		return () => {
			isMountedRef.current = false;
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

	const displayedServices = services.map((service) => {
		const pendingStatus = pendingStatuses[service.service_name];
		if (!pendingStatus) {
			return service;
		}

		return {
			...service,
			status: pendingStatus,
		};
	});

	async function handleToggle(service: Dev5ServiceStatus) {
		if (pendingStatuses[service.service_name]) {
			return;
		}

		setError(null);

		const pendingStatus =
			service.status === "on"
				? getPendingServiceStatus("stop")
				: getPendingServiceStatus("start");
		const minimumDelay = waitForDuration(SERVICE_TOGGLE_LOADING_MS);

		setPendingStatuses((current) => ({
			...current,
			[service.service_name]: pendingStatus,
		}));

		let toggleError: unknown = null;

		try {
			if (service.status === "on") {
				await window.desktop.stopService(service.service_name);
			} else if (service.status === "off") {
				await window.desktop.startService(service.service_name);
			} else {
				await window.desktop.stopService(service.service_name);
				await new Promise((resolve) => setTimeout(resolve, 1000));
				await window.desktop.startService(service.service_name);
			}
		} catch (error) {
			toggleError = error;
		}

		await minimumDelay;

		if (!isMountedRef.current) {
			return;
		}

		await refreshServices(false);

		if (!isMountedRef.current) {
			return;
		}

		setPendingStatuses((current) => {
			const nextStatuses = { ...current };
			delete nextStatuses[service.service_name];
			return nextStatuses;
		});

		if (toggleError) {
			setError(
				toggleError instanceof Error
					? toggleError.message
					: "Could not change service state.",
			);
		}
	}

	function handleSelect(service: Dev5ServiceStatus) {
		navigate(`/services/${service.service_name}`);
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
						{displayedServices.map((service) => (
							<ServiceRow
								key={`${service.dir_name}:${service.service_name}`}
								service={service}
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
