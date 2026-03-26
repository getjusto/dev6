import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { TerminalSessionView } from "@/components/terminal-session-view";
import { useTerminalSessions } from "@/hooks/use-terminal-sessions";

export default function TerminalsPage() {
	const navigate = useNavigate();
	const { terminalId } = useParams();
	const { sessions, isLoading } = useTerminalSessions();
	const activeSession = terminalId
		? (sessions.find((session) => session.id === terminalId) ?? null)
		: null;

	useEffect(() => {
		if (isLoading) {
			return;
		}

		if (!terminalId && sessions.length > 0) {
			navigate(`/terminals/${sessions[0].id}`, { replace: true });
			return;
		}

		if (terminalId && !activeSession) {
			navigate(sessions[0] ? `/terminals/${sessions[0].id}` : "/terminals", {
				replace: true,
			});
		}
	}, [activeSession, isLoading, navigate, sessions, terminalId]);

	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-hidden p-2">
			{!isLoading && sessions.length === 0 ? null : activeSession ? (
				<div className="flex min-h-0 flex-1 overflow-hidden bg-background">
					<TerminalSessionView
						key={activeSession.id}
						sessionId={activeSession.id}
						appKind={activeSession.appKind}
						active
					/>
				</div>
			) : (
				<div className="flex min-h-0 flex-1 items-center justify-center rounded-xl bg-muted/10 p-8 text-sm text-muted-foreground">
					Select an open session or create a new one.
				</div>
			)}
		</div>
	);
}
