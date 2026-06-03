import { CircleAlert, Loader2, Power, PowerOff, RotateCcw } from "lucide-react";
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
import { useServicesStatus } from "@/hooks/use-services-status";
import {
	SERVICE_TOGGLE_LOADING_MS,
	type ServiceToggleAction,
} from "@/lib/service-toggle";
import { getStableServiceStatus } from "@/lib/services";
import { ServiceStatus } from "./service-status";

type ServiceActionError = {
	message: string;
};

function getServiceToggleAction(
	service: Dev5ServiceStatus,
	stableStatus: ReturnType<typeof getStableServiceStatus>,
): ServiceToggleAction {
	if (service.status === "error") {
		return "restart";
	}

	if (stableStatus === "on") {
		return "stop";
	}

	return "start";
}

function getActionErrorMessage(
	action: ServiceToggleAction,
	service: Dev5ServiceStatus,
) {
	return `Could not ${action} ${service.dir_name}. Check logs.`;
}

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
	const { services, isLoading, error: statusError } = useServicesStatus();
	const [actionError, setActionError] = useState<ServiceActionError | null>(
		null,
	);
	const [pendingUntilByService, setPendingUntilByService] = useState<
		Record<string, number>
	>({});
	const [busyServices, setBusyServices] = useState<Record<string, boolean>>({});
	const [now, setNow] = useState(() => Date.now());
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

	useEffect(() => {
		if (!actionError) {
			return;
		}

		const timeoutId = window.setTimeout(() => {
			setActionError(null);
		}, 6000);

		return () => {
			window.clearTimeout(timeoutId);
		};
	}, [actionError]);

	async function handleToggle(service: Dev5ServiceStatus) {
		const serviceName = service.service_name;
		const isPending = (pendingUntilByService[serviceName] ?? 0) > now;

		if (busyServices[serviceName] || isPending) {
			return;
		}

		setActionError(null);
		const stableStatus = getStableServiceStatus(service);
		const action = getServiceToggleAction(service, stableStatus);

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
			if (action === "restart") {
				await window.desktop.restartService(serviceName);
			} else if (action === "stop") {
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

				if (toggleError) {
					setActionError({
						message: getActionErrorMessage(action, service),
					});
				}
			}
		}
	}

	function handleSelect(service: Dev5ServiceStatus) {
		setActionError(null);
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
				) : statusError ? (
					<div className="px-2 py-1 text-xs text-destructive">
						{statusError}
					</div>
				) : (
					<>
						{actionError ? (
							<div
								aria-live="polite"
								role="status"
								className="mb-1 flex min-w-0 items-start gap-1.5 rounded-md px-2 py-1 text-destructive text-xs"
							>
								<CircleAlert aria-hidden="true" className="mt-0.5 shrink-0" />
								<span className="min-w-0 truncate" title={actionError.message}>
									{actionError.message}
								</span>
							</div>
						) : null}
						<SidebarMenu className="pb-2">
							{services.map((service) => {
								const isPending =
									(pendingUntilByService[service.service_name] ?? 0) > now;

								return (
									<ServiceRow
										key={`${service.dir_name}:${service.service_name}`}
										service={service}
										isPending={isPending}
										isBusy={
											Boolean(busyServices[service.service_name]) || isPending
										}
										onToggle={handleToggle}
										onSelect={handleSelect}
									/>
								);
							})}
						</SidebarMenu>
					</>
				)}
			</SidebarGroupContent>
		</SidebarGroup>
	);
}
