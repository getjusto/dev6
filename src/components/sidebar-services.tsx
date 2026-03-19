import { Plus, Power, PowerOff, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ServiceStatusButton } from "@/components/service-status-button";
import {
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuAction,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";
import { ServiceStatus } from "./service-status";

function ServiceRow({
	service,
	onToggle,
	onSelect,
}: {
	service: Dev5ServiceStatus;
	isPending: boolean;
	isActive: boolean;
	onToggle: (service: Dev5ServiceStatus) => void;
	onSelect: (service: Dev5ServiceStatus) => void;
}) {
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
				onClick={() => {
					onToggle(service);
				}}
			>
				{service.status === "off" ? (
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
			} else if (service.status === "off") {
				await window.desktop.startService(service.service_name);
			} else {
				await window.desktop.stopService(service.service_name);
				await new Promise((resolve) => setTimeout(resolve, 1000));
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
